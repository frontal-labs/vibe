//! Diagnostics: `VBxxxx` codes, severities, and source-anchored messages.
#![forbid(unsafe_code)]

use vibe_span::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// A machine-readable Vibe diagnostic code, rendered as `VB2001`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VbCode(pub u16);

impl VbCode {
    pub fn render(&self) -> String {
        format!("VB{:04}", self.0)
    }
}

/// Diagnostic codes, banded by compiler phase: `VB1xxx` lexer, `VB20xx` parser,
/// `VB21xx`–`VB23xx` checker (see `docs/language/02-compiler.md#diagnostics`).
pub mod codes {
    use super::VbCode;

    // Lexer (VB10xx)
    pub const UNTERMINATED_STRING: VbCode = VbCode(1001);
    pub const UNTERMINATED_BLOCK_COMMENT: VbCode = VbCode(1002);
    pub const UNBALANCED_DELIMITER: VbCode = VbCode(1003);
    pub const UNEXPECTED_CHAR: VbCode = VbCode(1004);

    // Parser (VB20xx)
    pub const EXPECTED_TOKEN: VbCode = VbCode(2000);
    pub const UNEXPECTED_TOKEN: VbCode = VbCode(2002);
    pub const EXPECTED_DECL: VbCode = VbCode(2003);

    // Checker (VB2001 + VB21xx/VB22xx/VB23xx + VB3xxx warnings)
    pub const UNKNOWN_MODEL: VbCode = VbCode(2001);
    pub const UNRESOLVED_USE: VbCode = VbCode(2100);
    pub const USE_CYCLE: VbCode = VbCode(2101);
    pub const DUPLICATE_DECL: VbCode = VbCode(2102);
    pub const MULTIPLE_CONFIG: VbCode = VbCode(2200);
    pub const UNSUPPORTED_TOOL_TYPE: VbCode = VbCode(2300);
    pub const DEAD_TOOL: VbCode = VbCode(3010);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: VbCode,
    pub severity: Severity,
    pub span: Span,
    pub message: String,
    pub help: Option<String>,
    /// A non-Vibe code to display instead of `code` (e.g. a `TSxxxx` from a
    /// re-anchored TypeScript diagnostic). See the R6 `tsc` integration.
    pub external_code: Option<String>,
}

impl Diagnostic {
    pub fn error(code: VbCode, span: Span, message: impl Into<String>) -> Self {
        Self {
            code,
            severity: Severity::Error,
            span,
            message: message.into(),
            help: None,
            external_code: None,
        }
    }

    pub fn warning(code: VbCode, span: Span, message: impl Into<String>) -> Self {
        Self {
            code,
            severity: Severity::Warning,
            span,
            message: message.into(),
            help: None,
            external_code: None,
        }
    }

    pub fn with_help(mut self, help: impl Into<String>) -> Self {
        self.help = Some(help.into());
        self
    }

    pub fn with_external_code(mut self, code: impl Into<String>) -> Self {
        self.external_code = Some(code.into());
        self
    }

    /// The code as displayed: the external code if set, else the `VBxxxx` code.
    pub fn display_code(&self) -> String {
        self.external_code
            .clone()
            .unwrap_or_else(|| self.code.render())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_render() {
        assert_eq!(VbCode(2001).render(), "VB2001");
        assert_eq!(codes::UNTERMINATED_STRING.render(), "VB1001");
    }

    #[test]
    fn builder_sets_fields() {
        let d = Diagnostic::error(codes::UNEXPECTED_CHAR, Span::new(1, 2), "bad char")
            .with_help("remove it");
        assert_eq!(d.severity, Severity::Error);
        assert_eq!(d.help.as_deref(), Some("remove it"));
    }
}
