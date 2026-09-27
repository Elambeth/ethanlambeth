"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { base64ToBytes, decryptBundle, DecryptError } from "@/lib/what-is-this-crypto.mjs";
import styles from "./sequence.module.css";

type Content = { firstText: string; lastText: string; firstAlt: string; lastAlt: string; firstUrl: string; lastUrl: string };
const BUNDLE_URL = "/what-is-this/content.bin";
const STORAGE_KEY = "what-is-this.password";

export default function PrivateSequence() {
  const [content, setContent] = useState<Content | null>(null);
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

  // The password gate is decryption: wrong passphrase fails the GCM auth check.
  async function tryUnlock(passphrase: string) {
    const response = await fetch(BUNDLE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("This page is unavailable. Please try again shortly.");
    let bundle;
    try {
      bundle = JSON.parse(new TextDecoder().decode(await decryptBundle(passphrase, new Uint8Array(await response.arrayBuffer()))));
    } catch (cause) {
      throw cause instanceof DecryptError ? cause : new Error("This page is unavailable. Please try again shortly.");
    }
    if (bundle?.v !== 2 || ![bundle.firstText, bundle.lastText, bundle.firstAlt, bundle.lastAlt].every(value => typeof value === "string" && value) ||
      typeof bundle.first !== "string" || typeof bundle.last !== "string" || !bundle.first || !bundle.last) {
      throw new Error("This page is unavailable. Please try again shortly.");
    }
    revokeUrls();
    urls.current = [bundle.first, bundle.last].map(bytes =>
      URL.createObjectURL(new Blob([base64ToBytes(bytes)], { type: "image/webp" })));
    setContent({ firstText: bundle.firstText, lastText: bundle.lastText, firstAlt: bundle.firstAlt, lastAlt: bundle.lastAlt, firstUrl: urls.current[0], lastUrl: urls.current[1] });
    setStep(0);
    setLeaving(false);
    sessionStorage.setItem(STORAGE_KEY, passphrase);
  }

  // Refocus the gate input after a failed attempt — once busy clears and it re-enables.
  useEffect(() => {
    if (error && !busy && !content) password.current?.focus();
  }, [error, busy, content]);

  useEffect(() => {
    let cancelled = false;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setChecking(false);
    } else {
      tryUnlock(saved)
        .catch((cause: Error) => {
          if (cause instanceof DecryptError) sessionStorage.removeItem(STORAGE_KEY);
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
    if (leaving || step === 3) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      setStep((current) => current + 1);
      setLeaving(false);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 460);
  }

  function lock() {
    clearTimeout(timer.current);
    revokeUrls();
    setContent(null);
    setError("");
    setStep(0);
    setLeaving(false);
    sessionStorage.removeItem(STORAGE_KEY);
    password.current?.focus();
  }

  return (
    <main className={styles.page}>
      {checking ? <p className={styles.hint} role="status">One moment…</p> : !content ? (
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
            <button className={styles.stage} onClick={advance} disabled={step === 3}
              aria-label={step === 0 ? "Reveal the message" : step === 1 ? "Reveal the last image" : step === 2 ? "Reveal the final message" : "Final message"}>
              <div key={step} className={`${styles.frame} ${leaving ? styles.leaving : styles.arriving}`}>
                {step === 1 || step === 3 ? <p className={styles.message}>{step === 1 ? content.firstText : content.lastText}</p> : (
                  // Private images stay in encrypted, object-URL form — never a public asset or optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.image} src={step === 0 ? content.firstUrl : content.lastUrl}
                    alt={step === 0 ? content.firstAlt : content.lastAlt} draggable={false}
                    onError={() => setError("The image could not be displayed.")} />
                )}
              </div>
            </button>
            <div className={styles.footer}>
              <p className={styles.hint} aria-live="polite">{step < 3 ? "Tap to continue" : ""}</p>
              {step === 3 && <button className={styles.again} onClick={() => setStep(0)}>See it again</button>}
            </div>
            {error && <p className={styles.error} role="status">{error}</p>}
          </div>
        </>
      )}
    </main>
  );
}
