"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { base64ToBytes, decryptBundle, DecryptError } from "@/lib/what-is-this-crypto.mjs";
import styles from "./sequence.module.css";

// The decrypted experience is an alternating sequence: image, message, image, message, …
// v2 bundles (first/last image + firstText/lastText) normalize into the same shape.
type ImageItem = { kind: "image"; url: string; alt: string };
type TextItem = { kind: "text"; text: string };
type Item = ImageItem | TextItem;

// Each what-is-this page (what-is-this, what-is-this-2, …) reuses this component with its own bundle and session key.
export default function PrivateSequence({ bundleUrl = "/what-is-this/content.bin", storageKey = "what-is-this.password" }: { bundleUrl?: string; storageKey?: string } = {}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const urls = useRef<string[]>([]);

  function revokeUrls() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
  }

  // Turns a decrypted v2 or v3 bundle into renderable items; null means the bundle is unusable.
  function bundleToItems(bundle: Record<string, unknown>): Item[] | null {
    const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
    if (bundle?.v === 2) {
      const firstText = text(bundle.firstText), lastText = text(bundle.lastText);
      const firstAlt = text(bundle.firstAlt), lastAlt = text(bundle.lastAlt);
      if (!firstText || !lastText || !firstAlt || !lastAlt ||
        typeof bundle.first !== "string" || !bundle.first || typeof bundle.last !== "string" || !bundle.last) return null;
      return [
        { kind: "image", url: URL.createObjectURL(new Blob([base64ToBytes(bundle.first)], { type: "image/webp" })), alt: firstAlt },
        { kind: "text", text: firstText },
        { kind: "image", url: URL.createObjectURL(new Blob([base64ToBytes(bundle.last)], { type: "image/webp" })), alt: lastAlt },
        { kind: "text", text: lastText },
      ];
    }
    if (bundle?.v === 3 && Array.isArray(bundle.sequence)) {
      // Validate every entry before creating any object URL, so a bad bundle leaks nothing.
      const entries: ({ kind: "text"; text: string } | { kind: "image"; webp: string; alt: string })[] = [];
      for (const entry of bundle.sequence) {
        if (!entry || typeof entry !== "object") return null;
        if (entry.kind === "text") {
          const message = text(entry.text);
          if (!message) return null;
          entries.push({ kind: "text", text: message });
        } else if (entry.kind === "image") {
          const alt = text(entry.alt);
          if (!alt || typeof entry.webp !== "string" || !entry.webp) return null;
          entries.push({ kind: "image", webp: entry.webp, alt });
        } else return null;
      }
      if (entries.length < 2) return null;
      return entries.map((entry) => entry.kind === "text" ? entry
        : { kind: "image", url: URL.createObjectURL(new Blob([base64ToBytes(entry.webp)], { type: "image/webp" })), alt: entry.alt });
    }
    return null;
  }

  // The password gate is decryption: wrong passphrase fails the GCM auth check.
  async function tryUnlock(passphrase: string) {
    const response = await fetch(bundleUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("This page is unavailable. Please try again shortly.");
    let bundle;
    try {
      bundle = JSON.parse(new TextDecoder().decode(await decryptBundle(passphrase, new Uint8Array(await response.arrayBuffer()))));
    } catch (cause) {
      throw cause instanceof DecryptError ? cause : new Error("This page is unavailable. Please try again shortly.");
    }
    const built = bundleToItems(bundle);
    if (!built) throw new Error("This page is unavailable. Please try again shortly.");
    revokeUrls();
    urls.current = built.filter((item): item is ImageItem => item.kind === "image").map((item) => item.url);
    setItems(built);
    setStep(0);
    setLeaving(false);
    sessionStorage.setItem(storageKey, passphrase);
  }

  // Refocus the gate input after a failed attempt — once busy clears and it re-enables.
  useEffect(() => {
    if (error && !busy && !items) password.current?.focus();
  }, [error, busy, items]);

  useEffect(() => {
    let cancelled = false;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) {
      setChecking(false);
    } else {
      tryUnlock(saved)
        .catch((cause: Error) => {
          if (cause instanceof DecryptError) sessionStorage.removeItem(storageKey);
          else if (!cancelled) setError(cause.message);
        })
        .finally(() => { if (!cancelled) setChecking(false); });
    }
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      revokeUrls();
    };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await tryUnlock(password.current?.value ?? "");
      if (password.current) password.current.value = "";
    } catch (cause) {
      setError(cause instanceof DecryptError ? "That password isn’t right. Try again." : cause instanceof Error && cause.message ? cause.message : "Couldn’t connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    if (leaving || !items || step === items.length - 1) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      setStep((current) => current + 1);
      setLeaving(false);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 460);
  }

  function lock() {
    clearTimeout(timer.current);
    revokeUrls();
    setItems(null);
    setError("");
    setStep(0);
    setLeaving(false);
    sessionStorage.removeItem(storageKey);
    password.current?.focus();
  }

  return (
    <main className={styles.page}>
      {checking ? <p className={styles.hint} role="status">One moment…</p> : !items ? (
        <form className={styles.gate} onSubmit={unlock}>
          <h1>What is this?</h1>
          <label htmlFor="private-password">Enter the password to see.</label>
          <div className={styles.inputRow}>
            <input ref={password} id="private-password" name="password" type="password"
              autoComplete="current-password" required maxLength={256}
              placeholder="Password" aria-describedby={error ? "password-error" : undefined}
              aria-invalid={Boolean(error)} disabled={busy} />
            <button type="submit" disabled={busy}>{busy ? "Opening…" : "Open"}</button>
          </div>
          <p id="password-error" className={styles.error} role="status">{error}</p>
        </form>
      ) : (
        <>
          <button className={styles.lock} onClick={lock}>Lock</button>
          <div className={styles.experience}>
            <button className={styles.stage} onClick={advance} disabled={step === items.length - 1}
              aria-label={step === items.length - 1 ? "Final message" : items[step].kind === "image" ? "Reveal the message" : "Reveal the next image"}>
              <div key={step} className={`${styles.frame} ${leaving ? styles.leaving : styles.arriving}`}>
                {(() => {
                  const current = items[step];
                  return current.kind === "text" ? <p className={styles.message}>{current.text}</p> : (
                    // Private images stay in encrypted, object-URL form — never a public asset or optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.image} src={current.url} alt={current.alt} draggable={false}
                      onError={() => setError("The image could not be displayed.")} />
                  );
                })()}
              </div>
            </button>
            <div className={styles.footer}>
              <p className={styles.hint} aria-live="polite">{step < items.length - 1 ? "Tap to continue" : ""}</p>
              {step === items.length - 1 && <button className={styles.again} onClick={() => setStep(0)}>See it again</button>}
            </div>
            {error && <p className={styles.error} role="status">{error}</p>}
          </div>
        </>
      )}
    </main>
  );
}
