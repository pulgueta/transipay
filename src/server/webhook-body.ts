/** A webhook body larger than this gets HTTP 413. Wompi events are much smaller. */
export const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

const concat = (chunks: Uint8Array[], size: number) => {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/**
 * Reads the request body as text, but not more than `limitBytes`.
 * Returns null when the body is larger. It stops at the first byte after the limit,
 * so a large body does not go into memory.
 */
export const readBodyWithLimit = async (
  request: Request,
  limitBytes = WEBHOOK_BODY_LIMIT_BYTES
) => {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limitBytes) {
    return null;
  }
  if (!request.body) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  // Leaving the loop early cancels the stream.
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > limitBytes) {
      return null;
    }
    chunks.push(chunk);
  }
  return new TextDecoder().decode(concat(chunks, size));
};

/**
 * Reads a webhook body with the size limit, then gives it to `handle`.
 * A large body gets HTTP 413 before the signature check.
 */
export const handleLimitedWebhook = async (
  request: Request,
  handle: (rawBody: string) => Promise<number>
) => {
  const body = await readBodyWithLimit(request);
  if (body === null) {
    return new Response(null, { status: 413 });
  }
  return new Response(null, { status: await handle(body) });
};
