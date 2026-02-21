import type * as JsonSchema from "../src/OpenApiJsonSchema.js"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as JsonSchemaGen from "../src/JsonSchemaGen.js"

const runSchema = (
  name: string,
  schema: JsonSchema.JsonSchema
) =>
  Effect.gen(function*() {
    const gen = yield* JsonSchemaGen.JsonSchemaGen
    gen.addSchema(name, schema)
    return yield* gen.generate("Schema")
  }).pipe(
    JsonSchemaGen.with,
    Effect.provide(JsonSchemaGen.layerTransformerSchema)
  )

describe("JsonSchemaGen — Schema mode", () => {
  it.effect(
    "generates S.Struct with primitive property types",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "User",
          {
            type: "object",
            required: ["name", "age", "active"],
            properties: {
              name: { type: "string" },
              age: { type: "number" },
              active: { type: "boolean" }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.Struct(")
        expect(output).toContain("\"name\": Schema.String")
        expect(output).toContain("\"age\": Schema.Number")
        expect(output).toContain("\"active\": Schema.Boolean")
      })
  )

  it.effect(
    "generates const Schema.Struct for inline schemas",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("User", {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" }
          }
        } as JsonSchema.JsonSchema)
        expect(output).toContain("export const User = Schema.Struct(")
        expect(output).toContain("\"name\": Schema.String")
      })
  )

  it.effect(
    "generates S.Literal for enum schemas",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("Status", {
          enum: ["active", "inactive", "pending"]
        } as JsonSchema.JsonSchema)
        expect(output).toContain("Schema.Literals([\"active\", \"inactive\", \"pending\"])")
      })
  )

  it.effect(
    "generates S.optionalWith for optional properties",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Config",
          {
            type: "object",
            required: [],
            properties: {
              label: { type: "string" }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain(
          "Schema.optionalKey(Schema.NullOr(Schema.String))"
        )
      })
  )

  it.effect(
    "generates S.NullOr for nullable required properties",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Config",
          {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string", nullable: true }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.NullOr(Schema.String)")
      })
  )

  it.effect(
    "generates S.Array for array types",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Tags",
          {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: { type: "string" } }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.Array(Schema.String)")
      })
  )

  it.effect(
    "generates S.NonEmptyArray when minItems > 0",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Tags",
          {
            type: "object",
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: { type: "string" },
                minItems: 1
              }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.NonEmptyArray(Schema.String)")
      })
  )

  it.effect(
    "resolves $ref and generates correct source",
    () =>
      Effect.gen(function*() {
        const gen = yield* JsonSchemaGen.JsonSchemaGen
        const context = {
          components: {
            schemas: {
              Address: {
                type: "object",
                required: ["street"],
                properties: {
                  street: { type: "string" }
                }
              }
            }
          }
        }
        gen.addSchema(
          "Person",
          {
            type: "object",
            required: ["address"],
            properties: {
              address: { $ref: "#/components/schemas/Address" }
            }
          } as JsonSchema.JsonSchema,
          context
        )
        const output = yield* gen.generate("Schema")
        expect(output).toContain("Schema.Class<Address>(\"Address\")")
        expect(output).toContain("\"street\": Schema.String")
        expect(output).toContain("\"address\": Address")
      }).pipe(
        JsonSchemaGen.with,
        Effect.provide(JsonSchemaGen.layerTransformerSchema)
      )
  )

  it.effect(
    "generates string constraints via .pipe",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Form",
          {
            type: "object",
            required: ["code"],
            properties: {
              code: {
                type: "string",
                minLength: 3,
                maxLength: 10,
                pattern: "^[A-Z]+$"
              }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.String.pipe(")
        expect(output).toContain("Schema.check(Schema.isMinLength(3))")
        expect(output).toContain("Schema.check(Schema.isMaxLength(10))")
        expect(output).toContain("Schema.check(Schema.isPattern(")
      })
  )

  it.effect(
    "generates number constraints via .pipe",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Range",
          {
            type: "object",
            required: ["value"],
            properties: {
              value: {
                type: "number",
                minimum: 0,
                maximum: 100
              }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.Number.pipe(")
        expect(output).toContain("Schema.check(Schema.isGreaterThanOrEqualTo(0))")
        expect(output).toContain("Schema.check(Schema.isLessThanOrEqualTo(100))")
      })
  )

  it.effect(
    "generates S.Union for anyOf schemas",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("StringOrNumber", {
          anyOf: [{ type: "string" }, { type: "number" }]
        } as JsonSchema.JsonSchema)
        expect(output).toContain("Schema.Union([")
        expect(output).toContain("Schema.String")
        expect(output).toContain("Schema.Number")
      })
  )

  it.effect(
    "merges properties from allOf within an object property",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Parent",
          {
            type: "object",
            required: ["child"],
            properties: {
              child: {
                allOf: [
                  {
                    type: "object",
                    required: ["a"],
                    properties: { a: { type: "string" } }
                  },
                  {
                    type: "object",
                    required: ["b"],
                    properties: { b: { type: "number" } }
                  }
                ]
              }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("\"a\": Schema.String")
        expect(output).toContain("\"b\": Schema.Number")
      })
  )

  it.effect(
    "cleanupSchema converts type array with null to nullable",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Wrapper",
          {
            type: "object",
            required: ["value"],
            properties: {
              value: { type: ["string", "null"] }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.NullOr(Schema.String)")
      })
  )

  it.effect(
    "nullable with null default produces withDecodingDefault with null",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Config",
          {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string", nullable: true, default: null }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain(
          "Schema.NullOr(Schema.String).pipe(Schema.withDecodingDefault(() => null))"
        )
      })
  )

  it.effect(
    "required property with non-null default produces withDecodingDefault",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Config",
          {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string", default: "foo" }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.withDecodingDefault")
        expect(output).toContain("\"foo\"")
      })
  )

  it.effect(
    "null type produces S.Null",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("NullVal", {
          type: "null"
        } as unknown as JsonSchema.JsonSchema)
        expect(output).toContain("Schema.Null")
      })
  )

  it.effect(
    "object type without properties produces S.Record",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("Dict", {
          type: "object"
        } as unknown as JsonSchema.JsonSchema)
        expect(output).toContain("Schema.Record(")
        expect(output).toContain("Schema.String")
        expect(output).toContain("Schema.Json")
      })
  )

  it.effect(
    "const value produces S.Literal",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema("Active", {
          const: "active"
        } as unknown as JsonSchema.JsonSchema)
        expect(output).toContain("Schema.Literal(\"active\")")
      })
  )

  it.effect(
    "binary string format produces S.instanceOf(globalThis.Blob)",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Upload",
          {
            type: "object",
            required: ["file"],
            properties: {
              file: { type: "string", format: "binary" }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.instanceOf(globalThis.Blob)")
      })
  )

  it.effect(
    "integer type produces S.Int",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Counter",
          {
            type: "object",
            required: ["count"],
            properties: {
              count: { type: "integer" }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.Int")
      })
  )

  it.effect(
    "filterNullable strips null from anyOf and marks nullable",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "MaybeString",
          {
            type: "object",
            required: ["value"],
            properties: {
              value: {
                anyOf: [{ type: "string" }, { type: "null" }]
              }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.NullOr(Schema.String)")
      })
  )

  it.effect(
    "$ref not starting with # returns Option.none()",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "External",
          {
            type: "object",
            required: ["data"],
            properties: {
              data: { $ref: "https://example.com/schema.json" }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).not.toContain("data")
      })
  )

  it.effect(
    "exclusiveMinimum/exclusiveMaximum number constraints",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Range",
          {
            type: "object",
            required: ["value"],
            properties: {
              value: {
                type: "number",
                exclusiveMinimum: 0,
                exclusiveMaximum: 100
              }
            }
          } as unknown as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.check(Schema.isGreaterThan(0))")
        expect(output).toContain("Schema.check(Schema.isLessThan(100))")
      })
  )

  it.effect(
    "array with maxItems constraint",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Tags",
          {
            type: "object",
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: { type: "string" },
                maxItems: 5
              }
            }
          } as JsonSchema.JsonSchema        )
        expect(output).toContain("Schema.Array(Schema.String)")
        expect(output).toContain("Schema.check(Schema.isMaxLength(5))")
      })
  )
})

