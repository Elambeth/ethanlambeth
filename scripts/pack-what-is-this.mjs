// Packs private/what-is-this[-N]/ into an encrypted public/what-is-this[-N]/content.bin.
// The passphrase comes from WHAT_IS_THIS_PASSWORD or a masked prompt (never argv).
// Only the ciphertext is committed; the private directory stays gitignored.
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import readline from "node:readline/promises";
import { Writable } from "node:stream";
import sharp from "sharp";
import { encryptBundle } from "../src/lib/what-is-this-crypto.mjs";

const slug = process.env.WHAT_IS_THIS_SLUG ?? "what-is-this";
const root = `private/${slug}`;
const example = "private/what-is-this.example";
const destination = `public/${slug}/content.bin`;
const namePattern = /^[a-zA-Z0-9_-]+\.(png|jpe?g|webp|svg)$/i;
const fail = (message) => { console.error(`Error: ${message}`); process.exit(1); };

if (!(await stat(`${root}/content.json`, { force: true }).catch(() => null))) {
  await cp(example, root, { recursive: true, force: false, errorOnExist: true });
  console.log(`Created ${root} from the example. Edit it and run this script again for real content.`);
}

let data;
try {
  data = JSON.parse(await readFile(`${root}/content.json`, "utf8"));
} catch {
  fail(`${root}/content.json is missing or not valid JSON.`);
}
const { firstText, lastText, firstAlt, lastAlt, firstImage, lastImage } = data ?? {};
const textProblem = [firstText, lastText, firstAlt, lastAlt].some((value, index) => {
  const limit = [1200, 1200, 240, 240][index];
  return typeof value !== "string" || !value.trim() || value.length > limit;
}) ? "both messages (1–1200 characters) and both image descriptions (1–240 characters)" : null;
if (textProblem || typeof firstImage !== "string" || typeof lastImage !== "string" ||
  !namePattern.test(firstImage) || !namePattern.test(lastImage)) {
  fail(`content.json needs ${textProblem || "valid image fields"} and image filenames like first.webp.`);
}

async function encodeImage(file) {
  let info;
  const image = sharp(await readFile(`${root}/${file}`), { limitInputPixels: 40_000_000, failOn: "warning" });
  try {
    info = await image.metadata();
    if (!info.format || !["jpeg", "png", "webp", "svg"].includes(info.format) || (info.pages || 1) !== 1) {
      throw new Error("unsupported");
    }
    // Decode and re-encode; source filenames, metadata, and pixels beyond the cap are discarded.
    return await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } catch {
    fail(`${file} could not be read as a still JPEG, PNG, WebP, or SVG image (up to 40 megapixels).`);
  }
}

// Validate and encode both images before writing anything.
const first = await encodeImage(firstImage);
const last = await encodeImage(lastImage);
if (first.byteLength > 4 * 1024 * 1024 || last.byteLength > 4 * 1024 * 1024) {
  fail("An encoded image exceeds 4 MB. Start with smaller images.");
}

let password = process.env.WHAT_IS_THIS_PASSWORD;
if (!password) {
  if (process.stdin.isTTY) {
    const quiet = new Writable({ write(chunk, encoding, callback) { if (!this.muted) process.stdout.write(chunk, encoding, callback); else callback(); } });
    const prompt = readline.createInterface({ input: process.stdin, output: quiet });
    quiet.muted = true;
    password = await prompt.question("Passphrase: ");
    quiet.muted = false;
    prompt.close();
    process.stdout.write("\n");
  } else {
    password = (await readFile("/dev/stdin", "utf8")).replace(/\r?\n$/, "");
  }
}
if (typeof password !== "string" || password.length === 0 || password.length > 256) fail("Passphrase must be 1 to 256 characters.");
if (password.length < 16) {
  console.warn("Warning: short passphrases can be guessed offline from the public ciphertext. Use at least four random words.");
}

const plaintext = new TextEncoder().encode(JSON.stringify({
  v: 2, firstText: firstText.trim(), lastText: lastText.trim(), firstAlt: firstAlt.trim(), lastAlt: lastAlt.trim(),
  first: first.toString("base64"), last: last.toString("base64"),
}));
const file = await encryptBundle(password, plaintext);
if (file.byteLength > 8 * 1024 * 1024) console.warn("Warning: the packed file exceeds 8 MB. Consider smaller images.");

await mkdir(`public/${slug}`, { recursive: true });
await writeFile(destination, file);
console.log(`Packed ${destination} (${(file.byteLength / 1024).toFixed(0)} KB; images ${(first.byteLength / 1024).toFixed(0)} KB + ${(last.byteLength / 1024).toFixed(0)} KB).`);
console.log("Commit it to publish. The passphrase was not printed or stored.");
