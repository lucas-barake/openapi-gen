import * as CliConfig from "@effect/cli/CliConfig"
import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { OpenApi } from "./OpenApi.js"
import { identifier, toKebabCase } from "./Utils.js"

const specOption = Options.fileParse("spec").pipe(
  Options.withAlias("s"),
  Options.withDescription("The OpenAPI spec file")
)

const nameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription("The name of the generated client"),
  Options.withDefault("Client")
)

const outdirOption = Options.text("outdir").pipe(
  Options.withAlias("o"),
  Options.withDescription("Output directory for generated files"),
  Options.withDefault(".")
)

const syncCommand = Command.make(
  "sync",
  { spec: specOption, name: nameOption, outdir: outdirOption },
  ({ spec, name, outdir }) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const api = yield* OpenApi
      const result = yield* api.generate(spec as any, { name })

      yield* fs.makeDirectory(outdir, { recursive: true })

      const barrelExports: Array<string> = []

      for (const [tag, mod] of result.modules) {
        const filename = `${toKebabCase(tag)}.ts`
        const fullPath = path.join(outdir, filename)
        yield* fs.writeFileString(fullPath, mod.source)
        yield* Console.log(`[generated] ${filename}`)

        if (tag !== "_common") {
          barrelExports.push(
            `export * as Generated${identifier(tag)}Api from "./${toKebabCase(tag)}.js"`
          )
        }
      }

      const barrelContent = barrelExports.join("\n") + "\n"
      yield* fs.writeFileString(path.join(outdir, "index.ts"), barrelContent)
      yield* Console.log("[generated] index.ts")
    })
).pipe(Command.withDescription("Generate typed client from an OpenAPI spec"))

const openapigen = Command.make("openapigen").pipe(
  Command.withSubcommands([syncCommand])
)

const run = Command.run(openapigen, {
  name: "openapigen",
  version: "0.0.0"
})

const Env = Layer.mergeAll(
  NodeContext.layer,
  OpenApi.Live,
  CliConfig.layer({
    showBuiltIns: false
  })
)

run(process.argv).pipe(Effect.provide(Env), NodeRuntime.runMain)
