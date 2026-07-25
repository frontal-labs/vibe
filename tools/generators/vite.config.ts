import { defineConfig } from "vite"
import { createBaseViteConfig } from "../../tools/vite-utils"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
