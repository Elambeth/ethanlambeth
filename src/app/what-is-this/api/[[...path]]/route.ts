import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { allowAttempt, ATTEMPT_WINDOW, checkPassword, configuration, issueSession, SESSION_SECONDS, validSession } from "@/lib/private-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const root = join(process.cwd(), "private", "what-is-this");
const production = process.env.NODE_ENV === "production";
const cookie = production ? "__Secure-what-is-this" : "what-is-this";
const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/what-is-this" };
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.WHAT_IS_THIS_ORIGIN || (!production ? `http://${request.headers.get("host")}` : null);
  return Boolean(expected && origin === expected && (!production || expected.startsWith("https://")));
}

async function readContent() {
  const data = JSON.parse(await readFile(join(root, "content.json"), "utf8"));
  if (![data.text, data.firstAlt, data.lastAlt, data.firstImage, data.lastImage].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("Invalid private content");
  }
  return data;
}

export async function GET(request: NextRequest) {
  try {
    if (!validSession(request.cookies.get(cookie)?.value)) return json({ error: "Unauthorized" }, 401);
    const path = request.nextUrl.pathname.replace(/^\/what-is-this\/api\/?/, "");
    const content = await readContent();
    if (path === "content") return json({ text: content.text, firstAlt: content.firstAlt, lastAlt: content.lastAlt });
    if (path === "image/first" || path === "image/last") {
      const file: string = path === "image/first" ? content.firstImage : content.lastImage;
      // Only a filename from trusted server configuration; never a request path.
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif|svg)$/.test(file)) return json({ error: "Unavailable" }, 503);
      const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" };
      return new NextResponse(new Uint8Array(await readFile(join(root, file))), {
        headers: { ...privateHeaders, "Content-Type": types[file.split(".").pop()!], "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" },
      });
    }
    return json({ error: "Not found" }, 404);
  } catch {
    return json({ error: "Unavailable" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname !== "/what-is-this/api/session") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Invalid request" }, 400);
  try {
    configuration();
    if (!(await allowAttempt())) {
      const response = json({ error: "Too many attempts" }, 429);
      response.headers.set("Retry-After", String(ATTEMPT_WINDOW));
      return response;
    }
    // Stream with an explicit bound; Content-Length can be omitted or forged.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Invalid request" }, 400);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return json({ error: "Invalid request" }, 413); }
      chunks.push(chunk.value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return json({ error: "Invalid request" }, 400); }
    if (!(await checkPassword(body?.password))) return json({ error: "Unauthorized" }, 401);
    const response = json({ ok: true });
    response.cookies.set(cookie, issueSession(), { ...cookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch {
    return json({ error: "Unavailable" }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (request.nextUrl.pathname !== "/what-is-this/api/session") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const response = json({ ok: true });
  response.cookies.set(cookie, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
