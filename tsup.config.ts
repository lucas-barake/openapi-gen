import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  clean: true,
  publicDir: true,
  banner: {
    js: "#!/usr/bin/env node"
  },
  treeshake: "smallest",
  external: ["swagger2openapi"]
})
