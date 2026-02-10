import * as NodeContext from "@effect/platform-node/NodeContext"
import * as FileSystem from "@effect/platform/FileSystem"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import * as Path from "@effect/platform/Path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { run } from "../src/main.js"
import { OpenApi } from "../src/OpenApi.js"

const petStoreSpec = {
  openapi: "3.0.0",
  info: { title: "Pet Store", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        tags: ["pets"],
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } }
              }
            }
          }
        }
      },
      post: {
        operationId: "createPet",
        tags: ["pets"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" } }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" }
              }
            }
          },
          "400": {
            description: "Bad request",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: { message: { type: "string" } }
                }
              }
            }
          }
        }
      }
    },
    "/users": {
      get: {
        operationId: "listUsers",
        tags: ["users"],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" }
        }
      }
    }
  }
}

const MockHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(petStoreSpec), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    )
  )
)

const TestEnv = Layer.mergeAll(
  NodeContext.layer,
  OpenApi.Live,
  MockHttpClient
)

describe("CLI integration", () => {
  it.scoped("sync generates per-tag files and barrel index", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const specPath = path.join(tmpDir, "spec.json")
      const outDir = path.join(tmpDir, "generated")

      yield* fs.writeFileString(specPath, JSON.stringify(petStoreSpec))

      yield* run([
        "node",
        "openapigen.js",
        "sync",
        "--spec",
        specPath,
        "--name",
        "PetStore",
        "--outdir",
        outDir
      ])

      const files = yield* fs.readDirectory(outDir)
      expect(files).toContain("index.ts")
      expect(files).toContain("pets.ts")
      expect(files).toContain("users.ts")

      const barrel = yield* fs.readFileString(path.join(outDir, "index.ts"))
      expect(barrel).toContain("export * as GeneratedPetsApi from \"./pets.js\"")
      expect(barrel).toContain("export * as GeneratedUsersApi from \"./users.js\"")

      const petsSource = yield* fs.readFileString(path.join(outDir, "pets.ts"))
      expect(petsSource).toContain("export class Pet extends Schema.Class")
      expect(petsSource).toContain("export const make")
      expect(petsSource).toContain("export interface PetStore")
      expect(petsSource).toContain("HttpClientRequest.schemaBodyJson(CreatePetRequest)(options.payload)")
      expect(petsSource).toContain("HttpClientRequest.get(`/pets`)")
      expect(petsSource).toContain("HttpClientRequest.post(`/pets`)")
      expect(petsSource).toContain("const CreatePet400Body = Schema.Struct(")
      expect(petsSource).toContain("Schema.TaggedError<CreatePet400>")

      const usersSource = yield* fs.readFileString(path.join(outDir, "users.ts"))
      expect(usersSource).toContain("listUsers")
      expect(usersSource).not.toContain("listPets")
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync with --ext .ts uses .ts extensions in imports", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const specPath = path.join(tmpDir, "spec.json")
      const outDir = path.join(tmpDir, "generated")

      yield* fs.writeFileString(specPath, JSON.stringify(petStoreSpec))

      yield* run([
        "node",
        "openapigen.js",
        "sync",
        "--spec",
        specPath,
        "--name",
        "Api",
        "--outdir",
        outDir,
        "--ext",
        ".ts"
      ])

      const barrel = yield* fs.readFileString(path.join(outDir, "index.ts"))
      expect(barrel).toContain("from \"./pets.ts\"")
      expect(barrel).toContain("from \"./users.ts\"")
      expect(barrel).not.toContain(".js\"")
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync always overwrites existing files", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const specPath = path.join(tmpDir, "spec.json")
      const outDir = path.join(tmpDir, "generated")

      yield* fs.writeFileString(specPath, JSON.stringify(petStoreSpec))

      yield* run(["node", "openapigen.js", "sync", "--spec", specPath, "--outdir", outDir])

      const firstContent = yield* fs.readFileString(path.join(outDir, "pets.ts"))

      yield* run(["node", "openapigen.js", "sync", "--spec", specPath, "--outdir", outDir, "--name", "DifferentName"])

      const secondContent = yield* fs.readFileString(path.join(outDir, "pets.ts"))
      expect(secondContent).toContain("DifferentName")
      expect(secondContent).not.toEqual(firstContent)
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync with shared schema creates _common.ts", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const specPath = path.join(tmpDir, "spec.json")
      const outDir = path.join(tmpDir, "generated")

      const specWithShared = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/a": {
            get: {
              operationId: "getA",
              tags: ["tagA"],
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Shared" } }
                  }
                }
              }
            }
          },
          "/b": {
            get: {
              operationId: "getB",
              tags: ["tagB"],
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Shared" } }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            Shared: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } }
            }
          }
        }
      }

      yield* fs.writeFileString(specPath, JSON.stringify(specWithShared))

      yield* run(["node", "openapigen.js", "sync", "--spec", specPath, "--outdir", outDir])

      const files = yield* fs.readDirectory(outDir)
      expect(files).toContain("_common.ts")

      const common = yield* fs.readFileString(path.join(outDir, "_common.ts"))
      expect(common).toContain("Shared")

      const tagA = yield* fs.readFileString(path.join(outDir, "tag-a.ts"))
      expect(tagA).toContain("export { Shared } from \"./_common.js\"")
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync with --url fetches and generates from remote spec", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const outDir = path.join(tmpDir, "generated")

      yield* run([
        "node",
        "openapigen.js",
        "sync",
        "--url",
        "http://test.local/spec.json",
        "--name",
        "PetStore",
        "--outdir",
        outDir
      ])

      const files = yield* fs.readDirectory(outDir)
      expect(files).toContain("index.ts")
      expect(files).toContain("pets.ts")
      expect(files).toContain("users.ts")

      const petsSource = yield* fs.readFileString(path.join(outDir, "pets.ts"))
      expect(petsSource).toContain("export class Pet extends Schema.Class")
      expect(petsSource).toContain("export const make")
      expect(petsSource).toContain("export interface PetStore")
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync fails when both --spec and --url are provided", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const specPath = path.join(tmpDir, "spec.json")
      const outDir = path.join(tmpDir, "generated")

      yield* fs.writeFileString(specPath, JSON.stringify(petStoreSpec))

      const exit = yield* run([
        "node",
        "openapigen.js",
        "sync",
        "--spec",
        specPath,
        "--url",
        "http://test.local/spec.json",
        "--outdir",
        outDir
      ]).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    }).pipe(Effect.provide(TestEnv)))

  it.scoped("sync fails when neither --spec nor --url is provided", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const tmpDir = yield* fs.makeTempDirectoryScoped()
      const outDir = path.join(tmpDir, "generated")

      const exit = yield* run([
        "node",
        "openapigen.js",
        "sync",
        "--outdir",
        outDir
      ]).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    }).pipe(Effect.provide(TestEnv)))
})
