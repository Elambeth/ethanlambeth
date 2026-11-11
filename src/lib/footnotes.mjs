// Footnotes, shared by the site (src/components/footnote-popovers.tsx) and the local admin (scripts/blog-admin.mjs).
//
//   text[^1]                     reference (any label: [^why], [^2] …; numbered by order of appearance)
//   [^1]: the note               definition, anywhere in the body; [[links]] and [markdown](links) work inside
//       indented paragraphs      continue a long note (4 spaces)
//
// remark-gfm renders the "Notes" list at the bottom; footnotePopovers() shows each note inline on hover / tap.

/** remark-rehype options: a visible "Notes" heading instead of the default screen-reader-only one. */
export const footnoteOptions = {
  footnoteLabel: "Notes",
  footnoteLabelTagName: "h2",
  footnoteLabelProperties: { className: ["footnotes-label"] },
};

/** Hover (mouse) / tap (touch) a footnote reference inside `root` to read the note in a popover. Returns a cleanup. */
export function footnotePopovers(root = document) {
  const pop = document.createElement("div");
  pop.className = "fn-pop";
  pop.setAttribute("role", "note");
  pop.hidden = true;
  document.body.append(pop);

  let ref = null, showTimer, hideTimer, touch = false;

  const refOf = (t) => t instanceof Element ? t.closest("a[data-footnote-ref]") : null;
  const noteFor = (a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    // nearest ancestor holding a Notes section (several bodies can share a page)
    for (let el = a.parentElement; el; el = el.parentElement) {
      const note = el.querySelector(`section[data-footnotes] [id="${CSS.escape(id)}"]`);
      if (note) return note;
    }
    return null;
  };

  function place() {
    if (!ref) return;
    const r = ref.getBoundingClientRect(), m = 12;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const below = innerHeight - r.bottom - m, above = r.top - m;
    const top = below >= h + 8 || below >= above ? r.bottom + 8 : r.top - 8 - h;
    const left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), innerWidth - w - m);
    pop.style.top = Math.round(top) + "px";
    pop.style.left = Math.round(left) + "px";
  }
  function show(a) {
    clearTimeout(hideTimer);
    if (ref === a && !pop.hidden) return;
    const note = noteFor(a);
    if (!note) return;
    const body = note.cloneNode(true);
    body.querySelectorAll("[data-footnote-backref]").forEach((b) => b.remove());
    body.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
    pop.innerHTML = `<span class="fn-pop-n">${a.textContent}</span>` + body.innerHTML;
    pop.scrollTop = 0;
    ref?.removeAttribute("aria-expanded");
    ref = a;
    a.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    place();
  }
  function hide() {
    clearTimeout(showTimer);
    pop.hidden = true;
    ref?.removeAttribute("aria-expanded");
    ref = null;
  }
  const hideSoon = () => { clearTimeout(showTimer); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 220); };

  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); };
  const off = [
    on(root, "pointerover", (e) => {
      const a = refOf(e.target);
      if (!a || e.pointerType === "touch") return;
      clearTimeout(hideTimer); clearTimeout(showTimer);
      showTimer = setTimeout(() => show(a), ref ? 0 : 90);
    }),
    on(root, "pointerout", (e) => { if (refOf(e.target) && e.pointerType !== "touch") hideSoon(); }),
    on(root, "pointerdown", (e) => { touch = e.pointerType !== "mouse"; }, true),
    on(root, "focusin", (e) => { const a = refOf(e.target); if (a) show(a); }),
    on(root, "focusout", (e) => { if (refOf(e.target) && !pop.contains(e.relatedTarget)) hideSoon(); }),
    // touch: first tap opens the note, a second tap on the same mark jumps to the list
    on(root, "click", (e) => {
      const a = refOf(e.target);
      if (a && touch && ref !== a) { e.preventDefault(); show(a); }
    }),
    on(pop, "pointerenter", () => clearTimeout(hideTimer)),
    on(pop, "pointerleave", (e) => { if (e.pointerType !== "touch") hideSoon(); }),
    on(pop, "focusout", (e) => { if (!pop.contains(e.relatedTarget) && e.relatedTarget !== ref) hideSoon(); }),
    on(document, "pointerdown", (e) => { if (ref && !pop.contains(e.target) && !refOf(e.target)) hide(); }),
    on(document, "keydown", (e) => { if (e.key === "Escape" && ref) { e.preventDefault(); const a = ref; hide(); a.focus(); } }),
    on(document, "scroll", (e) => { if (ref && !pop.contains(e.target)) place(); }, true),
    on(window, "resize", place),
  ];
  return () => { off.forEach((f) => f()); clearTimeout(showTimer); clearTimeout(hideTimer); pop.remove(); };
}
