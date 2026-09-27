import type { Metadata } from "next";
import PrivateSequence from "./private-sequence";

export const metadata: Metadata = {
  title: "What is this?",
  description: "A private page.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function WhatIsThisPage() {
  return <PrivateSequence />;
}
