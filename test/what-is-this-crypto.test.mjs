import { test } from "node:test";
import assert from "node:assert/strict";
import { base64ToBytes, decryptBundle, encryptBundle, DecryptError, DEFAULT_ITERATIONS, HEADER_BYTES, MAGIC } from "../src/lib/what-is-this-crypto.mjs";

const key = () => new TextDecoder().decode(crypto.getRandomValues(new Uint8Array(12)));
const randomBytes = (size) => {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65_536) crypto.getRandomValues(bytes.subarray(offset, offset + 65_536));
  return bytes;
};

test("roundtrips small and large payloads", async () => {
  for (const size of [10, 150_000]) {
    const password = key();
    const plaintext = randomBytes(size);
    const file = await encryptBundle(password, plaintext, 100_000);
    assert.equal(file.byteLength, HEADER_BYTES + size + 16);
    assert.equal(String.fromCharCode(...file.subarray(0, 4)), MAGIC);
    assert.deepEqual(await decryptBundle(password, file), plaintext);
  }
});

test("wrong password is rejected", async () => {
  const file = await encryptBundle("correct horse battery", new TextEncoder().encode("secret"), 100_000);
  await assert.rejects(decryptBundle("correct horse battery staple", file), DecryptError);
});

test("tampered files are rejected", async () => {
  const password = key();
  const file = await encryptBundle(password, new TextEncoder().encode("secret"), 100_000);
  for (const offset of [10, 30, file.byteLength - 1]) {
    const tampered = new Uint8Array(file);
    tampered[offset] ^= 0xff;
    await assert.rejects(decryptBundle(password, tampered), DecryptError);
  }
});

test("malformed files are rejected", async () => {
  const password = key();
  await assert.rejects(decryptBundle(password, new Uint8Array(0)), DecryptError);
  await assert.rejects(decryptBundle(password, new Uint8Array(HEADER_BYTES + 15).fill(1)), DecryptError);
  const wrongMagic = new Uint8Array(await encryptBundle(password, new TextEncoder().encode("x"), 100_000));
  wrongMagic[0] = 88;
  await assert.rejects(decryptBundle(password, wrongMagic), DecryptError);
});

test("the iterations field is honored and bounded", async () => {
  const password = key();
  const plaintext = new TextEncoder().encode("secret");
  const file = new Uint8Array(await encryptBundle(password, plaintext, 100_000));
  await assert.rejects(decryptBundle("not-the-password", file), DecryptError);
  new DataView(file.buffer).setUint32(20, 100_001, false);
  await assert.rejects(decryptBundle(password, file), DecryptError);
  for (const iterations of [99_999, 10_000_000]) {
    const shifted = new Uint8Array(file);
    new DataView(shifted.buffer).setUint32(20, iterations, false);
    await assert.rejects(decryptBundle(password, shifted), DecryptError);
  }
  await assert.rejects(encryptBundle(password, plaintext, 99_999), DecryptError);
});

test("invalid passwords are refused", async () => {
  const plaintext = new TextEncoder().encode("secret");
  await assert.rejects(encryptBundle("", plaintext, 100_000), DecryptError);
  await assert.rejects(decryptBundle("x".repeat(257), new Uint8Array(52)), DecryptError);
});

test("base64ToBytes inverts base64", () => {
  const bytes = randomBytes(64);
  assert.deepEqual(base64ToBytes(Buffer.from(bytes).toString("base64")), bytes);
});

// Default-iteration roundtrip last: it is the slowest derive in the suite.
test("default iterations roundtrip", async () => {
  const password = key();
  const plaintext = new TextEncoder().encode("secret");
  const file = await encryptBundle(password, plaintext);
  assert.equal(new DataView(file.buffer, file.byteOffset).getUint32(20, false), DEFAULT_ITERATIONS);
  assert.deepEqual(await decryptBundle(password, file), plaintext);
});
