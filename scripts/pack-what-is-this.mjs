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

// A content.json with a "sequence" array packs the v3 format — any number of rounds,
// each {"image", "alt"} or {"text"}, in order. Without one it's the v2 flat format
// (two images, firstText/lastText), which still packs unchanged for the original pages.
const sequence = Array.isArray(data?.sequence) ? data.sequence : null;
const entries = []; // {text} or {image, alt}
if (sequence) {
  if (sequence.length < 2 || sequence.length > 12) fail("sequence needs 2 to 12 entries.");
  for (const entry of sequence) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`Each sequence entry must be {"image", "alt"} or {"text"}.`);
    if (Object.hasOwn(entry, "text")) {
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text || text.length > 1200) fail("Every text needs 1–1200 characters.");
      entries.push({ text });
    } else {
      const alt = typeof entry.alt === "string" ? entry.alt.trim() : "";
      if (typeof entry.image !== "string" || !namePattern.test(entry.image)) fail("Every image entry needs an image filename like 1.webp.");
      if (!alt || alt.length > 240) fail("Every image entry needs alt text (1–240 characters).");
      entries.push({ image: entry.image, alt });
    }
  }
} else {
  const { firstText, lastText, firstAlt, lastAlt, firstImage, lastImage } = data ?? {};
  const textProblem = [firstText, lastText, firstAlt, lastAlt].some((value, index) => {
    const limit = [1200, 1200, 240, 240][index];
    return typeof value !== "string" || !value.trim() || value.length > limit;
  }) ? "both messages (1–1200 characters) and both image descriptions (1–240 characters)" : null;
  if (textProblem || typeof firstImage !== "string" || typeof lastImage !== "string" ||
    !namePattern.test(firstImage) || !namePattern.test(lastImage)) {
    fail(`content.json needs ${textProblem || "valid image fields"} and image filenames like first.webp.`);
  }
  entries.push(
    { image: firstImage, alt: firstAlt.trim() }, { text: firstText.trim() },
    { image: lastImage, alt: lastAlt.trim() }, { text: lastText.trim() },
  );
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

// Validate and encode every image before writing anything.
const images = new Map(); // filename -> webp buffer
for (const entry of entries) {
  if (entry.image && !images.has(entry.image)) images.set(entry.image, await encodeImage(entry.image));
}
for (const [file, buffer] of images) {
  if (buffer.byteLength > 4 * 1024 * 1024) fail(`${file} exceeds 4 MB once encoded. Start with smaller images.`);
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

const bundle = sequence
  ? { v: 3, sequence: entries.map((entry) => entry.text !== undefined
      ? { kind: "text", text: entry.text }
      : { kind: "image", alt: entry.alt, webp: images.get(entry.image).toString("base64") }) }
  : { v: 2, firstText: entries[1].text, lastText: entries[3].text, firstAlt: entries[0].alt, lastAlt: entries[2].alt,
      first: images.get(entries[0].image).toString("base64"), last: images.get(entries[2].image).toString("base64") };
const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
const file = await encryptBundle(password, plaintext);
if (file.byteLength > 8 * 1024 * 1024) console.warn("Warning: the packed file exceeds 8 MB. Consider smaller images.");

await mkdir(`public/${slug}`, { recursive: true });
await writeFile(destination, file);
const sizes = [...images.values()].map((buffer) => `${(buffer.byteLength / 1024).toFixed(0)} KB`);
console.log(`Packed ${destination} (${(file.byteLength / 1024).toFixed(0)} KB; images ${sizes.join(" + ")}).`);
console.log("Commit it to publish. The passphrase was not printed or stored.");
