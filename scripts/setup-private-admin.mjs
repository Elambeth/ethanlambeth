import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "../src/lib/private-auth.mjs";

const env = await readFile(".env.local", "utf8");
if (/^WHAT_IS_THIS_ADMIN_PASSWORD_HASH=/m.test(env)) throw new Error("Admin credentials already exist. Rotate them explicitly instead.");
const password = randomBytes(24).toString("base64url");
await writeFile(".env.admin.local", `# Local admin sign-in. Do not deploy or share with visitors.\nWHAT_IS_THIS_ADMIN_PASSWORD=${password}\n`, { mode: 0o600, flag: "wx" });
await writeFile(".env.local", `${env}\nWHAT_IS_THIS_ADMIN_PASSWORD_HASH=${await hashPassword(password)}\n`, { mode: 0o600 });
console.log("Admin credentials created. Your sign-in password is in .env.admin.local (gitignored).");
