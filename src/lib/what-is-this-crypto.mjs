// Shared WebCrypto helpers for the private what-is-this page. Runs in the
// browser, in Node (pack script, tests) — no Node-only or DOM-only APIs.

export const MAGIC = "WIT1";
export const HEADER_BYTES = 36; // magic(4) + salt(16) + iterations(4) + iv(12)
export const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

export class DecryptError extends Error {
  constructor(message = "Bad password or file") {
    super(message);
  }
}

const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new DecryptError("WebCrypto is unavailable");
  return globalThis.crypto.subtle;
};

async function deriveKey(password, salt, iterations) {
  const material = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function passwordError(password) {
  if (typeof password !== "string" || password.length === 0 || password.length > 256) {
    throw new DecryptError("Password must be 1 to 256 characters");
  }
}

function iterationsError(iterations) {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new DecryptError(`Iterations must be an integer between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`);
  }
}

export async function encryptBundle(password, plaintext, iterations = DEFAULT_ITERATIONS) {
  passwordError(password);
  iterationsError(iterations);
  if (!(plaintext instanceof Uint8Array)) throw new DecryptError("Plaintext must be bytes");
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, await deriveKey(password, salt, iterations), plaintext));
  const file = new Uint8Array(HEADER_BYTES + encrypted.byteLength);
  file.set(asciiBytes(MAGIC), 0);
  file.set(salt, 4);
  new DataView(file.buffer).setUint32(20, iterations, false);
  file.set(iv, 24);
  file.set(encrypted, HEADER_BYTES);
  return file;
}

export async function decryptBundle(password, file) {
  passwordError(password);
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  if (bytes.byteLength < HEADER_BYTES + 16) throw new DecryptError("File is too short");
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) throw new DecryptError("Unknown file format");
  const iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20, false);
  iterationsError(iterations);
  const salt = bytes.subarray(4, 20);
  const iv = bytes.subarray(24, HEADER_BYTES);
  try {
    const plaintext = await subtle().decrypt({ name: "AES-GCM", iv }, await deriveKey(password, salt, iterations), bytes.subarray(HEADER_BYTES));
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptError("Bad password or file");
  }
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function asciiBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}