describe("JsonSchemaGen — boolean schemas (OpenAPI 3.1)", () => {
  it.effect(
    "strict tuple (items: false) generates Schema.Tuple",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Coords",
          {
            type: "object",
            required: ["coords"],
            properties: {
              coords: {
                type: "array",
                prefixItems: [{ type: "number" }, { type: "number" }],
                items: false
              }
            }
          } as any        )
        expect(output).toContain("Schema.Tuple([Schema.Number, Schema.Number])")
      })
  )

  it.effect(
    "items: true generates Schema.Array(Schema.Json)",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "AnyList",
          {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: true }
            }
          } as any        )
        expect(output).toContain("Schema.Array(Schema.Json)")
      })
  )

  it.effect(
    "tuple with rest schema generates Schema.Tuple([...], rest)",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "HeadAndTail",
          {
            type: "object",
            required: ["data"],
            properties: {
              data: {
                type: "array",
                prefixItems: [{ type: "string" }],
                items: { type: "number" }
              }
            }
          } as any        )
        expect(output).toContain("Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number])")
      })
  )

  it.effect(
    "prefixItems with $ref elements resolves refs in tuple",
    () =>
      Effect.gen(function*() {
        const gen = yield* JsonSchemaGen.JsonSchemaGen
        const context = {
          components: {
            schemas: {
              Point: {
                type: "object",
                required: ["x", "y"],
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                }
              }
            }
          }
        }
        gen.addSchema(
          "Line",
          {
            type: "object",
            required: ["endpoints"],
            properties: {
              endpoints: {
                type: "array",
                prefixItems: [
                  { $ref: "#/components/schemas/Point" },
                  { $ref: "#/components/schemas/Point" }
                ],
                items: false
              }
            }
          } as any,
          context
        )
        const output = yield* gen.generate("Schema")
        expect(output).toContain("Schema.Tuple([Point, Point])")
        expect(output).toContain("Schema.Class<Point>(\"Point\")")
      }).pipe(
        JsonSchemaGen.with,
        Effect.provide(JsonSchemaGen.layerTransformerSchema)
      )
  )

  it.effect(
    "nested tuple in object property",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "GeoData",
          {
            type: "object",
            required: ["position"],
            properties: {
              position: {
                type: "array",
                prefixItems: [{ type: "number" }, { type: "number" }, { type: "number" }],
                items: false
              }
            }
          } as any        )
        expect(output).toContain("Schema.Tuple([Schema.Number, Schema.Number, Schema.Number])")
      })
  )
})

