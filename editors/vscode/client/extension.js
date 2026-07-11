// Minimal VS Code LSP client: launches the `vibe-lsp` binary over stdio.
const { workspace } = require("vscode")
const { LanguageClient, TransportKind } = require("vscode-languageclient/node")

let client

function serverPath() {
  // Prefer an explicit setting, else expect `vibe-lsp` on PATH (or the prebuilt
  // binary shipped with the extension).
  return workspace.getConfiguration("vibe").get("lspPath") || "vibe-lsp"
}

function activate(context) {
  const run = { command: serverPath(), transport: TransportKind.stdio }
  client = new LanguageClient(
    "vibe",
    "Vibe Language Server",
    { run, debug: run },
    { documentSelector: [{ scheme: "file", language: "vibe" }] },
  )
  context.subscriptions.push(client.start())
}

function deactivate() {
  return client ? client.stop() : undefined
}

module.exports = { activate, deactivate }
