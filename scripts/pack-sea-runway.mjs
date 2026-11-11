// Packs private/sea-runway/index.html into an encrypted public/sea-runway/content.bin.
// Passphrase from SEA_RUNWAY_PASSWORD (never argv). Only ciphertext is committed.
import { readFile, writeFile } from "node:fs/promises";
import { encryptBundle } from "../src/lib/what-is-this-crypto.mjs";

const password = process.env.SEA_RUNWAY_PASSWORD;
if (!password) { console.error("Set SEA_RUNWAY_PASSWORD"); process.exit(1); }
const html = await readFile("private/sea-runway/index.html");
await writeFile("public/sea-runway/content.bin", await encryptBundle(password, new Uint8Array(html)));
console.log("Wrote public/sea-runway/content.bin");
