import * as Effect from "effect/Effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

const makeResponse = (
  request: HttpClientRequest.HttpClientRequest,
  status: number,
  body?: unknown,
  headers?: Record<string, string>
) => {
  const isNullBody = status === 204 || status === 304
  const responseBody = isNullBody ? null : (body !== undefined ? JSON.stringify(body) : "")
  const responseHeaders = isNullBody ? (headers ?? {}) : { "content-type": "application/json", ...headers }
  return HttpClientResponse.fromWeb(
    request,
    new Response(responseBody, { status, headers: responseHeaders })
  )
}

export const mockHttpClient = (
  routes: Array<{
    readonly method: string
    readonly path: string
    readonly status: number
    readonly body?: unknown
    readonly headers?: Record<string, string>
  }>
): HttpClient.HttpClient =>
  HttpClient.make((request: HttpClientRequest.HttpClientRequest, url: URL) => {
    const pathname = url.pathname + url.search
    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === request.method.toUpperCase() &&
        pathname.startsWith(r.path)
    )
    if (route) {
      return Effect.succeed(makeResponse(request, route.status, route.body, route.headers))
    }
    return Effect.succeed(makeResponse(request, 500, { error: "No matching route" }))
  }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("http://localhost")))

export const mockSseClient = (
  routes: Array<{
    readonly method: string
    readonly path: string
    readonly events: Array<unknown>
  }>
): HttpClient.HttpClient =>
  HttpClient.make((request: HttpClientRequest.HttpClientRequest, url: URL) => {
    const pathname = url.pathname
    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === request.method.toUpperCase() &&
        pathname === r.path
    )
    if (route) {
      const ssePayload = route.events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("")
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ssePayload))
          controller.close()
        }
      })
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" }
          })
        )
      )
    }
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("No matching route", {
          status: 500,
          headers: { "content-type": "text/plain" }
        })
      )
    )
  }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("http://localhost")))

export const mockHttpClientWithCapture = (
  routes: Array<{
    readonly method: string
    readonly path: string
    readonly status: number
    readonly body?: unknown
    readonly headers?: Record<string, string>
  }>
): {
  readonly client: HttpClient.HttpClient
  readonly requests: Array<{ readonly url: URL; readonly request: HttpClientRequest.HttpClientRequest }>
} => {
  const requests: Array<{ readonly url: URL; readonly request: HttpClientRequest.HttpClientRequest }> = []
  const client = HttpClient.make((request: HttpClientRequest.HttpClientRequest, url: URL) => {
    requests.push({ url, request })
    const pathname = url.pathname + url.search
    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === request.method.toUpperCase() &&
        pathname.startsWith(r.path)
    )
    if (route) {
      return Effect.succeed(makeResponse(request, route.status, route.body, route.headers))
    }
    return Effect.succeed(makeResponse(request, 500, { error: "No matching route" }))
  }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("http://localhost")))
  return { client, requests }
}
