"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./admin.module.css";

type Content = { text: string; firstAlt: string; lastAlt: string; hasFirst: boolean; hasLast: boolean; revision: string };
type Slot = "first" | "last";
const api = "/what-is-this/api";

async function prepareUpload(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Choose an image smaller than 40 megapixels.");
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= 1.5 * 1024 * 1024) return new File([blob], "image.webp", { type: blob.type });
    }
    throw new Error("This image is too large. Try a smaller version.");
  } finally { bitmap.close(); }
}

function ImageField({ slot, file, exists, revision, description, disabled, onPick, onDescribe }: {
  slot: Slot; file: File | null; exists: boolean; revision: string; description: string; disabled: boolean;
  onPick: (file: File) => void; onDescribe: (value: string) => void;
}) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const src = preview || (exists ? `${api}/image/${slot}?v=${encodeURIComponent(revision)}` : "");
  const title = slot === "first" ? "Image one" : "Image two";
  return <section className={styles.slot}>
    <h2>{title}</h2>
    <div className={styles.preview}>
      {src ? (
        // Authenticated images must bypass the public image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={description || `${title} preview`} />
      ) : <span>No image yet</span>}
    </div>
    <label className={styles.fileLabel} htmlFor={`${slot}-image`}>Choose {title.toLowerCase()}</label>
    <input id={`${slot}-image`} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={event => { const chosen = event.target.files?.[0]; if (chosen) onPick(chosen); event.target.value = ""; }} />
    <label htmlFor={`${slot}-description`}>Image description</label>
    <input id={`${slot}-description`} value={description} onChange={event => onDescribe(event.target.value)}
      maxLength={240} required disabled={disabled} placeholder="A short description for screen readers" />
  </section>;
}

export default function AdminEditor() {
  const [content, setContent] = useState<Content | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [first, setFirst] = useState<File | null>(null);
  const [last, setLast] = useState<File | null>(null);

  async function load() {
    const response = await fetch(`${api}/admin/content`, { cache: "no-store" });
    if (response.status === 401) { setContent(null); return false; }
    if (!response.ok) throw new Error("Couldn’t load the editor. Check your connection and try again.");
    setContent(await response.json());
    return true;
  }
  useEffect(() => { load().catch((e: Error) => setError(e.message)).finally(() => setChecking(false)); }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch(`${api}/admin/session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: new FormData(form).get("password") }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "That admin password isn’t right." : response.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Admin access is unavailable. Check the server configuration.");
      form.reset();
      if (!(await load())) throw new Error("Please sign in again.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }

  async function pick(slot: Slot, file: File) {
    setBusy(true); setError(""); setNotice("Preparing image…");
    try {
      const prepared = await prepareUpload(file);
      (slot === "first" ? setFirst : setLast)(prepared);
      setNotice("Image ready. Save changes to update the page.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t read that image."); setNotice(""); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content || busy) return;
    setBusy(true); setError(""); setNotice("Saving…");
    const form = new FormData();
    form.set("text", content.text); form.set("firstAlt", content.firstAlt); form.set("lastAlt", content.lastAlt);
    if (first) form.set("firstImage", first);
    if (last) form.set("lastImage", last);
    try {
      const response = await fetch(`${api}/admin/content`, { method: "PUT", body: form });
      if (response.status === 401) { setContent(null); throw new Error("Your session expired. Sign in again."); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn’t save. Please try again.");
      setContent(result); setFirst(null); setLast(null);
      setNotice("Saved. Visitors will see these changes when they open or refresh the page.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save. Please try again."); setNotice(""); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/admin/session`, { method: "DELETE" });
      if (!response.ok) throw new Error("Couldn’t sign out. Try again.");
      setContent(null); setFirst(null); setLast(null); setNotice("");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t sign out. Try again."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    {checking ? <p role="status">One moment…</p> : !content ? (
      <form className={styles.login} onSubmit={login}>
        <h1>Edit private page</h1>
        <p>Sign in with your admin password.</p>
        <label htmlFor="admin-password">Admin password</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={busy} />
        <button className={styles.primary} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p role="status" className={styles.error}>{error}</p>
      </form>
    ) : <div className={styles.editor}>
      <div className={styles.heading}>
        <div><h1>Edit private page</h1><p>Two images. A message in between.</p></div>
        <button className={styles.quiet} onClick={logout} disabled={busy}>Sign out</button>
      </div>
      <form onSubmit={save}>
        <div className={styles.images}>
          <ImageField slot="first" file={first} exists={content.hasFirst} revision={content.revision} description={content.firstAlt} disabled={busy}
            onPick={file => pick("first", file)} onDescribe={firstAlt => setContent({ ...content, firstAlt })} />
          <ImageField slot="last" file={last} exists={content.hasLast} revision={content.revision} description={content.lastAlt} disabled={busy}
            onPick={file => pick("last", file)} onDescribe={lastAlt => setContent({ ...content, lastAlt })} />
        </div>
        <p className={styles.help}>JPEG, PNG, or WebP. Large photos are resized automatically.</p>
        <label htmlFor="message">Message between the images</label>
        <textarea id="message" value={content.text} onChange={event => setContent({ ...content, text: event.target.value })} required maxLength={1200} rows={5} disabled={busy} />
        <div className={styles.actions}>
          <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Working…" : "Save changes"}</button>
          <a href="/what-is-this" target="_blank" rel="noopener noreferrer">View page</a>
        </div>
        <p role="status" className={error ? styles.error : styles.notice}>{error || notice}</p>
      </form>
    </div>}
  </main>;
}
