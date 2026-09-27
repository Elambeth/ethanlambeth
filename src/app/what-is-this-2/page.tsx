import type { Metadata } from "next";
import PrivateSequence from "../what-is-this/private-sequence";

export const metadata: Metadata = {
  title: "What is this?",
  description: "A private page.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function WhatIsThis2Page() {
  return <PrivateSequence bundleUrl="/what-is-this-2/content.bin" storageKey="what-is-this-2.password" />;
}
