# Private image → text → image page

`/what-is-this` has no site header. It opens with a password form, then shows two private images separated by a message. Tap or use Enter/Space to advance. Reduced motion is respected.

## Local setup

Run `node scripts/setup-private-page.mjs` with the chosen password on stdin. It creates `.env.local` (salted scrypt hash and random signing secret) and copies example content to `private/what-is-this/`. Both are gitignored. The initial requested password has been configured locally; there is no built-in production password or plaintext password in the source.

Edit `private/what-is-this/content.json` and replace its image files. Supported image formats: PNG, JPEG, WebP, AVIF, and trusted SVG. Keep real content outside `public/`, source imports, and version control. The files in `private/what-is-this.example/` are deliberately generic placeholders.

Run `npm run dev`, then open `/what-is-this`.

## Deployment

This branch changes the site from static export to a Next.js server application. Deploy with the Next.js preset (for example Vercel), `next build`, and the default output directory; remove any `out` output-directory override. GitHub Pages/static-only hosting cannot run this gate.

Set these server-only environment variables in the host:

- `WHAT_IS_THIS_PASSWORD_HASH` and `WHAT_IS_THIS_SESSION_SECRET`: values generated in the local environment file. Never prefix them with `NEXT_PUBLIC_`.
- `WHAT_IS_THIS_ORIGIN`: exact HTTPS origin, with no trailing slash. Preview deployments need their own origin.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: a persistent Redis database for atomic login throttling. Production refuses login if it is absent or unreachable.

Provision the gitignored `private/what-is-this/` directory in the deployment workspace before building (secure CI file injection or a local CLI deployment). Git-based deployments alone do not include these files. Next's output tracing includes them only in the server function. Never upload `.env.local` or private content to a public storage bucket.

## Security model

Password verification and authorization happen in the API itself, including on every image request; middleware is not the security boundary. Private responses are marked `private, no-store`, and image optimization is bypassed. The static page and client bundle contain only the gate and presentation code. Login and logout require a matching Origin. Sessions are signed, last one hour, and use HttpOnly, SameSite=Strict cookies with Secure in production. Changing the password hash or session secret revokes all existing sessions. Lock clears the current browser cookie; an independently copied session remains valid until expiry or credential rotation.

All login attempts share a limit of five per 15 minutes, including successful attempts. This is intentionally conservative for a small shared-password page and cannot be bypassed by rotating IPs. Someone can consume the limit and temporarily prevent new logins; existing sessions continue working. Eight-digit passwords remain guessable if disclosed or known, so use a longer password for sensitive material. Authorized viewers can save the content they see.

Local development uses an in-memory limiter; only production requires persistent Redis. Run `node --test test/private-auth.test.mjs` for password, session, and limiter checks. Keep the Next.js server on a supported patched release before deploying.

References: [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).

## Admin editor and uploads

Open `/what-is-this/admin`. It has a separate admin password, two image pickers, image descriptions, and a message field. Save changes publishes the complete page; visitors see the new content on their next load or refresh. The viewing password never grants editing access.

Run `node scripts/setup-private-admin.mjs` once after local setup. It generates a random admin password in `.env.admin.local` and adds only its salted hash to `.env.local`. Both files are gitignored. The admin password is intentionally different from the visitor password. This change adds role separation to session signatures, so previously issued sessions must sign in again.

For **production uploads**, create a **Private** Vercel Blob store in the project's Storage tab and connect it to the deployment environment. This supplies `BLOB_READ_WRITE_TOKEN`. Also set `WHAT_IS_THIS_ADMIN_PASSWORD_HASH` from the local environment file, alongside the existing viewer hash, session secret, HTTPS origin, and persistent Redis limiter. Keep preview and production storage separate if preview edits should not affect the live page. No storage resource is provisioned by this code change.

With Blob configured, the page reads its message and image references from a private manifest. Uploads are private, are served through authenticated routes, and survive redeploys. The admin can start from an empty store and upload both images; there is no need to inject private files into the build. Manifest reads bypass the Blob cache so saves are immediately visible. Without Blob, local development still reads and saves the gitignored private folder; production upload requests fail closed rather than writing to an ephemeral filesystem. The original read-only bundled-file deployment remains available when Blob is absent.

Only still JPEG, PNG, and WebP uploads are supported. The browser resizes large photos before sending a request under Vercel's 4.5 MB request limit. The server enforces a 4 MB body limit, decodes the file (up to 40 megapixels), and re-encodes it as WebP without source metadata. SVG uploads are rejected. Both images are validated before publication; changing one image preserves the other. Saving does not rebuild the site. If multiple admin tabs save at once, the last completed save wins.

Old image objects are retained privately so concurrent readers do not lose an image during a save. Unreferenced uploads can be removed from the private store when no longer needed. No delete operation is exposed to visitors. Never deploy `.env.admin.local` or place it in the private content directory.

References: [Vercel private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [server upload limits](https://vercel.com/docs/vercel-blob/server-upload), [consistent private reads](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage).
