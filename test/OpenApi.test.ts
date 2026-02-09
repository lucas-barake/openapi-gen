import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { OpenApi } from "../src/OpenApi.js"

const baseSpec = (paths: Record<string, any>) =>
  ({
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths
  }) as any

const specWithComponents = (
  paths: Record<string, any>,
  components: Record<string, any>
) =>
  ({
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths,
    components
  }) as any

describe("OpenApi", () => {
  describe("Schema mode", () => {
    it.effect("simple GET endpoint", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users": {
              get: {
                operationId: "listUsers",
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: {
                          type: "array",
                          items: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("import * as S from \"effect/Schema\"")
        expect(output).toContain(
          "import * as HttpClientRequest from \"@effect/platform/HttpClientRequest\""
        )
        expect(output).toContain("export const make")
        expect(output).toContain("HttpClientRequest.get(`/users`)")
        expect(output).toContain("decodeSuccess(ListUsers200)")
        expect(output).toContain("matchStatus")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("POST with request body", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users": {
              post: {
                operationId: "createUser",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: { type: "string" }
                        },
                        required: ["name"]
                      }
                    }
                  }
                },
                responses: {
                  "201": {
                    description: "Created",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { id: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("HttpClientRequest.post(`/users`)")
        expect(output).toContain("HttpClientRequest.bodyUnsafeJson(options)")
        expect(output).toContain("CreateUserRequest")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("path parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users/{userId}": {
              get: {
                operationId: "getUser",
                parameters: [
                  { name: "userId", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { id: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("HttpClientRequest.get(`/users/${userId}`)")
        expect(output).toContain("userId: string")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("query parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users": {
              get: {
                operationId: "listUsers",
                parameters: [
                  { name: "page", in: "query", required: false, schema: { type: "integer" } },
                  { name: "limit", in: "query", required: false, schema: { type: "integer" } }
                ],
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
          }),
          { name: "Client" }
        )

        expect(output).toContain("ListUsersParams")
        expect(output).toContain("HttpClientRequest.setUrlParams")
        expect(output).toContain("\"page\"")
        expect(output).toContain("\"limit\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("error responses (4xx)", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users/{userId}": {
              get: {
                operationId: "getUser",
                parameters: [
                  { name: "userId", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { id: { type: "string" } } }
                      }
                    }
                  },
                  "404": {
                    description: "Not found",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { message: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("GetUser404")
        expect(output).toContain("decodeError(\"GetUser404\", GetUser404)")
        expect(output).toContain("ClientError<\"GetUser404\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("void response (no content)", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users/{userId}": {
              delete: {
                operationId: "deleteUser",
                parameters: [
                  { name: "userId", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                  "204": {
                    description: "No Content"
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("HttpClientRequest.del(`/users/${userId}`)")
        expect(output).toContain("Effect.void")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("header parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users": {
              get: {
                operationId: "listUsers",
                parameters: [
                  { name: "X-Api-Key", in: "header", required: true, schema: { type: "string" } }
                ],
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
          }),
          { name: "Client" }
        )

        expect(output).toContain("HttpClientRequest.setHeaders")
        expect(output).toContain("\"X-Api-Key\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("multipart form data", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/upload": {
              post: {
                operationId: "uploadFile",
                requestBody: {
                  content: {
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        properties: {
                          file: { type: "string", format: "binary" }
                        }
                      }
                    }
                  }
                },
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { id: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("HttpClientRequest.bodyFormDataRecord")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("POST with query params and request body", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/users": {
              post: {
                operationId: "createUser",
                parameters: [
                  { name: "dryRun", in: "query", required: false, schema: { type: "boolean" } }
                ],
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
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
                        schema: { type: "object", properties: { id: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("readonly params")
        expect(output).toContain("readonly payload")
        expect(output).toContain("HttpClientRequest.setUrlParams")
        expect(output).toContain("HttpClientRequest.bodyUnsafeJson")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("default response as success schema", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/health": {
              get: {
                operationId: "healthCheck",
                responses: {
                  default: {
                    description: "Default",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { message: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("HealthCheckdefault")
        expect(output).toContain("decodeSuccess(HealthCheckdefault)")
        expect(output).toContain("\"2xx\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("operation without operationId falls back to METHOD+path", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/health": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { status: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("\"GET/health\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("$ref parameters are resolved", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          specWithComponents(
            {
              "/items": {
                get: {
                  operationId: "listItems",
                  parameters: [
                    { $ref: "#/components/parameters/PageParam" }
                  ],
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
            {
              parameters: {
                PageParam: {
                  name: "page",
                  in: "query",
                  required: false,
                  schema: { type: "integer" }
                }
              }
            }
          ),
          { name: "Client" }
        )

        expect(output).toContain("ListItemsParams")
        expect(output).toContain("\"page\"")
        expect(output).toContain("HttpClientRequest.setUrlParams")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("$ref responses are resolved", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          specWithComponents(
            {
              "/users": {
                get: {
                  operationId: "listUsers",
                  responses: {
                    "200": {
                      $ref: "#/components/responses/UserListResponse"
                    }
                  }
                }
              }
            },
            {
              responses: {
                UserListResponse: {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            }
          ),
          { name: "Client" }
        )

        expect(output).toContain("ListUsers200")
        expect(output).toContain("decodeSuccess(ListUsers200)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("required query parameters make options non-optional", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/search": {
              get: {
                operationId: "search",
                parameters: [
                  { name: "q", in: "query", required: true, schema: { type: "string" } }
                ],
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
          }),
          { name: "Client" }
        )

        expect(output).toContain("options: typeof SearchParams.Encoded")
        expect(output).not.toContain("options?: typeof SearchParams.Encoded")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("operation description generates JSDoc comment", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/health": {
              get: {
                operationId: "healthCheck",
                description: "Check service health",
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { status: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            },
            "/ping": {
              get: {
                operationId: "ping",
                summary: "Ping the server",
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { pong: { type: "boolean" } } }
                      }
                    }
                  }
                }
              }
            }
          }),
          { name: "Client" }
        )

        expect(output).toContain("/**\n* Check service health\n*/")
        expect(output).toContain("/**\n* Ping the server\n*/")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("parameter with nested object properties expands to bracket notation", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = yield* api.generate(
          baseSpec({
            "/items": {
              get: {
                operationId: "listItems",
                parameters: [
                  {
                    name: "filter",
                    in: "query",
                    schema: {
                      type: "object",
                      properties: {
                        status: { type: "string" }
                      }
                    }
                  }
                ],
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
          }),
          { name: "Client" }
        )

        expect(output).toContain("\"filter[status]\"")
      }).pipe(Effect.provide(OpenApi.Live)))
  })
})
