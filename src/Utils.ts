import { flow } from "effect/Function"
import * as Option from "effect/Option"
import * as String from "effect/String"

export const camelize = (self: string): string => {
  let str = ""
  let hadSymbol = false
  for (let i = 0; i < self.length; i++) {
    const charCode = self.charCodeAt(i)
    if (
      (charCode >= 65 && charCode <= 90) ||
      (charCode >= 97 && charCode <= 122)
    ) {
      str += hadSymbol ? self[i].toUpperCase() : self[i]
      hadSymbol = false
    } else if (charCode >= 48 && charCode <= 57) {
      if (str.length > 0) {
        str += self[i]
        hadSymbol = true
      }
    } else if (str.length > 0) {
      hadSymbol = true
    }
  }
  return str
}

export const identifier = (operationId: string) => String.capitalize(camelize(operationId))

export const toKebabCase = (self: string): string => {
  if (self.length === 0) return ""
  let result = self
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return result
}

const ID_PATTERN = /^id$|Id$|_id$|ID$|^uuid$|Uuid$|_uuid$/

export const isIdField = (key: string): boolean => ID_PATTERN.test(key)

export const brandNameForId = (key: string, parentName: string): string => {
  if (key === "id" || key === "uuid") return `${parentName}${String.capitalize(key)}`
  return identifier(key)
}

export const nonEmptyString = flow(
  Option.fromNullable<unknown>,
  Option.filter(String.isString),
  Option.map(String.trim),
  Option.filter(String.isNonEmpty)
)

export const toComment = Option.match({
  onNone: () => "",
  onSome: (description: string) =>
    `/**
* ${description.replace(/\*\//g, " * /").split("\n").join("\n* ")}
*/\n`
})
