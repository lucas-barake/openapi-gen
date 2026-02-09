# openapi-gen

Generates Effect Schema types and `@effect/platform` HttpClient implementations from OpenAPI specifications.

## What it does

Given an OpenAPI spec, this tool generates:

- **Effect Schema declarations** (`effect/Schema`) for every request body, response body, and parameter — with full runtime validation
- **An Effect HttpClient implementation** — every API operation becomes a method returning `Effect.Effect<Success, Error>` with per-status-code typed errors via `HttpClientResponse.matchStatus`

## Intended workflow

This tool is designed for a **sync/check** workflow where generated schemas are committed and user-owned:

1. **`sync`** — Reads the OpenAPI spec, generates per-tag module files (one file per OpenAPI tag). Only generates files for **new** tags that don't exist locally. Existing files are never overwritten.
2. **User edits** — You freely customize the generated schemas: add branded IDs, transforms, computed fields, rename types, etc. The files are yours.
3. **`check`** — Detects drift between your local schemas and the remote API. Extracts the `Encoded` side of your schemas via `JSONSchema.make(Schema.encodedSchema(...))`, compares that against the OpenAPI spec's JSON Schema, and reports mismatches (missing fields, type changes, etc.) without modifying your files.

The key insight: Effect Schema's Encoded/Type duality means your customizations (brands, transforms) live on the **Type** side, while the **Encoded** side always represents the wire format. The check tool only inspects the Encoded side, so your customizations never interfere with drift detection.

## Usage

```bash
# Generate from an OpenAPI spec file
npx @lucas-barake/openapi-gen -s ./openapi.json -n MyApi
```

Output goes to stdout. Redirect to a file:

```bash
npx @lucas-barake/openapi-gen -s ./openapi.json -n MyApi > src/api/client.ts
```

## Options

| Flag            | Alias | Description                                       |
| --------------- | ----- | ------------------------------------------------- |
| `--spec <file>` | `-s`  | OpenAPI spec file (JSON or YAML)                  |
| `--name <name>` | `-n`  | Name for the generated client (default: `Client`) |

## Acknowledgments

Initially based on [tim-smart/openapi-gen](https://github.com/tim-smart/openapi-gen).
