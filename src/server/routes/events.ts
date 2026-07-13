import type { Context } from "hono";
import { getStore } from "../../lib/store";

/** Server-sent events stream: fires a `change` event whenever the mailbox changes. */
export function handleEvents(c: Context) {
  const { emitter } = getStore();
  const encoder = new TextEncoder();
  const signal = c.req.raw.signal;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => controller.enqueue(encoder.encode("event: change\ndata: {}\n\n"));
      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": ping\n\n")),
        15000
      );
      emitter.on("change", send);
      signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        emitter.off("change", send);
        controller.close();
      });
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
