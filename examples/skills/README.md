# skills

Two kinds of skill with `@vibe/skills`, unified so an agent consumes both as tools:

- **code** — `defineSkill`: a typed, validated handler (a tool) plus discovery
  metadata (tags, examples).
- **procedure** — `loadMarkdownSkill`: a markdown playbook (frontmatter + body)
  whose handler returns the body, so the full checklist enters context only when the
  model elects to use it (progressive disclosure).

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/skills start
```

Skills passed to `vibe.system({ skills: [...] })` are registered into the tool
registry, so the system's default agent can call them with no extra wiring.
