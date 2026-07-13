# Editor support

Vibe apps are **plain TypeScript** (`.ts`) — there is no `.vibe` file type or
Vibe-specific language server. Use your editor's normal TypeScript support:
diagnostics, hover, go-to-definition, autocomplete, and formatting all work out of
the box via the TypeScript language service.

- **VS Code / Cursor**: built-in TypeScript support.
- **Neovim / Helix / Zed / Emacs / Sublime**: any TypeScript LSP (`typescript-language-server`).
- **Formatting/linting**: Biome (see the repo's `biome.json`).

The framework's types make agents and tools typesafe by default — see
[`cookbooks/`](../cookbooks) and [`examples/`](../examples).
