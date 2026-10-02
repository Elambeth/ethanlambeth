import type { Metadata } from "next";
import Viewer from "./viewer";
import { listPublicImages } from "@/lib/image-dimensions";

export const metadata: Metadata = {
  title: "Input Gestures",
  description: "Inputs.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function InputGesturesPage() {
  const images = listPublicImages("input-gestures");

  return (
    <main className="pt-10">
      <h1 className="mx-auto mb-10 max-w-7xl px-6 text-2xl font-medium tracking-tight">
        Input Gestures
      </h1>
      <Viewer images={images} />
    </main>
  );
}
