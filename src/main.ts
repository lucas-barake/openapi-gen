import * as CliConfig from "@effect/cli/CliConfig"
import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { OpenApi } from "./OpenApi.js"

const spec = Options.fileParse("spec").pipe(
  Options.withAlias("s"),
  Options.withDescription("The OpenAPI spec file to generate the client from")
)

const name = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription("The name of the generated client"),
  Options.withDefault("Client")
)

const root = Command.make("openapigen", { spec, name }).pipe(
  Command.withHandler(({ spec, name }) =>
    OpenApi.generate(spec as any, { name }).pipe(
      Effect.flatMap(Console.log)
    )
  )
)

const run = Command.run(root, {
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
