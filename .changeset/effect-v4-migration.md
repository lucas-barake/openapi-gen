---
"@lucas-barake/openapi-gen": major
---

Migrate to Effect v4

- Update all Effect dependencies to v4 beta
- Generated code now uses `effect/unstable/http` and `effect/unstable/encoding/Sse` import paths
- Generated schemas use `Schema.Json` instead of `Schema.Unknown` for untyped values (JSON-safe under `toCodecJson`)
- Generated `$ref` request body encoding uses `Schema.Struct(Class.fields)` to accept plain objects
- SSE streaming uses `Sse.decodeDataSchema` pipeline and `Stream.unwrap`
- `HttpClientRequest.del` renamed to `HttpClientRequest.delete`
- Error types use `Schema.SchemaError` instead of `ParseError`
- CLI flags restructured to use separate optional flags
