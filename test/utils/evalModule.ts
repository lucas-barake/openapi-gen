import * as Sse from "@effect/experimental/Sse"
import * as HttpClientError from "@effect/platform/HttpClientError"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { transformSync } from "esbuild"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { GenerateResult } from "../../src/OpenApi.js"

const deps: Record<string, unknown> = {
  Schema,
  Effect,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
  Sse,
  Stream
}

const depNames = Object.keys(deps)
const depValues = Object.values(deps)

const stripInterfaceBlocks = (source: string): string => {
  const lines = source.split("\n")
  const out: Array<string> = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].startsWith("export interface ")) {
      let depth = 0
      let found = false
      while (i < lines.length) {
        for (const ch of lines[i]) {
          if (ch === "{") depth++
          if (ch === "}") depth--
        }
        i++
        if (found && depth === 0) break
        if (depth > 0) found = true
        if (depth === 0 && found) break
      }
    } else {
      out.push(lines[i])
      i++
    }
  }
  return out.join("\n")
}

const stripSource = (source: string): string => {
  let result = source
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .join("\n")

  result = stripInterfaceBlocks(result)

  result = result.replace(/^export type \w+.*$/gm, "")

  result = result.replace(/^export \{[^}]*\} from "[^"]*"$/gm, "")

  result = result.replace(/^export (class|const) /gm, "$1 ")

  return result
}

const collectNames = (jsSource: string): Array<string> => {
  const names: Array<string> = []
  const constRe = /^(?:const|let|var) (\w+)/gm
  const classRe = /^class (\w+)/gm
  let match
  while ((match = constRe.exec(jsSource)) !== null) names.push(match[1])
  while ((match = classRe.exec(jsSource)) !== null) names.push(match[1])
  return names
}

const evalSource = (
  tsSource: string,
  extraDeps?: Record<string, unknown>
): Record<string, any> => {
  const stripped = stripSource(tsSource)
  const { code: jsCode } = transformSync(stripped, { loader: "ts" })

  const names = collectNames(jsCode)
  const extraNames = Object.keys(extraDeps ?? {})

  const allDepNames = [...depNames, ...extraNames]
  const allDepValues = [...depValues, ...Object.values(extraDeps ?? {})]

  const allNames = [...names, ...extraNames]
  const body = jsCode + "\nreturn { " + allNames.join(", ") + " };"
  const fn = new Function(...allDepNames, body)
  return fn(...allDepValues)
}

export const evalGenerated = (
  result: GenerateResult,
  tag?: string
): Record<string, any> => {
  const commonModule = result.modules.get("_common")
  let commonExports: Record<string, unknown> = {}

  if (commonModule) {
    commonExports = evalSource(commonModule.source)
  }

  if (tag) {
    const tagModule = result.modules.get(tag)
    if (!tagModule) throw new Error(`Tag module "${tag}" not found`)
    return evalSource(tagModule.source, commonExports)
  }

  const nonCommonModules = [...result.modules.entries()].filter(
    ([key]) => key !== "_common"
  )
  if (nonCommonModules.length === 0) throw new Error("No non-common modules found")
  if (nonCommonModules.length > 1 && !tag) {
    throw new Error(
      `Multiple non-common modules found (${nonCommonModules.map(([k]) => k).join(", ")}), specify a tag`
    )
  }
  return evalSource(nonCommonModules[0][1].source, commonExports)
}
