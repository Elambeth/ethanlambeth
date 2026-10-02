import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Read pixel dimensions from an image buffer at build time.
 * Supports JPEG (baseline + progressive), PNG, and GIF — enough for
 * static assets where pulling in an image library isn't worth it.
 */
export function imageDimensions(buf: Buffer): { width: number; height: number } {
  // PNG: IHDR width/height at bytes 16-23
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: little-endian width/height at bytes 6-9
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // JPEG: walk segments to the first SOF marker (frame header)
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2); // skip this segment
    }
  }

  return { width: 0, height: 0 };
}

/** List images in public/<dir> with their dimensions, sorted by name. */
export function listPublicImages(dir: string) {
  const full = join(process.cwd(), "public", dir);
  const names = readdirSync(full)
    .filter((n) => /\.(jpe?g|png|gif|webp|avif)$/i.test(n))
    .sort();
  return names.map((name: string) => {
    const buf = readFileSync(join(full, name));
    const { width, height } = imageDimensions(buf);
    return { name, src: `/${dir}/${name}`, width, height };
  });
}
