import { describe, expect, it, vi } from "vitest";

import {
  WEBHOOK_BODY_LIMIT_BYTES,
  handleLimitedWebhook,
  readBodyWithLimit,
} from "./webhook-body";

const url = "https://transipay.example.com/api/webhooks/wompi";

// Node needs `duplex` for a stream body. The DOM type does not have it.
type StreamRequestInit = RequestInit & { duplex: "half" };

const postStream = (
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {}
) => {
  const init: StreamRequestInit = {
    method: "POST",
    body,
    duplex: "half",
    headers,
  };
  return new Request(url, init);
};

/** A body that arrives in chunks and has no Content-Length header. */
const streamRequest = (chunks: string[]) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return postStream(body);
};

describe(readBodyWithLimit, () => {
  it("returns the body text when it is in the limit", async () => {
    const request = new Request(url, { method: "POST", body: '{"a":"ñ"}' });

    await expect(readBodyWithLimit(request)).resolves.toBe('{"a":"ñ"}');
  });

  it("accepts a body of exactly 64 KiB", async () => {
    const body = "a".repeat(WEBHOOK_BODY_LIMIT_BYTES);

    await expect(readBodyWithLimit(streamRequest([body]))).resolves.toBe(body);
  });

  it("refuses a streamed body that is larger than 64 KiB", async () => {
    const half = "a".repeat(WEBHOOK_BODY_LIMIT_BYTES / 2);

    await expect(
      readBodyWithLimit(streamRequest([half, half, "a"]))
    ).resolves.toBeNull();
  });

  it("refuses a large Content-Length before it reads the body", async () => {
    const pull = vi.fn<() => void>();
    // highWaterMark 0: the stream pulls only when a reader asks for data.
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
    const request = postStream(body, {
      "content-length": String(WEBHOOK_BODY_LIMIT_BYTES + 1),
    });

    await expect(readBodyWithLimit(request)).resolves.toBeNull();
    expect(pull).not.toHaveBeenCalled();
  });

  it("measures bytes, not characters", async () => {
    // "ñ" is 2 bytes in UTF-8.
    const body = "ñ".repeat(WEBHOOK_BODY_LIMIT_BYTES / 2 + 1);

    await expect(readBodyWithLimit(streamRequest([body]))).resolves.toBeNull();
  });
});

describe(handleLimitedWebhook, () => {
  it("returns 413 and does not call the handler for a large body", async () => {
    const handle = vi
      .fn<(rawBody: string) => Promise<number>>()
      .mockResolvedValue(200);
    const body = "a".repeat(WEBHOOK_BODY_LIMIT_BYTES + 1);

    const response = await handleLimitedWebhook(streamRequest([body]), handle);

    expect(response.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it("gives the body to the handler and returns its status", async () => {
    const handle = vi
      .fn<(rawBody: string) => Promise<number>>()
      .mockResolvedValue(401);

    const response = await handleLimitedWebhook(streamRequest(["{}"]), handle);

    expect(response.status).toBe(401);
    expect(handle).toHaveBeenCalledWith("{}");
  });
});
