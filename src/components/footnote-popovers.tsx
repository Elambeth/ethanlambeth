"use client";

import { useEffect } from "react";
import { footnotePopovers } from "@/lib/footnotes.mjs";

/** Footnote references anywhere on the page show their note on hover / tap (see src/lib/footnotes.mjs). */
export default function FootnotePopovers() {
  useEffect(() => footnotePopovers(document), []);
  return null;
}
