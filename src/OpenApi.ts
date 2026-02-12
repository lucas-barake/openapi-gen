import type { OpenAPISpec, OpenAPISpecMethodName, OpenAPISpecPathItem } from "@effect/platform/OpenApi"
import type * as JsonSchema from "@effect/platform/OpenApiJsonSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { DeepMutable } from "effect/Types"
import { convertObj } from "swagger2openapi"
import * as JsonSchemaGen from "./JsonSchemaGen.js"
import { camelize, identifier, nonEmptyString, toComment } from "./Utils.js"

const methodNames: ReadonlyArray<OpenAPISpecMethodName> = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace"
]

const httpClientMethodNames: Record<OpenAPISpecMethodName, string> = {
  get: "get",
  put: "put",
  post: "post",
  delete: "del",
  options: "options",
  head: "head",
  patch: "patch",
  trace: `make("TRACE")`
}

interface ParsedOperation {
  readonly id: string
  readonly method: OpenAPISpecMethodName
  readonly description: Option.Option<string>
  readonly tags: ReadonlyArray<string>
  readonly params?: string
  readonly paramsOptional: boolean
  readonly urlParams: ReadonlyArray<string>
  readonly headers: ReadonlyArray<string>
  readonly payload?: string
  readonly payloadFormData: boolean
  readonly pathIds: ReadonlyArray<string>
  readonly pathTemplate: string
  readonly successSchemas: ReadonlyMap<string, string>
  readonly errorSchemas: ReadonlyMap<string, string>
  readonly objectErrorSchemas: ReadonlySet<string>
  readonly voidSchemas: ReadonlySet<string>
  readonly schemaNames: ReadonlySet<string>
  readonly streamSchema?: string
}

export interface GenerateResult {
  readonly modules: ReadonlyMap<string, TagModule>
}

export interface TagModule {
  readonly source: string
  readonly schemaNames: ReadonlySet<string>
  readonly operations: ReadonlyArray<ParsedOperation>
}

