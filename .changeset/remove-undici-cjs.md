---
"@lucas-barake/openapi-gen": patch
---

Replace undici HTTP client with built-in fetch to fix Node 25 CJS/ESM crash

- Use `FetchHttpClient.layer` instead of `NodeHttpClient.layerUndici` to avoid bundling CJS undici
- Switch to subpath imports for `@effect/platform-node` to prevent barrel re-export pulling in undici
- Bundle size reduced from 1.53 MB to 611 KB
