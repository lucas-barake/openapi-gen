export interface Annotations {
  title?: string
  description?: string
  default?: unknown
  examples?: globalThis.Array<unknown>
}

export interface Ref extends Annotations {
  $ref: string
  nullable?: boolean
}

export interface String extends Annotations {
  type: "string"
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  contentMediaType?: string
  contentSchema?: JsonSchema
  allOf?: globalThis.Array<{
    minLength?: number
    maxLength?: number
    pattern?: string
  }>
  nullable?: boolean
}

export interface Numeric extends Annotations {
  minimum?: number
  exclusiveMinimum?: number | boolean
  maximum?: number
  exclusiveMaximum?: number | boolean
  multipleOf?: number
  format?: string
  allOf?: globalThis.Array<{
    minimum?: number
    exclusiveMinimum?: number
    maximum?: number
    exclusiveMaximum?: number
    multipleOf?: number
  }>
  nullable?: boolean
}

export interface Number extends Numeric {
  type: "number"
}

export interface Integer extends Numeric {
  type: "integer"
}

export interface Array extends Annotations {
  type: "array"
  items?: JsonSchema | globalThis.Array<JsonSchema>
  minItems?: number
  maxItems?: number
  additionalItems?: JsonSchema | boolean
  nullable?: boolean
}

export interface Object extends Annotations {
  type: "object"
  required: globalThis.Array<string>
  properties: Record<string, JsonSchema>
  additionalProperties?: boolean | JsonSchema
  patternProperties?: Record<string, JsonSchema>
  propertyNames?: JsonSchema
  nullable?: boolean
}

export interface JsonSchema extends Record<string, any> {}
