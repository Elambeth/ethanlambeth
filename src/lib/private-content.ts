import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import sharp from "sharp";

const root = join(process.cwd(), "private", "what-is-this");
const manifest = "what-is-this/content.json";
const cloud = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export type PrivateContent = {
  text: string;
  firstAlt: string;
  lastAlt: string;
  firstImage: string | null;
  lastImage: string | null;
  revision: string;
};

export class ContentInputError extends Error {}

export async function readContent(): Promise<PrivateContent> {
  let data;
  if (cloud()) {
    const result = await get(manifest, { access: "private", useCache: false });
    if (result?.statusCode === 200) data = await new Response(result.stream).json();
  } else {
    try { data = JSON.parse(await readFile(join(root, "content.json"), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (!data) return { text: "", firstAlt: "", lastAlt: "", firstImage: null, lastImage: null, revision: "initial" };
  if (![data.text, data.firstAlt, data.lastAlt].every(value => typeof value === "string") ||
    ![data.firstImage, data.lastImage].every(value => value === null || typeof value === "string")) throw new Error("Invalid stored content");
  return { ...data, revision: data.revision || "initial" };
}

export async function readImage(file: string) {
  if (cloud()) {
    if (!/^what-is-this\/images\/[a-f0-9-]+\.webp$/.test(file)) throw new Error("Invalid stored image path");
    const result = await get(file, { access: "private" });
    if (result?.statusCode !== 200) throw new Error("Image not found");
    return { body: result.stream, type: "image/webp" };
  }
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif|svg)$/.test(file)) throw new Error("Invalid stored image path");
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" };
  return { body: new Uint8Array(await readFile(join(root, file))), type: types[file.split(".").pop()!] };
}

async function prepareImage(file: File): Promise<Buffer> {
  if (!file.size || file.size > 2 * 1024 * 1024) throw new ContentInputError("Choose an image smaller than 2 MB after resizing.");
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const info = await image.metadata();
    if (!info.format || !["jpeg", "png", "webp"].includes(info.format) || (info.pages || 1) !== 1) {
      throw new Error("Unsupported image");
    }
    // Decode and re-encode; uploaded filenames, metadata, and active content are discarded.
    return await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } catch {
    throw new ContentInputError("Choose a valid, still JPEG, PNG, or WebP image (up to 40 megapixels).");
  }
}

async function storeImage(bytes: Buffer) {
  const filename = `${randomUUID()}.webp`;
  if (cloud()) {
    const pathname = `what-is-this/images/${filename}`;
    await put(pathname, bytes, { access: "private", addRandomSuffix: false, contentType: "image/webp" });
    return pathname;
  }
  await mkdir(root, { recursive: true });
  await writeFile(join(root, filename), bytes, { flag: "wx", mode: 0o600 });
  return filename;
}

export async function saveContent(form: FormData): Promise<PrivateContent> {
  if (!cloud() && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error("Production uploads require private Blob storage");
  }
  const text = form.get("text");
  const firstAlt = form.get("firstAlt");
  const lastAlt = form.get("lastAlt");
  if (typeof text !== "string" || !text.trim() || text.length > 1200 ||
    typeof firstAlt !== "string" || !firstAlt.trim() || firstAlt.length > 240 ||
    typeof lastAlt !== "string" || !lastAlt.trim() || lastAlt.length > 240) {
    throw new ContentInputError("Add a message (up to 1,200 characters) and a short description for each image.");
  }
  const current = await readContent();
  const first = form.get("firstImage");
  const last = form.get("lastImage");
  if ((first && !(first instanceof File)) || (last && !(last instanceof File))) throw new ContentInputError("Invalid image upload.");
  if ((!current.firstImage && !(first instanceof File && first.size)) || (!current.lastImage && !(last instanceof File && last.size))) {
    throw new ContentInputError("Choose both images before saving for the first time.");
  }
  // Validate both images before writing anything; publish only when all uploads succeed.
  const firstBytes = first instanceof File && first.size ? await prepareImage(first) : null;
  const lastBytes = last instanceof File && last.size ? await prepareImage(last) : null;
  const next: PrivateContent = {
    text: text.trim(), firstAlt: firstAlt.trim(), lastAlt: lastAlt.trim(), revision: randomUUID(),
    firstImage: firstBytes ? await storeImage(firstBytes) : current.firstImage,
    lastImage: lastBytes ? await storeImage(lastBytes) : current.lastImage,
  };
  if (cloud()) {
    await put(manifest, JSON.stringify(next), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  } else {
    const temporary = join(root, `${next.revision}.json`);
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, join(root, "content.json"));
  }
  return next;
}
