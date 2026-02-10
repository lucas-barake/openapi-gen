import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { GenerateResult } from "../src/OpenApi.js"
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

const allSources = (result: GenerateResult) => [...result.modules.values()].map((_) => _.source).join("\n\n")

describe("OpenApi", () => {
  describe("Schema mode", () => {
    it.effect("simple GET endpoint", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("import * as Schema from \"effect/Schema\"")
        expect(output).toContain(
          "import * as HttpClientRequest from \"@effect/platform/HttpClientRequest\""
        )
        expect(output).toContain("export const make")
        expect(output).toContain("HttpClientRequest.get(`/users`)")
        expect(output).toContain("HttpClientResponse.schemaBodyJson(ListUsers200)")
        expect(output).toContain("matchStatus")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("POST with request body", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HttpClientRequest.post(`/users`)")
        expect(output).toContain("HttpClientRequest.schemaBodyJson(CreateUserRequest)(options.payload)")
        expect(output).toContain("CreateUserRequest")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("path parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HttpClientRequest.get(`/users/${userId}`)")
        expect(output).toContain("userId: string")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("query parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("ListUsersParams")
        expect(output).toContain("HttpClientRequest.setUrlParams")
        expect(output).toContain("\"page\"")
        expect(output).toContain("\"limit\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("error responses (4xx)", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("GetUser404")
        expect(output).toContain("HttpClientResponse.schemaBodyJson(GetUser404Body)")
        expect(output).toContain("new GetUser404(body)")
        expect(output).toContain("| GetUser404>")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("4xx error schemas generate Schema.TaggedError", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("const GetUser404Body = Schema.Struct(")
        expect(output).toContain("Schema.TaggedError<GetUser404>()(\"GetUser404\"")
        expect(output).not.toContain("Schema.Class<GetUser404>")
        expect(output).not.toContain("Data.Error")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("error schema generates body struct for decoding", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("const GetUser404Body = Schema.Struct(")
        expect(output).toContain("Schema.TaggedError<GetUser404>()(\"GetUser404\", GetUser404Body)")
        expect(output).toContain("schemaBodyJson(GetUser404Body)")
        expect(output).toContain("new GetUser404(body)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("error schema body struct is exported", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("export const GetUser404Body")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("non-object error schemas still work", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
                    "400": {
                      description: "Bad request",
                      content: {
                        "application/json": {
                          schema: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }),
            { name: "Client" }
          )
        )

        expect(output).toContain("GetUser400")
        expect(output).not.toContain("GetUser400Body")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("void response (no content)", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HttpClientRequest.del(`/users/${userId}`)")
        expect(output).toContain("Effect.void")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("bodyless 4xx errors should NOT produce Effect.void", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
                    },
                    "401": {
                      description: "Unauthorized"
                    },
                    "403": {
                      description: "Forbidden"
                    }
                  }
                }
              }
            }),
            { name: "Client" }
          )
        )

        expect(output).toContain(`"204": () => Effect.void`)
        expect(output).not.toContain(`"401": () => Effect.void`)
        expect(output).not.toContain(`"403": () => Effect.void`)
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("bodyless 5xx errors should NOT produce Effect.void", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
            baseSpec({
              "/health": {
                get: {
                  operationId: "healthCheck",
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: { type: "object", properties: { status: { type: "string" } } }
                        }
                      }
                    },
                    "503": {
                      description: "Service Unavailable"
                    }
                  }
                }
              }
            }),
            { name: "Client" }
          )
        )

        expect(output).not.toContain(`"503": () => Effect.void`)
        expect(output).toContain("HttpClientResponse.schemaBodyJson(HealthCheck200)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("mixed — some errors have bodies, some don't", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
            baseSpec({
              "/orders": {
                post: {
                  operationId: "createOrder",
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { item: { type: "string" } }
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
                    },
                    "400": {
                      description: "Bad request",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { message: { type: "string" } }
                          }
                        }
                      }
                    },
                    "401": {
                      description: "Unauthorized"
                    },
                    "500": {
                      description: "Internal Server Error"
                    }
                  }
                }
              }
            }),
            { name: "Client" }
          )
        )

        expect(output).toContain("CreateOrder400")
        expect(output).toContain("schemaBodyJson(CreateOrder400Body)")
        expect(output).toContain("Effect.flatMap(Effect.fail)")
        expect(output).not.toContain(`"401": () => Effect.void`)
        expect(output).not.toContain(`"500": () => Effect.void`)
        expect(output).toContain("HttpClientResponse.schemaBodyJson(CreateOrder201)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("header parameters", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HttpClientRequest.setHeaders")
        expect(output).toContain("\"X-Api-Key\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("multipart form data", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HttpClientRequest.bodyFormDataRecord")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("POST with query params and request body", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("readonly params")
        expect(output).toContain("readonly payload")
        expect(output).toContain("HttpClientRequest.setUrlParams")
        expect(output).toContain("HttpClientRequest.schemaBodyJson(CreateUserRequest)(options.payload)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("default response as success schema", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("HealthCheckdefault")
        expect(output).toContain("HttpClientResponse.schemaBodyJson(HealthCheckdefault)")
        expect(output).toContain("\"2xx\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("operation without operationId falls back to METHOD+path", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("\"GET/health\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("$ref parameters are resolved", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("ListItemsParams")
        expect(output).toContain("\"page\"")
        expect(output).toContain("HttpClientRequest.setUrlParams")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("$ref responses are resolved", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("ListUsers200")
        expect(output).toContain("HttpClientResponse.schemaBodyJson(ListUsers200)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("required query parameters make options non-optional", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("readonly params: typeof SearchParams.Encoded")
        expect(output).not.toContain("readonly params?: typeof SearchParams.Encoded")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("operation description generates JSDoc comment", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("/**\n* Check service health\n*/")
        expect(output).toContain("/**\n* Ping the server\n*/")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("endpoint returning tuple field does not crash and generates Schema.Tuple", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
            ({
              openapi: "3.1.0",
              info: { title: "Test", version: "1.0.0" },
              paths: {
                "/coordinates": {
                  get: {
                    operationId: "getCoordinates",
                    responses: {
                      "200": {
                        description: "OK",
                        content: {
                          "application/json": {
                            schema: {
                              type: "object",
                              required: ["point"],
                              properties: {
                                point: {
                                  type: "array",
                                  prefixItems: [{ type: "number" }, { type: "number" }],
                                  items: false
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }) as any,
            { name: "Client" }
          )
        )

        expect(output).toContain("Schema.Tuple(Schema.Number, Schema.Number)")
        expect(output).not.toContain("Schema.Array")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("parameter with nested object properties expands to bracket notation", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const output = allSources(
          yield* api.generate(
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
        )

        expect(output).toContain("\"filter[status]\"")
      }).pipe(Effect.provide(OpenApi.Live)))
  })

  describe("Per-tag generation", () => {
    it.effect("groups operations by tag into separate modules", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          baseSpec({
            "/pets": {
              get: {
                operationId: "listPets",
                tags: ["pets"],
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
          }),
          { name: "Client" }
        )

        expect(result.modules.size).toBe(2)
        expect(result.modules.has("pets")).toBe(true)
        expect(result.modules.has("users")).toBe(true)

        const petsModule = result.modules.get("pets")!
        expect(petsModule.source).toContain("listPets")
        expect(petsModule.source).not.toContain("listUsers")

        const usersModule = result.modules.get("users")!
        expect(usersModule.source).toContain("listUsers")
        expect(usersModule.source).not.toContain("listPets")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("untagged operations go into _untagged module", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          baseSpec({
            "/health": {
              get: {
                operationId: "healthCheck",
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

        expect(result.modules.has("_untagged")).toBe(true)
        expect(result.modules.get("_untagged")!.source).toContain("healthCheck")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("shared $ref schema goes into _common module", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          specWithComponents(
            {
              "/pets": {
                get: {
                  operationId: "listPets",
                  tags: ["pets"],
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/Error" }
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
                          schema: { $ref: "#/components/schemas/Error" }
                        }
                      }
                    }
                  }
                }
              }
            },
            {
              schemas: {
                Error: {
                  type: "object",
                  required: ["message"],
                  properties: { message: { type: "string" } }
                }
              }
            }
          ),
          { name: "Client" }
        )

        expect(result.modules.has("_common")).toBe(true)
        const common = result.modules.get("_common")!
        expect(common.source).toContain("Error")

        const petsModule = result.modules.get("pets")!
        expect(petsModule.source).toContain("export { Error } from \"./_common.js\"")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("single-tag spec produces no _common module", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          baseSpec({
            "/pets": {
              get: {
                operationId: "listPets",
                tags: ["pets"],
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

        expect(result.modules.has("_common")).toBe(false)
        expect(result.modules.size).toBe(1)
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("each tag module has imports, schemas, implementation, and types", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          baseSpec({
            "/pets": {
              get: {
                operationId: "listPets",
                tags: ["pets"],
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { id: { type: "string" } }
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

        const petsModule = result.modules.get("pets")!
        expect(petsModule.source).toContain("import * as Schema from \"effect/Schema\"")
        expect(petsModule.source).toContain("ListPets200")
        expect(petsModule.source).toContain("export const make")
        expect(petsModule.source).toContain("export interface Client")
      }).pipe(Effect.provide(OpenApi.Live)))
  })

  describe("SSE streaming", () => {
    const sseSpec = baseSpec({
      "/chat/completions": {
        post: {
          operationId: "createChatCompletion",
          tags: ["chat"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["messages"],
                  properties: {
                    messages: { type: "array", items: { type: "string" } }
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
                  schema: {
                    type: "object",
                    properties: { result: { type: "string" } }
                  }
                },
                "text/event-stream": {
                  schema: {
                    type: "object",
                    required: ["delta"],
                    properties: { delta: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      }
    })

    it.effect("generates both regular and stream methods for SSE endpoints", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(sseSpec, { name: "Client" })
        const chatModule = result.modules.get("chat")!

        expect(chatModule.source).toContain("\"createChatCompletion\":")
        expect(chatModule.source).toContain("\"createChatCompletionStream\":")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("stream method returns Stream.Stream in interface", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(sseSpec, { name: "Client" })
        const chatModule = result.modules.get("chat")!

        expect(chatModule.source).toContain("Stream.Stream<typeof CreateChatCompletionStreamEvent.Type")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("stream method uses Sse.makeChannel pipeline", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(sseSpec, { name: "Client" })
        const chatModule = result.modules.get("chat")!

        expect(chatModule.source).toContain("Sse.makeChannel()")
        expect(chatModule.source).toContain("Stream.decodeText()")
        expect(chatModule.source).toContain("Stream.unwrapScoped")
        expect(chatModule.source).toContain("Schema.parseJson(CreateChatCompletionStreamEvent)")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("adds Stream and Sse imports only for modules with SSE", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          ({
            openapi: "3.0.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {
              "/chat": {
                post: {
                  operationId: "chat",
                  tags: ["streaming"],
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: { type: "object", properties: { msg: { type: "string" } } }
                      }
                    }
                  },
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "text/event-stream": {
                          schema: { type: "object", properties: { chunk: { type: "string" } } }
                        }
                      }
                    }
                  }
                }
              },
              "/health": {
                get: {
                  operationId: "health",
                  tags: ["other"],
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: { type: "object", properties: { ok: { type: "boolean" } } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }) as any,
          { name: "Client" }
        )

        const streamingModule = result.modules.get("streaming")!
        expect(streamingModule.source).toContain("import * as Sse from \"@effect/experimental/Sse\"")
        expect(streamingModule.source).toContain("import * as Stream from \"effect/Stream\"")

        const otherModule = result.modules.get("other")!
        expect(otherModule.source).not.toContain("Sse")
        expect(otherModule.source).not.toContain("Stream")
      }).pipe(Effect.provide(OpenApi.Live)))

    it.effect("SSE-only endpoint (no application/json) generates only stream method", () =>
      Effect.gen(function*() {
        const api = yield* OpenApi
        const result = yield* api.generate(
          baseSpec({
            "/events": {
              get: {
                operationId: "streamEvents",
                tags: ["events"],
                responses: {
                  "200": {
                    description: "OK",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "object",
                          required: ["type"],
                          properties: { type: { type: "string" }, data: { type: "string" } }
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

        const eventsModule = result.modules.get("events")!
        expect(eventsModule.source).toContain("\"streamEventsStream\":")
        expect(eventsModule.source).toContain("Stream.Stream<typeof StreamEventsStreamEvent.Type")
      }).pipe(Effect.provide(OpenApi.Live)))
  })
})
