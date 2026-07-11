import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"

export const docs = defineDocs({
  dir: "content/docs",
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // `.vibe` is a TypeScript superset with no Shiki grammar yet (nor does
      // `ebnf`, used in spec docs). Fall back to the TypeScript grammar for any
      // unbundled language so ```vibe fences render instead of failing the build.
      fallbackLanguage: "typescript",
    },
  },
})
