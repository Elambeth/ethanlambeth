"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./sequence.module.css";

type Content = { text: string; firstAlt: string; lastAlt: string };
const api = "/what-is-this/api";

export default function PrivateSequence() {
  const [content, setContent] = useState<Content | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  async function loadContent() {
    const response = await fetch(`${api}/content`, { cache: "no-store" });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error("This page is unavailable. Please try again shortly.");
    setContent(await response.json());
    setStep(0);
    return true;
  }

  useEffect(() => {
    loadContent().catch((e: Error) => setError(e.message)).finally(() => setChecking(false));
    return () => clearTimeout(timer.current);
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${api}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.current?.value }),
      });
      if (!response.ok) {
        setError(response.status === 429
          ? "Too many attempts. Please try again in 15 minutes."
          : response.status === 401
            ? "That password isn’t right. Try again."
            : "This page is unavailable. Please try again shortly.");
        password.current?.focus();
        return;
      }
      if (password.current) password.current.value = "";
      if (!(await loadContent())) setError("Please enter your password again.");
    } catch {
      setError("Couldn’t connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    if (leaving || step === 2) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      setStep((current) => current + 1);
      setLeaving(false);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 460);
  }

  async function lock() {
    setBusy(true);
    try {
      const response = await fetch(`${api}/session`, { method: "DELETE" });
      if (!response.ok) throw new Error("Lock failed");
      clearTimeout(timer.current);
      setLeaving(false);
      setContent(null);
      setError("");
    } catch {
      setError("Couldn’t lock the page. Please try again.");
    } finally {
      setBusy(false);
    }
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
          <button className={styles.lock} onClick={lock} disabled={busy}>Lock</button>
          <div className={styles.experience}>
            <button className={styles.stage} onClick={advance} disabled={step === 2}
              aria-label={step === 0 ? "Reveal the message" : step === 1 ? "Reveal the last image" : "Last image"}>
              <div key={step} className={`${styles.frame} ${leaving ? styles.leaving : styles.arriving}`}>
                {step === 1 ? <p className={styles.message}>{content.text}</p> : (
                  // Private images must bypass public image optimizers and their caches.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.image} src={`${api}/image/${step === 0 ? "first" : "last"}`}
                    alt={step === 0 ? content.firstAlt : content.lastAlt} draggable={false}
                    onError={() => { setContent(null); setError("Please unlock the page again to load the images."); }} />
                )}
              </div>
            </button>
            <div className={styles.footer}>
              <p className={styles.hint} aria-live="polite">{step < 2 ? "Tap to continue" : ""}</p>
              {step === 2 && <button className={styles.again} onClick={() => setStep(0)}>See it again</button>}
            </div>
            {error && <p className={styles.error} role="status">{error}</p>}
          </div>
        </>
      )}
    </main>
  );
}
