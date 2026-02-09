import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { camelize, identifier, nonEmptyString, toComment, toKebabCase } from "../src/Utils.js"

describe("camelize", () => {
  it("converts snake_case", () => {
    expect(camelize("get_user_name")).toBe("getUserName")
  })

  it("converts kebab-case", () => {
    expect(camelize("get-user-name")).toBe("getUserName")
  })

  it("passes through PascalCase", () => {
    expect(camelize("GetUserName")).toBe("GetUserName")
  })

  it("passes through camelCase", () => {
    expect(camelize("getUserName")).toBe("getUserName")
  })

  it("strips leading numbers", () => {
    expect(camelize("123abc")).toBe("abc")
  })

  it("keeps numbers mid-string and capitalizes the next letter", () => {
    expect(camelize("v2List")).toBe("v2List")
    expect(camelize("get2ndItem")).toBe("get2NdItem")
  })

  it("strips non-alphanumeric symbols", () => {
    expect(camelize("get@user!name")).toBe("getUserName")
  })

  it("returns empty string for empty input", () => {
    expect(camelize("")).toBe("")
  })

  it("returns empty string for only symbols/numbers", () => {
    expect(camelize("123---")).toBe("")
  })
})

describe("identifier", () => {
  it("capitalizes the first letter of the camelized result", () => {
    expect(identifier("get_user_name")).toBe("GetUserName")
  })

  it("keeps already-capitalized input intact", () => {
    expect(identifier("GetUser")).toBe("GetUser")
  })

  it("capitalizes a single lowercase word", () => {
    expect(identifier("list")).toBe("List")
  })
})

describe("nonEmptyString", () => {
  it("returns None for null", () => {
    expect(nonEmptyString(null)).toStrictEqual(Option.none())
  })

  it("returns None for undefined", () => {
    expect(nonEmptyString(undefined)).toStrictEqual(Option.none())
  })

  it("returns None for non-string values", () => {
    expect(nonEmptyString(42)).toStrictEqual(Option.none())
    expect(nonEmptyString(true)).toStrictEqual(Option.none())
  })

  it("returns None for empty string", () => {
    expect(nonEmptyString("")).toStrictEqual(Option.none())
  })

  it("returns None for whitespace-only string", () => {
    expect(nonEmptyString("   ")).toStrictEqual(Option.none())
    expect(nonEmptyString("\t\n")).toStrictEqual(Option.none())
  })

  it("returns trimmed Some for valid string with surrounding whitespace", () => {
    expect(nonEmptyString("  hello  ")).toStrictEqual(Option.some("hello"))
  })
})

describe("toKebabCase", () => {
  it("converts spaces", () => {
    expect(toKebabCase("User Management")).toBe("user-management")
  })

  it("converts camelCase", () => {
    expect(toKebabCase("petStore")).toBe("pet-store")
  })

  it("converts PascalCase", () => {
    expect(toKebabCase("UserManagement")).toBe("user-management")
  })

  it("passes through already-kebab", () => {
    expect(toKebabCase("user-management")).toBe("user-management")
  })

  it("handles uppercase acronyms", () => {
    expect(toKebabCase("API Keys")).toBe("api-keys")
  })

  it("handles numbers", () => {
    expect(toKebabCase("v2Users")).toBe("v2-users")
  })

  it("replaces special chars", () => {
    expect(toKebabCase("users/admin")).toBe("users-admin")
  })

  it("trims leading/trailing hyphens", () => {
    expect(toKebabCase("--hello--")).toBe("hello")
  })

  it("returns empty for empty input", () => {
    expect(toKebabCase("")).toBe("")
  })
})

describe("toComment", () => {
  it("returns empty string for None", () => {
    expect(toComment(Option.none())).toBe("")
  })

  it("wraps a single-line description in a JSDoc comment", () => {
    expect(toComment(Option.some("A simple description"))).toBe(
      "/**\n* A simple description\n*/\n"
    )
  })

  it("handles multi-line descriptions", () => {
    expect(toComment(Option.some("Line one\nLine two\nLine three"))).toBe(
      "/**\n* Line one\n* Line two\n* Line three\n*/\n"
    )
  })

  it("escapes */ in content to prevent premature comment closing", () => {
    expect(toComment(Option.some("before */ after"))).toBe(
      "/**\n* before  * / after\n*/\n"
    )
  })
})
