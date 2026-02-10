# @lucas-barake/openapi-gen

Generate fully typed [Effect](https://effect.website) HTTP clients from OpenAPI specifications.

Given an OpenAPI spec, this tool generates:

- **Effect Schema declarations** (`effect/Schema`) for request bodies, response bodies, parameters, and error responses
- **A typed `@effect/platform` HttpClient** where every API operation is a method returning `Effect.Effect<Success, Error>` with per-status-code typed errors

## Install

```bash
pnpm add -g @lucas-barake/openapi-gen
```

Or run directly without installing:

```bash
pnpm dlx @lucas-barake/openapi-gen sync -s ./openapi.json -n MyApi -o ./src/generated
```

## Usage

```bash
openapigen sync --spec <file> [--name <name>] [--outdir <dir>]
```

| Flag             | Alias | Required | Default  | Description                                              |
| ---------------- | ----- | -------- | -------- | -------------------------------------------------------- |
| `--spec <file>`  | `-s`  | Yes      | —        | Path to the OpenAPI spec file (`.json`, `.yaml`, `.yml`) |
| `--name <name>`  | `-n`  | No       | `Client` | Name for the generated client interface                  |
| `--outdir <dir>` | `-o`  | No       | `.`      | Output directory for generated files                     |

### Supported input formats

- **OpenAPI 3.x** (native)
- **Swagger 2.0** (auto-converted via `swagger2openapi`)
- File formats: `.json`, `.yaml`, `.yml`

## Output structure

Operations are grouped by their OpenAPI **tag**. Each tag gets its own module file:

```
src/generated/
  _common.ts       # Shared schemas (only created if a schema is used by 2+ tags)
  pets.ts          # Schemas + client methods for the "pets" tag
  users.ts         # Schemas + client methods for the "users" tag
  index.ts         # Barrel file re-exporting all tag modules
```

Untagged operations go into a `_untagged.ts` module.

## Generated code

Each tag module contains:

1. **Imports** from `effect/Schema`, `@effect/platform`, and `effect/Effect`
2. **Schema declarations** for request/response types
3. **A `make` factory** that takes an `HttpClient` and returns the typed client
4. **A `Client` interface** with full type signatures

### Example

Given this OpenAPI spec:

```yaml
openapi: "3.0.0"
info:
  title: Pet Store
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      tags: [pets]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Pet"
    post:
      operationId: createPet
      tags: [pets]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name:
                  type: string
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
        "400":
          description: Bad request
          content:
            application/json:
              schema:
                type: object
                required: [message]
                properties:
                  message:
                    type: string
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
```

Running:

```bash
pnpm dlx @lucas-barake/openapi-gen sync -s ./petstore.yaml -n PetStore -o ./src/generated
```

Generates `src/generated/pets.ts`:

```ts
import type * as Headers from "@effect/platform/Headers"
import type * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientError from "@effect/platform/HttpClientError"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import * as Effect from "effect/Effect"
import type { ParseError } from "effect/ParseResult"
import * as Schema from "effect/Schema"

export class Pet extends Schema.Class<Pet>("Pet")({
  "id": Schema.String,
  "name": Schema.String
}) {}

const ListPets200 = Schema.Array(Pet)

const CreatePetRequest = Schema.Struct({
  "name": Schema.String
})

const CreatePet201 = Pet

const CreatePet400Body = Schema.Struct({
  "message": Schema.String
})

export class CreatePet400 extends Schema.TaggedError<CreatePet400>()("CreatePet400", CreatePet400Body) {}

const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.flatMap(
    Effect.orElseSucceed(response.json, () => "Unexpected status code"),
    (description) =>
      Effect.fail(
        new HttpClientError.ResponseError({
          request: response.request,
          response,
          reason: "StatusCode",
          description: typeof description === "string"
            ? description
            : JSON.stringify(description)
        })
      )
  )

export const make = (httpClient: HttpClient.HttpClient): PetStoreClient => ({
  "listPets": (options) =>
    httpClient.execute(
      HttpClientRequest.get(`/pets`).pipe(
        HttpClientRequest.setUrlParams({
          "limit": options.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders(options?.headers ?? {})
      )
    ).pipe(
      Effect.flatMap(HttpClientResponse.matchStatus({
        "2xx": HttpClientResponse.schemaBodyJson(ListPets200),
        orElse: unexpectedStatus
      })),
      Effect.scoped
    ),

  "createPet": (options) =>
    HttpClientRequest.post(`/pets`).pipe(
      HttpClientRequest.schemaBodyJson(CreatePetRequest)(options.payload),
      Effect.flatMap((request) => httpClient.execute(request)),
      Effect.flatMap(HttpClientResponse.matchStatus({
        "201": HttpClientResponse.schemaBodyJson(CreatePet201),
        "400": (response) =>
          HttpClientResponse.schemaBodyJson(CreatePet400Body)(response).pipe(
            Effect.map((body) => new CreatePet400(body)),
            Effect.flatMap(Effect.fail)
          ),
        orElse: unexpectedStatus
      })),
      Effect.scoped
    )
})

export interface PetStoreClient {
  readonly "listPets": (options?: {
    readonly params?: { readonly limit?: number }
    readonly headers?: Headers.Input
  }) => Effect.Effect<
    typeof ListPets200.Type,
    HttpClientError.HttpClientError | ParseError
  >

  readonly "createPet": (options: {
    readonly payload: typeof CreatePetRequest.Encoded
    readonly headers?: Headers.Input
  }) => Effect.Effect<
    typeof CreatePet201.Type,
    HttpClientError.HttpClientError | ParseError | CreatePet400
  >
}
```

### Using the generated client

```ts
import * as HttpClient from "@effect/platform/HttpClient"
import { PetStore } from "./src/generated/index.js"

const program = Effect.gen(function*() {
  const httpClient = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.example.com"))
  )
  const client = PetStore.make(httpClient)

  const pets = yield* client.listPets()
  const newPet = yield* client.createPet({ payload: { name: "Buddy" } })
})
```

### Schema features

The generator maps OpenAPI/JSON Schema types to Effect Schema:

| OpenAPI                                                  | Effect Schema                                              |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `type: "string"`                                         | `Schema.String`                                            |
| `type: "number"`                                         | `Schema.Number`                                            |
| `type: "integer"`                                        | `Schema.Int`                                               |
| `type: "boolean"`                                        | `Schema.Boolean`                                           |
| `type: "array"`                                          | `Schema.Array(...)`                                        |
| `type: "object"`                                         | `Schema.Struct({...})`                                     |
| `$ref` (component)                                       | `Schema.Class`                                             |
| `enum`                                                   | `Schema.Literal(...)`                                      |
| `oneOf` / `anyOf`                                        | `Schema.Union(...)`                                        |
| `nullable: true`                                         | `Schema.NullOr(...)`                                       |
| `format: "binary"`                                       | `Schema.instanceOf(globalThis.Blob)`                       |
| String constraints (`minLength`, `maxLength`, `pattern`) | `.pipe(Schema.minLength(...), ...)`                        |
| Number constraints (`minimum`, `maximum`)                | `.pipe(Schema.greaterThanOrEqualTo(...), ...)`             |
| Array constraints (`minItems`, `maxItems`)               | `Schema.NonEmptyArray(...)`, `.pipe(Schema.maxItems(...))` |
| 4xx error responses                                      | `Schema.TaggedError`                                       |

## Server-Sent Events (SSE)

Endpoints that return `text/event-stream` as a response content type are automatically detected and generated as streaming methods.

### How it's detected

If a response has a `text/event-stream` content type alongside `application/json`, the generator treats the endpoint as an SSE streaming endpoint. The schema under `text/event-stream` describes **a single SSE event's `data:` field** (one JSON chunk), not the entire stream.

```yaml
paths:
  /chat/completions:
    post:
      operationId: streamChat
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ChatRequest"
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ChatCompletion"
            text/event-stream:
              schema:
                $ref: "#/components/schemas/ChatCompletionChunk"
```

### What gets generated

Streaming methods return `Stream.Stream` instead of `Effect.Effect`. Each element in the stream is a decoded and validated event:

```ts
// Interface
readonly "streamChat": (options: {
  readonly payload: typeof StreamChatRequest.Encoded;
  readonly headers?: Headers.Input
}) => Stream.Stream<
  typeof ChatCompletionChunk.Type,
  HttpClientError.HttpClientError | ParseError
>

// Usage
const chunks = client.streamChat({ payload: { prompt: "Hello" } })

// Collect all events
const allChunks = yield* Stream.runCollect(chunks)

// Or process each event as it arrives
yield* chunks.pipe(
  Stream.runForEach((chunk) => Console.log(chunk))
)
```

### Additional dependency

SSE streaming requires `@effect/experimental`:

```bash
pnpm add @effect/experimental
```

### Peer dependencies

Your project needs these to use the generated code:

```bash
pnpm add effect @effect/platform

# If using SSE streaming endpoints:
pnpm add @effect/experimental
```

## Acknowledgments

Initially based on [tim-smart/openapi-gen](https://github.com/tim-smart/openapi-gen).
