import { defineConfig } from "vite"

const external = (id) => id.startsWith("node:")

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig({
  build: {
    target: "node20",
    lib: {
      entry: {
        index: "src/index.ts",
      },
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external,
      output: {
        entryFileNames: (chunk, format) => `${chunk.name}.${format === "es" ? "js" : "cjs"}`,
        chunkFileNames: "chunk-[name].[format].js",
        exports: "named",
      },
    },
  },
})
