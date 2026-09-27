import { NextRequest, NextResponse } from "next/server";
import { allowAttempt, ATTEMPT_WINDOW, checkPassword, configuration, issueSession, SESSION_SECONDS, validSession } from "@/lib/private-auth.mjs";
import { ContentInputError, readContent, readImage, saveContent, type PrivateContent } from "@/lib/private-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const production = process.env.NODE_ENV === "production";
type Role = "viewer" | "admin";
const cookieName = (role: Role) => `${production ? "__Secure-" : ""}what-is-this${role === "admin" ? "-admin" : ""}`;
const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/what-is-this" };
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};
const pathOf = (request: NextRequest) => request.nextUrl.pathname.replace(/^\/what-is-this\/api\/?/, "");
const authenticated = (request: NextRequest, role: Role) => validSession(request.cookies.get(cookieName(role))?.value, Date.now(), role);
const view = (content: PrivateContent) => ({ text: content.text, firstAlt: content.firstAlt, lastAlt: content.lastAlt, revision: content.revision });
const adminView = (content: PrivateContent) => ({ ...view(content), hasFirst: Boolean(content.firstImage), hasLast: Boolean(content.lastImage) });

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.WHAT_IS_THIS_ORIGIN || (!production ? `http://${request.headers.get("host")}` : null);
  return Boolean(expected && origin === expected && (!production || expected.startsWith("https://")));
}

class BodyTooLarge extends Error {}
async function boundedBody(request: NextRequest, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new BodyTooLarge(); }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  try {
    const path = pathOf(request);
    if (path.startsWith("admin/")) {
      if (!authenticated(request, "admin")) return json({ error: "Unauthorized" }, 401);
      return path === "admin/content" ? json(adminView(await readContent())) : json({ error: "Not found" }, 404);
    }
    if (!authenticated(request, "viewer") && !authenticated(request, "admin")) return json({ error: "Unauthorized" }, 401);
    const content = await readContent();
    if (path === "content") {
      if (!content.firstImage || !content.lastImage) return json({ error: "Unavailable" }, 503);
      return json(view(content));
    }
    if (path === "image/first" || path === "image/last") {
      const file = path === "image/first" ? content.firstImage : content.lastImage;
      if (!file) return json({ error: "Not found" }, 404);
      const image = await readImage(file);
      return new NextResponse(image.body, {
        headers: { ...privateHeaders, "Content-Type": image.type, "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" },
      });
    }
    return json({ error: "Not found" }, 404);
  } catch {
    return json({ error: "Unavailable" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const path = pathOf(request);
  if (path !== "session" && path !== "admin/session") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Invalid request" }, 400);
  const role: Role = path === "admin/session" ? "admin" : "viewer";
  try {
    configuration(role);
    if (!(await allowAttempt(role))) {
      const response = json({ error: "Too many attempts" }, 429);
      response.headers.set("Retry-After", String(ATTEMPT_WINDOW));
      return response;
    }
    const bytes = await boundedBody(request, 2048);
    let body;
    try { body = JSON.parse(bytes.toString("utf8")); }
    catch { return json({ error: "Invalid request" }, 400); }
    if (!(await checkPassword(body?.password, role))) return json({ error: "Unauthorized" }, 401);
    const response = json({ ok: true });
    response.cookies.set(cookieName(role), issueSession(Date.now(), role), { ...cookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    return error instanceof BodyTooLarge ? json({ error: "Invalid request" }, 413) : json({ error: "Unavailable" }, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (pathOf(request) !== "admin/content") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  try {
    // A viewer cookie, even a valid one, never grants upload access.
    if (!authenticated(request, "admin")) return json({ error: "Unauthorized" }, 401);
    const type = request.headers.get("content-type");
    if (!type?.startsWith("multipart/form-data;")) return json({ error: "Invalid upload" }, 400);
    const bytes = await boundedBody(request, 4_000_000);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } }).formData(); }
    catch { return json({ error: "Invalid upload" }, 400); }
    return json(adminView(await saveContent(form)));
  } catch (error) {
    if (error instanceof BodyTooLarge) return json({ error: "The images are too large. Choose smaller images." }, 413);
    if (error instanceof ContentInputError) return json({ error: error.message }, 400);
    return json({ error: "Couldn’t save. Check that private storage is connected and try again." }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  const path = pathOf(request);
  if (path !== "session" && path !== "admin/session") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const response = json({ ok: true });
  response.cookies.set(cookieName(path === "admin/session" ? "admin" : "viewer"), "", { ...cookieOptions, maxAge: 0 });
  // Locking the viewer page also closes an admin session used to preview it.
  if (path === "session") response.cookies.set(cookieName("admin"), "", { ...cookieOptions, maxAge: 0 });
  return response;
}
