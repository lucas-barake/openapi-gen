import * as Sse from "@effect/experimental/Sse"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { describe, expect, it } from "@effect/vitest"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

class ChatChunk extends Schema.Class<ChatChunk>("ChatChunk")({
  delta: Schema.String
}) {}

const ssePayload = [
  `data: {"delta":"Hello"}\n\n`,
  `data: {"delta":" world"}\n\n`
].join("")

const mockHttpClient = HttpClient.make((request) => {
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
}).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("http://localhost")))

const MockHttpClient = Layer.succeed(HttpClient.HttpClient, mockHttpClient)

describe("SSE runtime", () => {
  it.effect("parses SSE events and decodes JSON from event.data", () =>
    Effect.gen(function*() {
      const httpClient = yield* HttpClient.HttpClient

      const chunks = yield* httpClient.execute(
        HttpClientRequest.post("/chat/completions")
      ).pipe(
        Effect.map((response) => response.stream),
        Stream.unwrapScoped,
        Stream.decodeText(),
        Stream.pipeThroughChannel(Sse.makeChannel()),
        Stream.mapEffect((event) => Schema.decode(Schema.parseJson(ChatChunk))(event.data)),
        Stream.runCollect
      )

      expect(Chunk.toArray(chunks)).toEqual([
        { delta: "Hello" },
        { delta: " world" }
      ])
    }).pipe(Effect.provide(MockHttpClient)))

  it.effect("generated make pattern works end-to-end", () =>
    Effect.gen(function*() {
      const httpClient = yield* HttpClient.HttpClient

      const make = (client: HttpClient.HttpClient) => ({
        chatStream: (
          options: {
            readonly payload: { readonly messages: ReadonlyArray<string> }
            readonly headers?: Record<string, string>
          }
        ) =>
          HttpClientRequest.post("/chat/completions").pipe(
            HttpClientRequest.setHeaders(options.headers ?? {}),
            HttpClientRequest.schemaBodyJson(Schema.Struct({
              messages: Schema.Array(Schema.String)
            }))(options.payload),
            Effect.flatMap((request) => client.execute(request)),
            Effect.map((response) => response.stream),
            Stream.unwrapScoped,
            Stream.decodeText(),
            Stream.pipeThroughChannel(Sse.makeChannel()),
            Stream.mapEffect((event) => Schema.decode(Schema.parseJson(ChatChunk))(event.data))
          )
      })

      const api = make(httpClient)
      const chunks = yield* api.chatStream({
        payload: { messages: ["hello"] }
      }).pipe(
        Stream.runCollect
      )

      expect(Chunk.toArray(chunks)).toEqual([
        { delta: "Hello" },
        { delta: " world" }
      ])
    }).pipe(Effect.provide(MockHttpClient)))
})
