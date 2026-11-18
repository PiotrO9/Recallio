import type { NextRequest } from "next/server";
import { MAX_PUSH_BYTES, pushEnvelopeSchema } from "../../contracts";
import { privateCache, serverAuth, verifiedIdentity } from "../auth/client";
import { requestOrigin } from "../auth/request";
import { SyncFailure } from "./database";

export async function serveSync(
  request: NextRequest,
  run: (userId: string) => Promise<object>,
) {
  const headers = { "Cache-Control": privateCache };
  const requestId = crypto.randomUUID();
  try {
    const identity = await verifiedIdentity(
      await serverAuth(true, request.nextUrl.protocol === "https:"),
    );
    if (!identity)
      throw new SyncFailure(401, "unauthorized", "Sesja jest wymagana");
    if (
      request.method === "POST" &&
      (!request.headers.get("origin") ||
        request.headers.get("origin") !== requestOrigin(request))
    ) {
      throw new SyncFailure(
        401,
        "unauthorized",
        "Żądanie musi pochodzić z Recallio",
      );
    }
    return Response.json(await run(identity.id), { headers });
  } catch (error) {
    const failure =
      error instanceof SyncFailure
        ? error
        : new SyncFailure(503, "retry_later", "Spróbuj ponownie");
    if (!(error instanceof SyncFailure)) {
      const code =
        error instanceof Error && "code" in error ? error.code : undefined;
      console.error(
        "Recallio sync",
        requestId,
        typeof code === "string" ? code : "unexpected",
      );
    }
    return Response.json(
      { error: { code: failure.code, message: failure.message, requestId } },
      { headers, status: failure.status },
    );
  }
}

export async function readPush(request: Request) {
  const limit = new SyncFailure(
    413,
    "payload_too_large",
    "Paczka przekracza 1 MiB",
  );
  if (Number(request.headers.get("content-length")) > MAX_PUSH_BYTES)
    throw limit;
  const reader = request.body?.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  let input: unknown;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PUSH_BYTES) {
          await reader.cancel().catch(() => {});
          throw limit;
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    input = JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error === limit) throw error;
    throw new SyncFailure(
      422,
      "invalid_envelope",
      "Nieprawidłowa treść żądania",
    );
  } finally {
    reader?.releaseLock();
  }
  if (
    input &&
    typeof input === "object" &&
    "protocolVersion" in input &&
    typeof input.protocolVersion === "number" &&
    input.protocolVersion !== 1
  ) {
    throw new SyncFailure(
      426,
      "upgrade_required",
      "Zaktualizuj klienta Recallio",
    );
  }
  const parsed = pushEnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new SyncFailure(
      422,
      "invalid_envelope",
      "Nieprawidłowa paczka operacji",
    );
  return parsed.data;
}