export const make = Effect.gen(function*() {
  const isV2 = (spec: object) => "swagger" in spec

  const convert = Effect.fn("OpenApi.convert")((v2Spec: unknown) =>
    Effect.async<OpenAPISpec>((resume) => {
      convertObj(
        v2Spec as any,
        { laxDefaults: true, laxurls: true, patch: true, warnOnly: true },
        (err, result) => {
          if (err) {
            resume(Effect.die(err))
          } else {
            resume(Effect.succeed(result.openapi as any))
          }
        }
      )
    })
  )

  const generate = Effect.fnUntraced(
    function*(
      spec: OpenAPISpec,
      options: {
        readonly name: string
        readonly ext?: string
      }
    ) {
      if (isV2(spec)) {
        spec = yield* convert(spec)
      }
      const gen = yield* JsonSchemaGen.JsonSchemaGen
      const components = spec.components
        ? { ...spec.components }
        : { schemas: {} }
      const context = { components }
      const operations: Array<ParsedOperation> = []

      function resolveRef(ref: string) {
        const parts = ref.split("/").slice(1)
        let current: any = spec
        for (const part of parts) {
          current = current[part]
        }
        return current
      }

      const handlePath = (path: string, methods: OpenAPISpecPathItem) =>
        methodNames
          .filter((method) => !!methods[method])
          .forEach((method) => {
            const { ids: pathIds, path: pathTemplate } = processPath(path)
            const operation = methods[method]!
            const id = operation.operationId
              ? camelize(operation.operationId!)
              : `${method.toUpperCase()}${path}`
            const tags: Array<string> = operation.tags ?? ["_untagged"]
            const op: DeepMutable<ParsedOperation> & {
              description: Option.Option<string>
              schemaNames: Set<string>
            } = {
              id,
              method,
              tags,
              description: nonEmptyString(operation.description).pipe(
                Option.orElse(() => nonEmptyString(operation.summary))
              ) as any,
              pathIds,
              pathTemplate,
              urlParams: [],
              headers: [],
              payloadFormData: false,
              successSchemas: new Map(),
              errorSchemas: new Map(),
              objectErrorSchemas: new Set(),
              voidSchemas: new Set(),
              paramsOptional: true,
              schemaNames: new Set()
            }
            const schemaId = identifier(operation.operationId ?? path)
            const validParameters = operation.parameters?.filter(
              (_) => _.in !== "path" && _.in !== "cookie"
            ) ?? []
            if (validParameters.length > 0) {
              const schema: JsonSchema.Object = {
                type: "object",
                properties: {},
                required: []
              }
              validParameters.forEach((parameter) => {
                if ("$ref" in parameter) {
                  parameter = resolveRef(parameter.$ref as string)
                }
                if (parameter.in === "path" || parameter.in === "cookie") {
                  return
                }
                const paramSchema = parameter.schema
                const added: Array<string> = []
                if ("properties" in paramSchema) {
                  const required = paramSchema.required ?? []
                  Object.entries(paramSchema.properties).forEach(
                    ([name, propSchema]) => {
                      const adjustedName = `${parameter.name}[${name}]`
                      schema.properties[adjustedName] = propSchema
                      if (required.includes(name)) {
                        schema.required.push(adjustedName)
                      }
                      added.push(adjustedName)
                    }
                  )
                } else {
                  schema.properties[parameter.name] = parameter.schema
                  if (parameter.required) {
                    schema.required.push(parameter.name)
                  }
                  added.push(parameter.name)
                }
                if (parameter.in === "query") {
                  op.urlParams.push(...added)
                } else if (parameter.in === "header") {
                  op.headers.push(...added)
                }
              })
              if (Object.keys(schema.properties).length > 0) {
                op.params = gen.addSchema(
                  `${schemaId}Params`,
                  schema,
                  context,
                  true
                )
                op.paramsOptional = !schema.required || schema.required.length === 0
              }
            }
            if (operation.requestBody?.content?.["application/json"]?.schema) {
              op.payload = gen.addSchema(
                `${schemaId}Request`,
                operation.requestBody.content["application/json"].schema,
                context
              )
            } else if (
              operation.requestBody?.content?.["multipart/form-data"]
            ) {
              op.payload = gen.addSchema(
                `${schemaId}Request`,
                operation.requestBody.content["multipart/form-data"].schema,
                context
              )
              op.payloadFormData = true
            }
            let defaultSchema: string | undefined
            Object.entries(operation.responses ?? {}).forEach(
              ([status, response]) => {
                while ("$ref" in response) {
                  response = resolveRef(response.$ref as string)
                }
                if (response.content?.["application/json"]?.schema) {
                  const schemaName = gen.addSchema(
                    `${schemaId}${status}`,
                    response.content["application/json"].schema,
                    context,
                    true
                  )
                  if (status === "default") {
                    defaultSchema = schemaName
                    return
                  }
                  const statusLower = status.toLowerCase()
                  const statusMajorNumber = Number(status[0])
                  if (isNaN(statusMajorNumber)) {
                    return
                  } else if (statusMajorNumber < 4) {
                    op.successSchemas.set(statusLower, schemaName)
                  } else {
                    gen.markAsError(schemaName)
                    op.errorSchemas.set(statusLower, schemaName)
                    let errorSchema = response.content["application/json"].schema
                    if ("$ref" in errorSchema) {
                      errorSchema = resolveRef(errorSchema.$ref as string)
                    }
                    if ("allOf" in errorSchema && Array.isArray(errorSchema.allOf)) {
                      const merged: any = { properties: {}, required: [] as Array<string> }
                      for (const member of errorSchema.allOf) {
                        const resolved = "$ref" in member ? resolveRef(member.$ref as string) : member
                        Object.assign(merged, resolved)
                        Object.assign(merged.properties, resolved.properties ?? {})
                        merged.required = merged.required.concat(resolved.required ?? [])
                      }
                      errorSchema = merged
                    }
                    if ("properties" in errorSchema) {
                      op.objectErrorSchemas.add(schemaName)
                    }
                  }
                }
                const eventStreamContent = (response.content as any)?.["text/event-stream"]
                if (!op.streamSchema && eventStreamContent?.schema) {
                  op.streamSchema = gen.addSchema(
                    `${schemaId}StreamEvent`,
                    eventStreamContent.schema,
                    context,
                    true
                  )
                }
                if (!response.content) {
                  const statusMajor = Number(status[0])
                  if (!isNaN(statusMajor) && statusMajor < 4) {
                    op.voidSchemas.add(status.toLowerCase())
                  }
                }
              }
            )
            if (op.successSchemas.size === 0 && defaultSchema) {
              op.successSchemas.set("2xx", defaultSchema)
            }
            if (op.params) op.schemaNames.add(op.params)
            if (op.payload) op.schemaNames.add(op.payload)
            for (const name of op.successSchemas.values()) op.schemaNames.add(name)
            for (const name of op.errorSchemas.values()) op.schemaNames.add(name)
            if (defaultSchema) op.schemaNames.add(defaultSchema)
            if (op.streamSchema) op.schemaNames.add(op.streamSchema)
            operations.push(op)
          })

      Object.entries(spec.paths).forEach(([path, methods]) => handlePath(path, methods))

      const transformer = yield* OpenApiTransformer

      const tagGroups = new Map<string, Array<ParsedOperation>>()
      for (const op of operations) {
        const tag = op.tags[0] ?? "_untagged"
        let group = tagGroups.get(tag)
        if (!group) {
          group = []
          tagGroups.set(tag, group)
        }
        group.push(op)
      }

      const tagSchemaNames = new Map<string, Set<string>>()
      for (const [tag, ops] of tagGroups) {
        const names = new Set<string>()
        for (const op of ops) {
          for (const name of op.schemaNames) {
            names.add(name)
          }
        }
        tagSchemaNames.set(tag, names)
      }

      const commonSchemaNames = new Set<string>()
      const allSchemaNames = new Set<string>()
      for (const names of tagSchemaNames.values()) {
        for (const name of names) {
          allSchemaNames.add(name)
        }
      }
      for (const name of allSchemaNames) {
        let count = 0
        for (const names of tagSchemaNames.values()) {
          if (names.has(name)) count++
        }
        if (count > 1) {
          commonSchemaNames.add(name)
        }
      }

      const modules = new Map<string, TagModule>()

      if (commonSchemaNames.size > 0) {
        const commonSchemas = yield* gen.generate("Schema", commonSchemaNames)
        modules.set("_common", {
          source: `${transformer.imports}\n\n${commonSchemas}`,
          schemaNames: commonSchemaNames,
          operations: []
        })
      }

      for (const [tag, ops] of tagGroups) {
        const tagOnlySchemas = new Set<string>()
        const schemas = tagSchemaNames.get(tag)!
        for (const name of schemas) {
          if (!commonSchemaNames.has(name)) {
            tagOnlySchemas.add(name)
          }
        }
        const tagSchemas = yield* gen.generate("Schema", tagOnlySchemas)

        const commonReexports = commonSchemaNames.size > 0
          ? [...schemas].filter((n) => commonSchemaNames.has(n))
          : []
        const errorBodyNames: Array<string> = []
        for (const op of ops) {
          for (const name of op.objectErrorSchemas) {
            if (commonSchemaNames.has(name) && !errorBodyNames.includes(`${name}Body`)) {
              errorBodyNames.push(`${name}Body`)
            }
          }
        }
        const allReexports = [...commonReexports, ...errorBodyNames]
        const commonImportPath = `./_common${options.ext ?? ".js"}`
        const commonReexportLine = allReexports.length > 0
          ? `import { ${allReexports.join(", ")} } from "${commonImportPath}"\nexport { ${allReexports.join(", ")} }`
          : ""

        const hasStreaming = ops.some((op) => !!op.streamSchema)
        const streamingImports = hasStreaming
          ? `import * as Sse from "@effect/experimental/Sse"\nimport * as Stream from "effect/Stream"`
          : ""

        const parts = [transformer.imports]
        if (streamingImports) parts.push(streamingImports)
        if (commonReexportLine) parts.push(commonReexportLine)
        if (tagSchemas) parts.push(tagSchemas)
        parts.push(transformer.toImplementation(options.name, ops))
        parts.push(transformer.toTypes(options.name, ops))

        modules.set(tag, {
          source: parts.filter(Boolean).join("\n\n"),
          schemaNames: schemas,
          operations: ops
        })
      }

      return { modules } as GenerateResult
    },
    JsonSchemaGen.with,
    (effect) => Effect.provide(effect, layerTransformerSchema)
  )

  return { generate } as const
})

