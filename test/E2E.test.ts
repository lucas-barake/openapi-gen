import { HttpClientError } from "effect/unstable/http"
import { describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import type { GenerateResult } from "../src/OpenApi.js"
import { OpenApi } from "../src/OpenApi.js"
import { evalGenerated } from "./utils/evalModule.js"
import { mockHttpClient, mockHttpClientWithCapture, mockSseClient } from "./utils/mockHttp.js"

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

const generate = (spec: any, opts?: { readonly name?: string }): Effect.Effect<GenerateResult> =>
  Effect.gen(function*() {
    const api = yield* OpenApi
    return yield* api.generate(spec, { name: opts?.name ?? "Client" })
  }).pipe(Effect.provide(OpenApi.Live)) as Effect.Effect<GenerateResult>

const asAny = (fn: () => Effect.Effect<void, any, any>): Effect.Effect<void> => fn() as Effect.Effect<void>

describe("E2E", () => {
  describe("basic operations", () => {
    it.effect("GET with JSON response", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                name: { type: "string" }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets", status: 200, body: [{ id: "1", name: "Fido" }] }
            ])
          )
          const data = yield* client.listPets()
          expect(data).toEqual([{ id: "1", name: "Fido" }])
        })
      ))

    it.effect("POST with request body", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                post: {
                  operationId: "createPet",
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            tag: { type: "string" }
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
                          schema: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "POST", path: "/pets", status: 201, body: { id: "new-1", name: "Buddy" } }
            ])
          )
          const data = yield* client.createPet({ payload: { name: "Buddy" } })
          expect(data).toEqual({ id: "new-1", name: "Buddy" })
        })
      ))

    it.effect("path parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                get: {
                  operationId: "getPet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets/abc-123", status: 200, body: { id: "abc-123", name: "Fido" } }
            ])
          )
          const data = yield* client.getPet("abc-123")
          expect(data).toEqual({ id: "abc-123", name: "Fido" })
        })
      ))

    it.effect("DELETE method (del mapping)", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                delete: {
                  operationId: "deletePet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "204": { description: "No Content" }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "DELETE", path: "/pets/123", status: 204 }
            ])
          )
          const data = yield* client.deletePet("123")
          expect(data).toBeUndefined()
        })
      ))

    it.effect("PUT method", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                put: {
                  operationId: "updatePet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { name: { type: "string" } },
                          required: ["name"]
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
                            properties: { id: { type: "string" }, name: { type: "string" } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "PUT", path: "/pets/1", status: 200, body: { id: "1", name: "Rex" } }
            ])
          )
          const data = yield* client.updatePet("1", { payload: { name: "Rex" } })
          expect(data).toEqual({ id: "1", name: "Rex" })
        })
      ))

    it.effect("PATCH method", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                patch: {
                  operationId: "patchPet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
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
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { id: { type: "string" }, name: { type: "string" } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "PATCH", path: "/pets/1", status: 200, body: { id: "1", name: "Rex" } }
            ])
          )
          const data = yield* client.patchPet("1", { payload: { name: "Rex" } })
          expect(data).toEqual({ id: "1", name: "Rex" })
        })
      ))

    it.effect("multiple path parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/orgs/{orgId}/repos/{repoId}": {
                get: {
                  operationId: "getRepo",
                  parameters: [
                    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
                    { name: "repoId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { name: { type: "string" } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/orgs/org-1/repos/repo-1", status: 200, body: { name: "my-repo" } }
            ])
          )
          const data = yield* client.getRepo("org-1", "repo-1")
          expect(data).toEqual({ name: "my-repo" })
        })
      ))
  })

  describe("request features", () => {
    it.effect("query parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            { method: "GET", path: "/pets", status: 200, body: ["Fido"] }
          ])
          const data = yield* mod.make(client).listPets({ params: { page: 1, limit: 10 } })
          expect(data).toEqual(["Fido"])
          expect(requests[0].url.searchParams.get("page")).toBe("1")
          expect(requests[0].url.searchParams.get("limit")).toBe("10")
        })
      ))

    it.effect("optional query parameters can be omitted entirely", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
                  parameters: [
                    { name: "page", in: "query", required: false, schema: { type: "integer" } }
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets", status: 200, body: ["Fido"] }
            ])
          )
          const data = yield* client.listPets()
          expect(data).toEqual(["Fido"])
        })
      ))

    it.effect("header parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            { method: "GET", path: "/pets", status: 200, body: ["Fido"] }
          ])
          const data = yield* mod.make(client).listPets({
            params: { "X-Api-Key": "secret-key" }
          })
          expect(data).toEqual(["Fido"])
          expect(requests[0].request.headers["x-api-key"]).toBe("secret-key")
        })
      ))

    it.effect("custom headers via options.headers", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            { method: "GET", path: "/pets", status: 200, body: ["Fido"] }
          ])
          const data = yield* mod.make(client).listPets({
            headers: { Authorization: "Bearer token123" }
          })
          expect(data).toEqual(["Fido"])
          expect(requests[0].request.headers.authorization).toBe("Bearer token123")
        })
      ))

    it.effect("nested object query parameters (bracket notation)", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
                  parameters: [
                    {
                      name: "filter",
                      in: "query",
                      schema: {
                        type: "object",
                        properties: {
                          status: { type: "string" },
                          type: { type: "string" }
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
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            { method: "GET", path: "/pets", status: 200, body: ["Fido"] }
          ])
          const data = yield* mod.make(client).listPets({
            params: { "filter[status]": "active", "filter[type]": "dog" }
          })
          expect(data).toEqual(["Fido"])
          expect(requests[0].url.searchParams.get("filter[status]")).toBe("active")
          expect(requests[0].url.searchParams.get("filter[type]")).toBe("dog")
        })
      ))

    it.effect("multipart form data", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
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
                            name: { type: "string" }
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "POST", path: "/upload", status: 200, body: { id: "file-1" } }
            ])
          )
          yield* client.uploadFile({ payload: { name: "test.txt" } })
        })
      ))

    it.effect("multipart form data with path parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/users/{userId}/avatar": {
                post: {
                  operationId: "uploadAvatar",
                  parameters: [
                    { name: "userId", in: "path", required: true, schema: { type: "string" } }
                  ],
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
                          schema: { type: "object", properties: { url: { type: "string" } } }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            {
              method: "POST",
              path: "/users/user-1/avatar",
              status: 200,
              body: { url: "https://example.com/avatar.png" }
            }
          ])
          const data = yield* mod.make(client).uploadAvatar("user-1", { payload: { file: "data" } })
          expect(data).toEqual({ url: "https://example.com/avatar.png" })
          expect(requests[0].url.pathname).toBe("/users/user-1/avatar")
        })
      ))

    it.effect("multipart form data with path and query parameters", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/users/{userId}/documents": {
                post: {
                  operationId: "uploadDocument",
                  parameters: [
                    { name: "userId", in: "path", required: true, schema: { type: "string" } },
                    { name: "overwrite", in: "query", required: false, schema: { type: "boolean" } }
                  ],
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
            })
          )

          const mod = evalGenerated(result)
          const { client, requests } = mockHttpClientWithCapture([
            { method: "POST", path: "/users/user-1/documents", status: 200, body: { id: "doc-1" } }
          ])
          const data = yield* mod.make(client).uploadDocument("user-1", {
            params: { overwrite: true },
            payload: { file: "data" }
          })
          expect(data).toEqual({ id: "doc-1" })
          expect(requests[0].url.pathname).toBe("/users/user-1/documents")
          expect(requests[0].url.searchParams.get("overwrite")).toBe("true")
        })
      ))
  })

  describe("response handling", () => {
    it.effect("void response (204 No Content)", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                delete: {
                  operationId: "deletePet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "204": { description: "No Content" }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "DELETE", path: "/pets/123", status: 204 }
            ])
          )
          const data = yield* client.deletePet("123")
          expect(data).toBeUndefined()
        })
      ))

    it.effect("default response as success fallback", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/info": {
                get: {
                  operationId: "getInfo",
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/info", status: 200, body: { message: "hello" } }
            ])
          )
          const data = yield* client.getInfo()
          expect(data).toEqual({ message: "hello" })
        })
      ))

    it.effect("multiple success status codes", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/items": {
                post: {
                  operationId: "createItem",
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
                    },
                    "201": {
                      description: "Created",
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "POST", path: "/items", status: 201, body: { id: "item-1" } }
            ])
          )
          const data = yield* client.createItem({ payload: { name: "Widget" } })
          expect(data).toEqual({ id: "item-1" })
        })
      ))

    it.effect("multiple success status codes with different schemas", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/things": {
                post: {
                  operationId: "upsertThing",
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
                    "200": {
                      description: "Already exists",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { id: { type: "string" }, existed: { type: "boolean" } }
                          }
                        }
                      }
                    },
                    "201": {
                      description: "Created",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { id: { type: "string" }, created: { type: "boolean" } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)

          const client200 = mod.make(
            mockHttpClient([
              { method: "POST", path: "/things", status: 200, body: { id: "1", existed: true } }
            ])
          )
          const data200 = yield* client200.upsertThing({ payload: { name: "Widget" } })
          expect(data200).toEqual({ id: "1", existed: true })

          const client201 = mod.make(
            mockHttpClient([
              { method: "POST", path: "/things", status: 201, body: { id: "2", created: true } }
            ])
          )
          const data201 = yield* client201.upsertThing({ payload: { name: "Widget" } })
          expect(data201).toEqual({ id: "2", created: true })
        })
      ))
  })

  describe("error handling", () => {
    it.effect("4xx error response with object body produces TaggedError", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                get: {
                  operationId: "getPet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { id: { type: "string" }, name: { type: "string" } }
                          }
                        }
                      }
                    },
                    "404": {
                      description: "Not found",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              message: { type: "string" },
                              code: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              {
                method: "GET",
                path: "/pets/nonexistent",
                status: 404,
                body: { message: "Not found", code: "PET_NOT_FOUND" }
              }
            ])
          )
          const exit = yield* client.getPet("nonexistent").pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("GetPet404")
          expect(error.message).toBe("Not found")
          expect(error.code).toBe("PET_NOT_FOUND")
        })
      ))

    it.effect("4xx error with non-object body", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/status": {
                get: {
                  operationId: "getStatus",
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: { status: { type: "string" } }
                          }
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/status", status: 400, body: "Bad request message" }
            ])
          )
          const exit = yield* client.getStatus().pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
          expect(error).toBe("Bad request message")
        })
      ))

    it.effect("bodyless 4xx falls through to unexpectedStatus", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets/{petId}": {
                delete: {
                  operationId: "deletePet",
                  parameters: [
                    { name: "petId", in: "path", required: true, schema: { type: "string" } }
                  ],
                  responses: {
                    "204": { description: "No Content" },
                    "401": { description: "Unauthorized" },
                    "500": { description: "Server Error" }
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)

          const client401 = mod.make(
            mockHttpClient([
              { method: "DELETE", path: "/pets/1", status: 401, body: "Unauthorized" }
            ])
          )
          const exit401 = yield* client401.deletePet("1").pipe(Effect.exit)
          expect(exit401._tag).toBe("Failure")
          if (exit401._tag !== "Failure") return
          const error401 = Option.getOrThrow(Cause.findErrorOption(exit401.cause)) as any
          expect(error401).toBeInstanceOf(HttpClientError.HttpClientError)
          expect(error401.reason._tag).toBe("StatusCodeError")

          const client204 = mod.make(
            mockHttpClient([
              { method: "DELETE", path: "/pets/1", status: 204 }
            ])
          )
          const data204 = yield* client204.deletePet("1")
          expect(data204).toBeUndefined()
        })
      ))

    it.effect("unexpected status code triggers unexpectedStatus", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets", status: 418, body: { error: "I'm a teapot" } }
            ])
          )
          const exit = yield* client.listPets().pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error).toBeInstanceOf(HttpClientError.HttpClientError)
          expect(error.reason._tag).toBe("StatusCodeError")
        })
      ))

    it.effect("$ref error schema in single-tag context produces TaggedError", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            specWithComponents(
              {
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
                            schema: { $ref: "#/components/schemas/NotFoundError" }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  NotFoundError: {
                    type: "object",
                    required: ["message"],
                    properties: { message: { type: "string" } }
                  }
                }
              }
            )
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/users/123", status: 404, body: { message: "User not found" } }
            ])
          )
          const exit = yield* client.getUser("123").pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("NotFoundError")
          expect(error.message).toBe("User not found")
        })
      ))

    it.effect("allOf error schema produces TaggedError", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            specWithComponents(
              {
                "/users/{userId}": {
                  get: {
                    operationId: "findUser",
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
                            schema: {
                              allOf: [
                                { $ref: "#/components/schemas/BaseError" },
                                {
                                  type: "object",
                                  properties: { details: { type: "string" } }
                                }
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  BaseError: {
                    type: "object",
                    required: ["message"],
                    properties: { message: { type: "string" } }
                  }
                }
              }
            )
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/users/123", status: 400, body: { message: "Invalid", details: "Bad ID" } }
            ])
          )
          const exit = yield* client.findUser("123").pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("FindUser400")
          expect(error.message).toBe("Invalid")
          expect(error.details).toBe("Bad ID")
        })
      ))

    it.effect("$ref at response level for error responses", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            specWithComponents(
              {
                "/users/{userId}": {
                  get: {
                    operationId: "lookupUser",
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
                        $ref: "#/components/responses/NotFound"
                      }
                    }
                  }
                }
              },
              {
                responses: {
                  NotFound: {
                    description: "Not found",
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
            )
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/users/123", status: 404, body: { message: "Not found" } }
            ])
          )
          const exit = yield* client.lookupUser("123").pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("LookupUser404")
          expect(error.message).toBe("Not found")
        })
      ))
  })

  describe("streaming", () => {
    it.effect("SSE streaming endpoint", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/chat": {
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
          )

          const mod = evalGenerated(result, "chat")
          const client = mod.make(
            mockSseClient([
              {
                method: "POST",
                path: "/chat",
                events: [{ delta: "Hello" }, { delta: " world" }]
              }
            ])
          )
          const chunks = yield* client.createChatCompletionStream({
            payload: { messages: ["hello"] }
          }).pipe(Stream.runCollect)
          expect(chunks).toEqual([
            { delta: "Hello" },
            { delta: " world" }
          ])
        })
      ))

    it.effect("SSE-only endpoint (no JSON response)", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/stream-only": {
                post: {
                  operationId: "streamOnly",
                  tags: ["streaming"],
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { msg: { type: "string" } }
                        }
                      }
                    }
                  },
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
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
          )

          const mod = evalGenerated(result, "streaming")
          const client = mod.make(
            mockSseClient([
              {
                method: "POST",
                path: "/stream-only",
                events: [{ delta: "chunk1" }, { delta: "chunk2" }]
              }
            ])
          )
          const chunks = yield* client.streamOnlyStream({
            payload: { msg: "hello" }
          }).pipe(Stream.runCollect)
          expect(chunks).toEqual([
            { delta: "chunk1" },
            { delta: "chunk2" }
          ])
        })
      ))
  })

  describe("schema features", () => {
    it.effect("$ref schema resolution", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            specWithComponents(
              {
                "/pets/{petId}": {
                  get: {
                    operationId: "getPet",
                    parameters: [
                      { name: "petId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                      "200": {
                        description: "OK",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/Pet" }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  Pet: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" }
                    }
                  }
                }
              }
            )
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets/1", status: 200, body: { id: "1", name: "Fido" } }
            ])
          )
          const data = yield* client.getPet("1")
          expect(data).toEqual({ id: "1", name: "Fido" })
        })
      ))

    it.effect("branded ID fields", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
                  responses: {
                    "200": {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: {
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
                  }
                }
              }
            })
          )

          const mod = evalGenerated(result)
          expect(mod.ListPets200Id).toBeDefined()
          expect(typeof mod.ListPets200Id.pipe).toBe("function")
        })
      ))

    it.effect("tuple (prefixItems) - strict tuple, no rest", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
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
            }) as any
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/coordinates", status: 200, body: { point: [1.5, 2.5] } }
            ])
          )
          const data = yield* client.getCoordinates()
          expect(data).toEqual({ point: [1.5, 2.5] })
        })
      ))

    it.effect("tuple with rest schema", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            ({
              openapi: "3.1.0",
              info: { title: "Test", version: "1.0.0" },
              paths: {
                "/data": {
                  get: {
                    operationId: "getData",
                    responses: {
                      "200": {
                        description: "OK",
                        content: {
                          "application/json": {
                            schema: {
                              type: "object",
                              required: ["values"],
                              properties: {
                                values: {
                                  type: "array",
                                  prefixItems: [{ type: "string" }],
                                  items: { type: "number" }
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
            }) as any
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/data", status: 200, body: { values: ["header", 1, 2, 3] } }
            ])
          )
          const data = yield* client.getData()
          expect(data).toEqual({ values: ["header", 1, 2, 3] })
        })
      ))

    it.effect("boolean schema items: true produces Schema.Json array", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            ({
              openapi: "3.1.0",
              info: { title: "Test", version: "1.0.0" },
              paths: {
                "/anything": {
                  get: {
                    operationId: "getAnything",
                    responses: {
                      "200": {
                        description: "OK",
                        content: {
                          "application/json": {
                            schema: {
                              type: "object",
                              required: ["items"],
                              properties: {
                                items: { type: "array", items: true }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }) as any
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/anything", status: 200, body: { items: [1, "two", true] } }
            ])
          )
          const data = yield* client.getAnything()
          expect(data).toEqual({ items: [1, "two", true] })
        })
      ))

    it.effect("$ref request body schema", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            specWithComponents(
              {
                "/pets": {
                  post: {
                    operationId: "createPet",
                    requestBody: {
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/CreatePetPayload" }
                        }
                      }
                    },
                    responses: {
                      "201": {
                        description: "Created",
                        content: {
                          "application/json": {
                            schema: {
                              type: "object",
                              properties: { id: { type: "string" }, name: { type: "string" } }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  CreatePetPayload: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: { type: "string" },
                      tag: { type: "string" }
                    }
                  }
                }
              }
            )
          )

          const mod = evalGenerated(result)
          const client = mod.make(
            mockHttpClient([
              { method: "POST", path: "/pets", status: 201, body: { id: "pet-1", name: "Fido" } }
            ])
          )
          const data = yield* client.createPet({ payload: { name: "Fido" } })
          expect(data).toEqual({ id: "pet-1", name: "Fido" })
        })
      ))
  })

  describe("multi-module", () => {
    it.effect("common module with shared schemas (success path)", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
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
                            schema: { $ref: "#/components/schemas/Pet" }
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
                            schema: { $ref: "#/components/schemas/Pet" }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  Pet: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" }
                    }
                  }
                }
              }
            )
          )

          expect(result.modules.has("_common")).toBe(true)

          const mod = evalGenerated(result, "pets")
          expect(mod.Pet).toBeDefined()

          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets", status: 200, body: { id: "1", name: "Fido" } }
            ])
          )
          const data = yield* client.listPets()
          expect(data).toEqual({ id: "1", name: "Fido" })
        })
      ))

    it.effect("$ref error schemas produce TaggedError via Body struct", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
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
                            schema: { type: "array", items: { type: "string" } }
                          }
                        }
                      },
                      "400": {
                        description: "Bad request",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/ApiError" }
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
                      },
                      "400": {
                        description: "Bad request",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/ApiError" }
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                schemas: {
                  ApiError: {
                    type: "object",
                    required: ["message"],
                    properties: { message: { type: "string" } }
                  }
                }
              }
            )
          )

          const mod = evalGenerated(result, "pets")
          const client = mod.make(
            mockHttpClient([
              { method: "GET", path: "/pets", status: 400, body: { message: "Validation failed" } }
            ])
          )
          const exit = yield* client.listPets().pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("ApiError")
          expect(error.message).toBe("Validation failed")
        })
      ))
  })

  describe("shared error schema with $ref dependencies (FastAPI pattern)", () => {
    const fastApiSpec = specWithComponents(
      {
        "/pets": {
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
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" }, name: { type: "string" } }
                    }
                  }
                }
              },
              "422": {
                description: "Validation Error",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/HTTPValidationError" }
                  }
                }
              }
            }
          }
        },
        "/users": {
          post: {
            operationId: "createUser",
            tags: ["users"],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["email"],
                    properties: { email: { type: "string" } }
                  }
                }
              }
            },
            responses: {
              "201": {
                description: "Created",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" }, email: { type: "string" } }
                    }
                  }
                }
              },
              "422": {
                description: "Validation Error",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/HTTPValidationError" }
                  }
                }
              }
            }
          }
        }
      },
      {
        schemas: {
          ValidationError: {
            type: "object",
            required: ["loc", "msg", "type"],
            properties: {
              loc: {
                type: "array",
                items: { anyOf: [{ type: "string" }, { type: "integer" }] }
              },
              msg: { type: "string" },
              type: { type: "string" }
            }
          },
          HTTPValidationError: {
            type: "object",
            properties: {
              detail: {
                type: "array",
                items: { $ref: "#/components/schemas/ValidationError" }
              }
            }
          }
        }
      }
    )

    it.effect("_common includes transitive $ref dependencies", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(fastApiSpec)

          expect(result.modules.has("_common")).toBe(true)
          const common = result.modules.get("_common")!
          expect(common.source).toContain("ValidationError")

          const mod = evalGenerated(result, "pets")
          expect(mod.HTTPValidationError).toBeDefined()
          expect(mod.ValidationError).toBeDefined()
        })
      ))

    it.effect("tag module can use shared error schema at runtime", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(fastApiSpec)

          const mod = evalGenerated(result, "pets")
          const client = mod.make(
            mockHttpClient([
              {
                method: "POST",
                path: "/pets",
                status: 422,
                body: {
                  detail: [{ loc: ["body", "name"], msg: "field required", type: "value_error.missing" }]
                }
              }
            ])
          )
          const exit = yield* client.createPet({ payload: { name: "Fido" } }).pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
          if (exit._tag !== "Failure") return
          const error = Option.getOrThrow(Cause.findErrorOption(exit.cause)) as any
          expect(error._tag).toBe("HTTPValidationError")
        })
      ))

    it.effect("tag module imports (not just re-exports) shared schemas", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(fastApiSpec)

          const petsSource = result.modules.get("pets")!.source
          expect(petsSource).toContain("import { HTTPValidationError, HTTPValidationErrorBody } from")
        })
      ))
  })

  describe("shared schema with inline enum dependencies", () => {
    const enumSpec = specWithComponents(
      {
        "/items/{itemId}": {
          get: {
            operationId: "getItem",
            tags: ["items"],
            parameters: [
              { name: "itemId", in: "path", required: true, schema: { type: "string" } }
            ],
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Item" }
                  }
                }
              }
            }
          }
        },
        "/orders/{orderId}/item": {
          get: {
            operationId: "getOrderItem",
            tags: ["orders"],
            parameters: [
              { name: "orderId", in: "path", required: true, schema: { type: "string" } }
            ],
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Item" }
                  }
                }
              }
            }
          }
        }
      },
      {
        schemas: {
          Item: {
            type: "object",
            required: ["id", "status"],
            properties: {
              id: { type: "string" },
              status: {
                type: "string",
                enum: ["active", "inactive", "archived"]
              }
            }
          }
        }
      }
    )

    it.effect("_common includes inline enum dependencies of shared schemas", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(enumSpec)

          expect(result.modules.has("_common")).toBe(true)
          const common = result.modules.get("_common")!
          expect(common.source).toContain("ItemStatus")
          expect(common.source).toContain("Item")
        })
      ))

    it.effect("tag module can use shared schema with inline enum at runtime", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(enumSpec)

          const mod = evalGenerated(result, "items")
          expect(mod.Item).toBeDefined()
          expect(mod.ItemStatus).toBeDefined()

          const client = mod.make(
            mockHttpClient([
              {
                method: "GET",
                path: "/items/item-1",
                status: 200,
                body: { id: "item-1", status: "active" }
              }
            ])
          )
          const data = yield* client.getItem("item-1")
          expect(data).toEqual({ id: "item-1", status: "active" })
        })
      ))
  })

  describe("codegen correctness", () => {
    it.effect("success handlers in matchStatus are wrapped to preserve type inference", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const source = [...result.modules.values()][0].source
          expect(source).toContain("\"2xx\": (response) => HttpClientResponse.schemaBodyJson(")
        })
      ))

    it.effect("interface includes HttpBodyError for operations with request body", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                post: {
                  operationId: "createPet",
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { name: { type: "string" } },
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
            })
          )

          const source = [...result.modules.values()][0].source
          expect(source).toContain("HttpBody.HttpBodyError")
        })
      ))

    it.effect("interface omits HttpBodyError for operations without request body", () =>
      asAny(() =>
        Effect.gen(function*() {
          const result = yield* generate(
            baseSpec({
              "/pets": {
                get: {
                  operationId: "listPets",
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
            })
          )

          const source = [...result.modules.values()][0].source
          expect(source).not.toContain("HttpBodyError")
        })
      ))
  })
})
