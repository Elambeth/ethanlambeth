import { createHmac, randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(deriveKey);
export const SESSION_SECONDS = 60 * 60;
export const ATTEMPT_WINDOW = 15 * 60;
const MAX_ATTEMPTS = 5;
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function configuration(role = "viewer") {
  if (role !== "viewer" && role !== "admin") throw new Error("Unknown role");
  const hash = role === "admin" ? process.env.WHAT_IS_THIS_ADMIN_PASSWORD_HASH : process.env.WHAT_IS_THIS_PASSWORD_HASH;
  const secret = process.env.WHAT_IS_THIS_SESSION_SECRET;
  if (!hash || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) || !secret || secret.length < 64) {
    throw new Error("Private page credentials are not configured");
  }
  return { hash, secret };
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, scryptOptions);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function checkPassword(password, role = "viewer") {
  const { hash } = configuration(role);
  if (typeof password !== "string" || password.length === 0 || password.length > 256) return false;
  const [, salt, expected] = hash.split(":");
  const actual = await scrypt(password, salt, 64, scryptOptions);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

function signature(payload, role) {
  const { secret, hash } = configuration(role);
  return createHmac("sha256", secret).update(`${role}:${hash}:${payload}`).digest("hex");
}

export function issueSession(now = Date.now(), role = "viewer") {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${signature(payload, role)}`;
}

export function validSession(token, now = Date.now(), role = "viewer") {
  if (typeof token !== "string" || !/^\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, mac] = token.split(".");
  const time = Math.floor(now / 1000);
  if (Number(expires) <= time || Number(expires) > time + SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(`${expires}.${nonce}`, role), "hex"));
}

// A global limit cannot be evaded with forged forwarding headers, cookie resets,
// or rotating IPs. Redis makes it atomic across production workers and restarts.
export async function allowAttempt(role = "viewer") {
  if (role !== "viewer" && role !== "admin") throw new Error("Unknown role");
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    if (!url.startsWith("https://")) throw new Error("Redis must use HTTPS");
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        "EVAL",
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n",
        "1", `what-is-this:${role}:login-attempts:v1`, String(ATTEMPT_WINDOW),
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Attempt limiter unavailable");
    const body = await response.json();
    if (body.error || !Number.isInteger(body.result) || body.result < 1) throw new Error("Invalid limiter result");
    return body.result <= MAX_ATTEMPTS;
  }
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error("Production requires a shared attempt limiter");
  }
  // Keep development throttling intact when Next recompiles route modules.
  const localWindowKey = Symbol.for(`what-is-this.${role}.development-attempt-window`);
  let localWindow = globalThis[localWindowKey];
  if (!localWindow || localWindow.expires <= Date.now()) {
    localWindow = globalThis[localWindowKey] = { expires: Date.now() + ATTEMPT_WINDOW * 1000, count: 0 };
  }
  return ++localWindow.count <= MAX_ATTEMPTS;
}