describe("JsonSchemaGen — branded IDs", () => {
  it.effect(
    "brands 'id' field using parent schema name",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Pet",
          {
            type: "object",
            required: ["id", "name"],
            properties: {
              id: { type: "string" },
              name: { type: "string" }
            }
          } as JsonSchema.JsonSchema
        )
        expect(output).toContain("Schema.String.pipe(Schema.brand(\"PetId\"))")
        expect(output).toContain("\"id\": PetId")
      })
  )

  it.effect(
    "brands camelCase *Id fields",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Order",
          {
            type: "object",
            required: ["userId", "productId"],
            properties: {
              userId: { type: "string" },
              productId: { type: "integer" }
            }
          } as unknown as JsonSchema.JsonSchema
        )
        expect(output).toContain("Schema.String.pipe(Schema.brand(\"UserId\"))")
        expect(output).toContain("Schema.Int.pipe(Schema.brand(\"ProductId\"))")
        expect(output).toContain("\"userId\": UserId")
        expect(output).toContain("\"productId\": ProductId")
      })
  )

  it.effect(
    "brands snake_case *_id fields",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Comment",
          {
            type: "object",
            required: ["user_id"],
            properties: {
              user_id: { type: "string" }
            }
          } as JsonSchema.JsonSchema
        )
        expect(output).toContain("Schema.String.pipe(Schema.brand(\"UserId\"))")
        expect(output).toContain("\"user_id\": UserId")
      })
  )

  it.effect(
    "brands uuid format fields with Schema.UUID",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "Entity",
          {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string", format: "uuid" }
            }
          } as JsonSchema.JsonSchema
        )
        expect(output).toContain("Schema.String.pipe(Schema.check(Schema.isUUID(undefined))).pipe(Schema.brand(\"EntityId\"))")
      })
  )

  it.effect(
    "deduplicates brands across properties",
    () =>
      Effect.gen(function*() {
        const gen = yield* JsonSchemaGen.JsonSchemaGen
        gen.addSchema("Order", {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        } as JsonSchema.JsonSchema)
        gen.addSchema("Comment", {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        } as JsonSchema.JsonSchema)
        const output = yield* gen.generate("Schema")
        const matches = output.match(/Schema\.brand\("UserId"\)/g)
        expect(matches).toHaveLength(1)
      }).pipe(
        JsonSchemaGen.with,
        Effect.provide(JsonSchemaGen.layerTransformerSchema)
      )
  )

  it.effect(
    "does not brand non-id string fields",
    () =>
      Effect.gen(function*() {
        const output = yield* runSchema(
          "User",
          {
            type: "object",
            required: ["name", "email"],
            properties: {
              name: { type: "string" },
              email: { type: "string" }
            }
          } as JsonSchema.JsonSchema
        )
        expect(output).not.toContain("Schema.brand")
      })
  )
})
