import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { Command, Flag } from "effect/unstable/cli"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Yaml from "yaml"
import { OpenApi } from "./OpenApi.js"
import { identifier, toKebabCase } from "./Utils.js"

const specFlag = Flag.fileParse("spec").pipe(
  Flag.withAlias("s"),
  Flag.withDescription("The OpenAPI spec file"),
  Flag.optional
)

const urlFlag = Flag.string("url").pipe(
  Flag.withAlias("u"),
  Flag.withDescription("URL to a remote OpenAPI spec (JSON or YAML)"),
  Flag.optional
)

const fetchSpec = (url: string) =>
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(HttpClientRequest.get(url))
    const text = yield* response.text

    const isYaml = url.endsWith(".yaml") || url.endsWith(".yml") ||
      response.headers["content-type"]?.includes("yaml")

    return isYaml ? Yaml.parse(text) : JSON.parse(text)
  }).pipe(Effect.scoped)

const nameFlag = Flag.string("name").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("The name of the generated client"),
  Flag.withDefault("Client")
)

const outdirFlag = Flag.string("outdir").pipe(
  Flag.withAlias("o"),
  Flag.withDescription("Output directory for generated files"),
  Flag.withDefault(".")
)

const extFlag = Flag.string("ext").pipe(
  Flag.withAlias("e"),
  Flag.withDescription("Import extension for generated files (.js, .ts, or empty)"),
  Flag.withDefault(".js")
)

const syncCommand = Command.make(
  "sync",
  { spec: specFlag, url: urlFlag, name: nameFlag, outdir: outdirFlag, ext: extFlag },
  ({ spec: specOpt, url: urlOpt, name, outdir, ext }) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const api = yield* OpenApi

      if (Option.isSome(specOpt) && Option.isSome(urlOpt)) {
        return yield* Effect.fail("Cannot provide both --spec and --url" as const)
      }
      if (Option.isNone(specOpt) && Option.isNone(urlOpt)) {
        return yield* Effect.fail("Must provide either --spec or --url" as const)
      }

      const spec = Option.isSome(specOpt)
        ? specOpt.value
        : yield* fetchSpec(Option.getOrThrow(urlOpt))

      const result = yield* api.generate(spec as any, { name, ext })

      yield* fs.makeDirectory(outdir, { recursive: true })

      const barrelExports: Array<string> = []

      for (const [tag, mod] of result.modules) {
        const basename = tag === "_common" ? "_common" : toKebabCase(tag)
        const filename = `${basename}.ts`
        const fullPath = path.join(outdir, filename)
        yield* fs.writeFileString(fullPath, mod.source)
        yield* Console.log(`[generated] ${filename}`)

        if (tag !== "_common") {
          barrelExports.push(
            `export * as Generated${identifier(tag)}Api from "./${basename}${ext}"`
          )
        }
      }

      const barrelContent = barrelExports.join("\n") + "\n"
      yield* fs.writeFileString(path.join(outdir, "index.ts"), barrelContent)
      yield* Console.log("[generated] index.ts")
    })
).pipe(Command.withDescription("Generate typed client from an OpenAPI spec"))

export const openapigen = Command.make("openapigen").pipe(
  Command.withSubcommands([syncCommand])
)

export const run = Command.runWith(openapigen, {
  version: "0.0.0"
})

const Env = Layer.mergeAll(
  NodeServices.layer,
  NodeHttpClient.layerUndici,
  OpenApi.Live
)

run(process.argv.slice(2)).pipe(Effect.provide(Env), NodeRuntime.runMain)
