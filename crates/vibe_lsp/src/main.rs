//! The Vibe language server (`vibe-lsp`), built on `tower-lsp`.
//!
//! The protocol handlers are thin adapters over the pure, unit-tested functions in
//! [`features`] — the same compiler front end the CLI uses, so editor and
//! `vibe check` diagnostics never disagree. See `docs/language/03-toolchain.md`.
#![forbid(unsafe_code)]

mod features;

use std::collections::HashMap;
use std::sync::Mutex;

use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

struct Backend {
    client: Client,
    docs: Mutex<HashMap<Url, String>>,
}

impl Backend {
    fn text(&self, uri: &Url) -> Option<String> {
        self.docs.lock().unwrap().get(uri).cloned()
    }

    async fn publish(&self, uri: Url) {
        let Some(src) = self.text(&uri) else { return };
        let diags = features::diagnostics(&src)
            .into_iter()
            .map(to_lsp_diagnostic)
            .collect();
        self.client.publish_diagnostics(uri, diags, None).await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "vibe-lsp".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions::default()),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                document_formatting_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
        })
    }

    async fn initialized(&self, _: InitializedParams) {}

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let doc = params.text_document;
        self.docs.lock().unwrap().insert(doc.uri.clone(), doc.text);
        self.publish(doc.uri).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.into_iter().last() {
            let uri = params.text_document.uri;
            self.docs.lock().unwrap().insert(uri.clone(), change.text);
            self.publish(uri).await;
        }
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let tdp = params.text_document_position;
        let Some(src) = self.text(&tdp.text_document.uri) else {
            return Ok(None);
        };
        let offset = offset_at(&src, tdp.position) as usize;
        let items = features::completions(&src, offset)
            .into_iter()
            .map(|c| CompletionItem {
                label: c.label,
                kind: Some(match c.kind {
                    features::CompletionKind::Keyword => CompletionItemKind::KEYWORD,
                    features::CompletionKind::Model => CompletionItemKind::ENUM_MEMBER,
                    features::CompletionKind::Symbol => CompletionItemKind::FUNCTION,
                }),
                ..Default::default()
            })
            .collect();
        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let tdp = params.text_document_position_params;
        let Some(src) = self.text(&tdp.text_document.uri) else {
            return Ok(None);
        };
        let offset = offset_at(&src, tdp.position) as usize;
        Ok(features::hover(&src, offset).map(|value| Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value,
            }),
            range: None,
        }))
    }

    async fn goto_definition(
        &self,
        params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
        let tdp = params.text_document_position_params;
        let uri = tdp.text_document.uri;
        let Some(src) = self.text(&uri) else {
            return Ok(None);
        };
        let offset = offset_at(&src, tdp.position) as usize;
        Ok(features::goto_definition(&src, offset).map(|r| {
            GotoDefinitionResponse::Scalar(Location {
                uri,
                range: to_lsp_range(r),
            })
        }))
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let Some(src) = self.text(&params.text_document.uri) else {
            return Ok(None);
        };
        let formatted = vibe_fmt::format(&src);
        if formatted == src {
            return Ok(Some(vec![]));
        }
        let sf = vibe_span::SourceFile::new(vibe_span::SourceId(0), "file.vibe", &src);
        let end = sf.location(src.len() as u32);
        Ok(Some(vec![TextEdit {
            range: Range {
                start: Position {
                    line: 0,
                    character: 0,
                },
                end: Position {
                    line: end.line - 1,
                    character: end.col - 1,
                },
            },
            new_text: formatted,
        }]))
    }
}

fn offset_at(src: &str, position: Position) -> u32 {
    let sf = vibe_span::SourceFile::new(vibe_span::SourceId(0), "file.vibe", src);
    sf.offset_at(position.line, position.character)
}

fn to_lsp_position(p: features::Pos) -> Position {
    Position {
        line: p.line,
        character: p.col,
    }
}

fn to_lsp_range(r: features::Range) -> Range {
    Range {
        start: to_lsp_position(r.start),
        end: to_lsp_position(r.end),
    }
}

fn to_lsp_diagnostic(d: features::Diag) -> Diagnostic {
    Diagnostic {
        range: to_lsp_range(d.range),
        severity: Some(match d.severity {
            features::Sev::Error => DiagnosticSeverity::ERROR,
            features::Sev::Warning => DiagnosticSeverity::WARNING,
            features::Sev::Info => DiagnosticSeverity::INFORMATION,
        }),
        code: Some(NumberOrString::String(d.code)),
        source: Some("vibe".to_string()),
        message: d.message,
        ..Default::default()
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let (service, socket) = LspService::new(|client| Backend {
        client,
        docs: Mutex::new(HashMap::new()),
    });
    Server::new(stdin, stdout, socket).serve(service).await;
}

#[cfg(test)]
mod tests;
