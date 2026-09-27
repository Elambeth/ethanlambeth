import { randomBytes } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "../src/lib/private-auth.mjs";

// Read via stdin, never a command-line argument (which could appear in process lists).
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (!password || password.length > 256) throw new Error("Provide a password of 1–256 characters on stdin.");
let env = "";
try { env = await readFile(".env.local", "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const keys = ["WHAT_IS_THIS_PASSWORD_HASH", "WHAT_IS_THIS_SESSION_SECRET"];
if (keys.some((key) => new RegExp(`^${key}=`, "m").test(env))) {
  throw new Error("Private-page credentials already exist. Update them explicitly to rotate credentials.");
}
await writeFile(".env.local", `${env}\nWHAT_IS_THIS_PASSWORD_HASH=${await hashPassword(password)}\nWHAT_IS_THIS_SESSION_SECRET=${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
await cp("private/what-is-this.example", "private/what-is-this", { recursive: true, force: false, errorOnExist: true });
console.log("Created local credentials and private placeholder content. Secrets were not printed.");
