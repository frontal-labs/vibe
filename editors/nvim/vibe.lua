-- Minimal Neovim integration for the Vibe language.
-- Registers the `vibe` filetype and starts the `vibe-lsp` server over stdio.
-- Requires `neovim/nvim-lspconfig`.
local M = {}

function M.setup(opts)
  opts = opts or {}
  local cmd = opts.cmd or { "vibe-lsp" }

  vim.filetype.add({ extension = { vibe = "vibe" } })

  local configs = require("lspconfig.configs")
  local lspconfig = require("lspconfig")

  if not configs.vibe then
    configs.vibe = {
      default_config = {
        cmd = cmd,
        filetypes = { "vibe" },
        root_dir = lspconfig.util.root_pattern("vibe.config.ts", "turbo.json", ".git"),
        single_file_support = true,
      },
      docs = { description = "The Vibe language server (vibe-lsp)." },
    }
  end

  lspconfig.vibe.setup(opts.server or {})
end

return M
