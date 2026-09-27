import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { allowAttempt, checkPassword, hashPassword, issueSession, validSession, SESSION_SECONDS } from "../src/lib/private-auth.mjs";

test("password checks, session forgery/expiry/rotation, and fail-closed rate limiting", async () => {
  const password = randomBytes(24).toString("hex");
  process.env.WHAT_IS_THIS_PASSWORD_HASH = await hashPassword(password);
  process.env.WHAT_IS_THIS_SESSION_SECRET = randomBytes(32).toString("hex");
  assert.equal(await checkPassword(password), true);
  assert.equal(await checkPassword("incorrect"), false);
  assert.equal(await checkPassword({ password }), false);
  assert.equal(await checkPassword("x".repeat(257)), false);
  const now = Date.now();
  const session = issueSession(now);
  assert.equal(validSession(session, now), true);
  assert.equal(validSession(session, now + SESSION_SECONDS * 1000), false);
  assert.equal(validSession(undefined), false);
  assert.equal(validSession(`${session.slice(0, -1)}${session.endsWith("a") ? "b" : "a"}`, now), false);
  assert.equal(validSession(`9999999999.${session.split(".").slice(1).join(".")}`, now), false);
  process.env.WHAT_IS_THIS_PASSWORD_HASH = await hashPassword("rotated");
  assert.equal(validSession(session, now), false);
  process.env.NODE_ENV = "test";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  for (let i = 0; i < 5; i++) assert.equal(await allowAttempt(), true);
  assert.equal(await allowAttempt(), false);
  process.env.NODE_ENV = "production";
  await assert.rejects(allowAttempt(), /shared attempt limiter/);
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test";
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ result: 1 });
    assert.equal(await allowAttempt(), true);
    globalThis.fetch = async () => Response.json({ result: 6 });
    assert.equal(await allowAttempt(), false);
    globalThis.fetch = async () => Response.json({ error: "Unavailable" });
    await assert.rejects(allowAttempt());
    globalThis.fetch = async () => { throw new Error("Network failure"); };
    await assert.rejects(allowAttempt());
  } finally { globalThis.fetch = originalFetch; }
});
