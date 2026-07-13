import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"

export const docs = defineDocs({
  dir: "content/docs",
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // Fall back to the TypeScript grammar for any code fence whose language
      // Shiki doesn't bundle, so those blocks render instead of failing the build.
      fallbackLanguage: "typescript",
    },
  },
})
