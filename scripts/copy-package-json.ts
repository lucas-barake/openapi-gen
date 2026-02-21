import { NodeFileSystem } from "@effect/platform-node"
import { Effect } from "effect"
import * as FileSystem from "effect/FileSystem"
import * as path from "node:path"

const pathTo = path.join("dist", "package.json")

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  console.log(`copying package.json to ${pathTo}...`)
  const content = yield* fs.readFileString("package.json")
  const json = JSON.parse(content)
  const trimmed = {
    name: json.name,
    version: json.version,
    description: json.description,
    type: "module",
    bin: "main.js",
    repository: json.repository,
    author: json.author,
    license: json.license,
    keywords: json.keywords,
    dependencies: json.dependencies
  }
  yield* fs.writeFileString(pathTo, JSON.stringify(trimmed, null, 2))
}).pipe(Effect.provide(NodeFileSystem.layer))

Effect.runPromise(program)
