import Handlebars from "handlebars"

/** Compile and render one Handlebars template. HTML-escaping is off (we emit code). */
export function renderTemplate(source: string, data: Record<string, unknown>): string {
  return Handlebars.compile(source, { noEscape: true })(data)
}

/**
 * Render a tree of `{ path: templateSource }` entries. Both the path and the
 * content are treated as templates, and a trailing `.hbs` is stripped from the
 * output path — so `src/{{name}}.ts.hbs` becomes `src/agent.ts`.
 */
export function renderTree(
  files: Record<string, string>,
  data: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, source] of Object.entries(files)) {
    const outPath = renderTemplate(path, data).replace(/\.hbs$/, "")
    out[outPath] = renderTemplate(source, data)
  }
  return out
}