export class OpenApi extends Effect.Tag("OpenApi")<
  OpenApi,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(OpenApi, make)
}

export class OpenApiTransformer extends Context.Tag("OpenApiTransformer")<
  OpenApiTransformer,
  {
    readonly imports: string
    readonly toTypes: (
      name: string,
      operations: ReadonlyArray<ParsedOperation>
    ) => string
    readonly toImplementation: (
      name: string,
      operations: ReadonlyArray<ParsedOperation>
    ) => string
  }
>() {}

export const layerTransformerSchema = Layer.sync(OpenApiTransformer, () => {
  const operationsToInterface = (
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const methods: Array<string> = []
    for (const op of operations) {
      methods.push(operationToMethod(op))
      if (op.streamSchema) {
        methods.push(operationToStreamMethod(op))
      }
    }
    return `export interface ${name} {\n  ${methods.join("\n  ")}\n}`
  }

  const buildOptionsArgs = (operation: ParsedOperation) => {
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      args.push(...operation.pathIds.map((id) => `${id}: string`))
    }
    const optionFields: Array<string> = []
    if (operation.params) {
      optionFields.push(
        `readonly params${operation.paramsOptional ? "?" : ""}: typeof ${operation.params}.Encoded`
      )
    }
    if (operation.payload) {
      optionFields.push(`readonly payload: typeof ${operation.payload}.Type`)
    }
    optionFields.push(`readonly headers?: Headers.Input`)
    const hasRequired = !!operation.payload || (!!operation.params && !operation.paramsOptional)
    args.push(`options${hasRequired ? "" : "?"}: { ${optionFields.join("; ")} }`)
    return args
  }

  const operationToMethod = (operation: ParsedOperation) => {
    const args = buildOptionsArgs(operation)
    let success = "void"
    if (operation.successSchemas.size > 0) {
      success = Array.from(operation.successSchemas.values())
        .map((schema) => `typeof ${schema}.Type`)
        .join(" | ")
    }
    const errors = ["HttpClientError.HttpClientError", "ParseError"]
    if (operation.payload) errors.push("HttpBody.HttpBodyError")
    if (operation.errorSchemas.size > 0) {
      errors.push(
        ...Array.from(operation.errorSchemas.values())
      )
    }
    return `${toComment(operation.description)}readonly "${operation.id}": (${
      args.join(", ")
    }) => Effect.Effect<${success}, ${errors.join(" | ")}>`
  }

  const operationToStreamMethod = (operation: ParsedOperation) => {
    const args = buildOptionsArgs(operation)
    const errors = ["HttpClientError.HttpClientError", "ParseError"]
    if (operation.payload) errors.push("HttpBody.HttpBodyError")
    if (operation.errorSchemas.size > 0) {
      errors.push(...Array.from(operation.errorSchemas.values()))
    }
    return `readonly "${operation.id}Stream": (${
      args.join(", ")
    }) => Stream.Stream<typeof ${operation.streamSchema}.Type, ${errors.join(" | ")}>`
  }

  const operationsToImpl = (
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const methods: Array<string> = []
    for (const op of operations) {
      methods.push(operationToImpl(op))
      if (op.streamSchema) {
        methods.push(operationToStreamImpl(op))
      }
    }
    return `${unexpectedStatusSource}

export const make = (httpClient: HttpClient.HttpClient): ${name} => ({
  ${methods.join(",\n  ")}
})`
  }

  const operationToImpl = (operation: ParsedOperation) => {
    const args: Array<string> = [...operation.pathIds, "options"]

    const requestPipeline: Array<string> = []
    if (operation.params) {
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": options?.params?.["${param}"] as any`
        )
        requestPipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": options?.params?.["${param}"] ?? undefined`
        )
        requestPipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }
    requestPipeline.push(`HttpClientRequest.setHeaders(options?.headers ?? {})`)

    const decodes: Array<string> = []
    const singleSuccessCode = operation.successSchemas.size === 1
    operation.successSchemas.forEach((schema, status) => {
      const statusCode = singleSuccessCode && status.startsWith("2") ? "2xx" : status
      decodes.push(`"${statusCode}": (response) => HttpClientResponse.schemaBodyJson(${schema})(response)`)
    })
    operation.errorSchemas.forEach((schema, status) => {
      if (operation.objectErrorSchemas.has(schema)) {
        decodes.push(
          `"${status}": (response) => HttpClientResponse.schemaBodyJson(${schema}Body)(response).pipe(Effect.map((body) => new ${schema}(body)), Effect.flatMap(Effect.fail))`
        )
      } else {
        decodes.push(
          `"${status}": (response) => HttpClientResponse.schemaBodyJson(${schema})(response).pipe(Effect.flatMap(Effect.fail))`
        )
      }
    })
    operation.voidSchemas.forEach((status) => {
      decodes.push(`"${status}": () => Effect.void`)
    })
    decodes.push(`orElse: unexpectedStatus`)

    const matchStatus = `HttpClientResponse.matchStatus({
      ${decodes.join(",\n      ")}
    })`

    if (operation.payload) {
      if (operation.payloadFormData) {
        requestPipeline.push(`HttpClientRequest.bodyFormDataRecord(options.payload as any)`)
      } else {
        requestPipeline.push(`HttpClientRequest.schemaBodyJson(${operation.payload})(options.payload)`)
        return (
          `"${operation.id}": (${args.join(", ")}) =>\n    ` +
          `HttpClientRequest.${httpClientMethodNames[operation.method]}(${operation.pathTemplate}).pipe(\n      ` +
          `${requestPipeline.join(",\n      ")},\n      ` +
          `Effect.flatMap((request) => httpClient.execute(request)),\n      ` +
          `Effect.flatMap(${matchStatus}),\n      ` +
          `Effect.scoped,\n    )`
        )
      }
    }
    return (
      `"${operation.id}": (${args.join(", ")}) =>\n    ` +
      `httpClient.execute(\n      ` +
      `HttpClientRequest.${httpClientMethodNames[operation.method]}(${operation.pathTemplate}).pipe(\n        ` +
      `${requestPipeline.join(",\n        ")},\n      ` +
      `)\n    ).pipe(\n      ` +
      `Effect.flatMap(${matchStatus}),\n      ` +
      `Effect.scoped,\n    )`
    )
  }

  const operationToStreamImpl = (operation: ParsedOperation) => {
    const args: Array<string> = [...operation.pathIds, "options"]

    const requestPipeline: Array<string> = []
    if (operation.params) {
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": options?.params?.["${param}"] as any`
        )
        requestPipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
    }
    requestPipeline.push(`HttpClientRequest.setHeaders(options?.headers ?? {})`)

    if (operation.payload && !operation.payloadFormData) {
      requestPipeline.push(`HttpClientRequest.schemaBodyJson(${operation.payload})(options.payload)`)
      return (
        `"${operation.id}Stream": (${args.join(", ")}) =>\n    ` +
        `HttpClientRequest.${httpClientMethodNames[operation.method]}(${operation.pathTemplate}).pipe(\n      ` +
        `${requestPipeline.join(",\n      ")},\n      ` +
        `Effect.flatMap((request) => httpClient.execute(request)),\n      ` +
        `Effect.map((response) => response.stream),\n      ` +
        `Stream.unwrapScoped,\n      ` +
        `Stream.decodeText(),\n      ` +
        `Stream.pipeThroughChannel(Sse.makeChannel()),\n      ` +
        `Stream.mapEffect((event) => Schema.decode(Schema.parseJson(${operation.streamSchema}))(event.data)),\n    )`
      )
    }
    return (
      `"${operation.id}Stream": (${args.join(", ")}) =>\n    ` +
      `httpClient.execute(\n      ` +
      `HttpClientRequest.${httpClientMethodNames[operation.method]}(${operation.pathTemplate}).pipe(\n        ` +
      `${requestPipeline.join(",\n        ")},\n      ` +
      `)\n    ).pipe(\n      ` +
      `Effect.map((response) => response.stream),\n      ` +
      `Stream.unwrapScoped,\n      ` +
      `Stream.decodeText(),\n      ` +
      `Stream.pipeThroughChannel(Sse.makeChannel()),\n      ` +
      `Stream.mapEffect((event) => Schema.decode(Schema.parseJson(${operation.streamSchema}))(event.data)),\n    )`
    )
  }

  return OpenApiTransformer.of({
    imports: [
      "import type * as HttpClient from \"@effect/platform/HttpClient\"",
      "import * as HttpClientError from \"@effect/platform/HttpClientError\"",
      "import type * as HttpBody from \"@effect/platform/HttpBody\"",
      "import type * as Headers from \"@effect/platform/Headers\"",
      "import * as HttpClientRequest from \"@effect/platform/HttpClientRequest\"",
      "import * as HttpClientResponse from \"@effect/platform/HttpClientResponse\"",
      "import * as Effect from \"effect/Effect\"",
      "import type { ParseError } from \"effect/ParseResult\"",
      "import * as Schema from \"effect/Schema\""
    ].join("\n"),
    toTypes: operationsToInterface,
    toImplementation: operationsToImpl
  })
}).pipe(Layer.merge(JsonSchemaGen.layerTransformerSchema))

const processPath = (path: string) => {
  const ids: Array<string> = []
  path = path.replace(/{([^}]+)}/g, (_, name) => {
    const id = camelize(name)
    ids.push(id)
    return "${" + id + "}"
  })
  return { path: "`" + path + "`", ids } as const
}

const unexpectedStatusSource = `const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.flatMap(
    Effect.orElseSucceed(response.json, () => "Unexpected status code"),
    (description) =>
      Effect.fail(
        new HttpClientError.ResponseError({
          request: response.request,
          response,
          reason: "StatusCode",
          description: typeof description === "string" ? description : JSON.stringify(description),
        }),
      ),
  )`
