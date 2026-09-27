# Private image → text → image page

`/what-is-this` has no site header. It opens with a password form, then shows two private images separated by a message. Tap or use Enter/Space to advance. Reduced motion is respected.

The page is fully static (Cloudflare Pages static export). The password gate is **client-side decryption**: the browser fetches an encrypted `content.bin`, derives a key from the password with PBKDF2, and decrypts it locally. There is no server, no account, and no deploy-time configuration.

## Packing content

Run `pnpm pack:what-is-this` (or `node scripts/pack-what-is-this.mjs`). It reads the gitignored `private/what-is-this/` directory — a `content.json` with `firstText` and `lastText` (≤ 1,200 characters each; shown after the first and last image), `firstAlt` and `lastAlt` (≤ 240 characters each), and the two image files they reference. Supported inputs: JPEG, PNG, WebP, and SVG, up to 40 megapixels. Images are re-encoded to WebP (≤ 1800 px, quality 84) with metadata stripped.

The script asks for a passphrase (masked prompt, or set `WHAT_IS_THIS_PASSWORD` for non-interactive use; piping also works). It writes `public/what-is-this/content.bin`, which **is committed and deployed** — only ciphertext ever enters Git or the CDN. `private/what-is-this/` never does. If the private directory is missing, the script copies `private/what-is-this.example/` placeholders first.

Publishing = commit the new `content.bin` and push to `main`; Cloudflare Pages deploys it. Changing the passphrase or the content is the same loop: edit, re-pack, push.

## File format

`content.bin` = the ASCII bytes `WIT1` | salt (16) | PBKDF2 iterations, big-endian u32 (4) | AES-GCM IV (12) | AES-256-GCM ciphertext + 16-byte auth tag. The key is PBKDF2-SHA-256 over the passphrase with the stored salt and iteration count (default 600,000; the reader honors the field, bounded to 100,000–5,000,000). The plaintext is JSON (v2): `{ v, firstText, lastText, firstAlt, lastAlt, first, last }` with the two images as base64 WebP. The page shows first image → firstText → last image → lastText. See `src/lib/what-is-this-crypto.mjs`, shared by the pack script, the page, and the tests.

## Security model — read this

- **The gate is encryption, not server auth.** Anyone can download `content.bin`; without the passphrase it is AES-GCM ciphertext. A wrong passphrase fails the auth check and shows the same "wrong password" error.
- **There is no rate limiting, lockout, or logging.** Nothing to hammer — but also nothing stopping offline brute-force of the public ciphertext. Each guess costs one PBKDF2 pass (~0.2–1 s). Therefore: **use a passphrase of at least four random words.** Never a short word, never a number-only code. The pack script warns below 16 characters.
- **Never pack real content with a throwaway passphrase** — rotating later means everyone who had the old passphrase could have kept a decrypted copy anyway, but a guessable one means anyone at all can.
- Rotation = pick a new passphrase, re-pack, push. Old ciphertext stops mattering immediately.
- A viewer who unlocks the page can save what they see; treat the recipient as trusted with the content. Unlocked content lives in browser memory as blob URLs; the passphrase is kept in `sessionStorage` for that tab (readable by other same-origin scripts; Lock clears it; it never persists to disk).
- The URL is unlisted (no links anywhere on the site) and requests `noindex` via page meta and the `X-Robots-Tag` header, but it is not secret — share it and the passphrase out-of-band.

## Development

`pnpm dev`, then open `/what-is-this`. WebCrypto requires a secure context, so test on `localhost` or HTTPS. `public/_headers` sets `Cache-Control: no-cache` for `content.bin` on Cloudflare Pages so re-packs show up on reload. Run `node --test test/` for the crypto tests. Nothing here needs environment variables — there are none, in dev or production.
