import { readFileSync } from "fs";
import { join } from "path";
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

  const dir = join(process.cwd(), "src/app/input-gestures");
  const notes: Record<string, string> = JSON.parse(
    readFileSync(join(dir, "notes.json"), "utf8")
  );
  const order: string[] = JSON.parse(readFileSync(join(dir, "order.json"), "utf8"));
  const hidden: string[] = JSON.parse(readFileSync(join(dir, "hidden.json"), "utf8"));

  const ordered = [
    ...order
      .map((name) => images.find((img) => img.name === name))
      .filter((img): img is (typeof images)[number] => Boolean(img)),
    ...images.filter((img) => !order.includes(img.name)),
  ].filter((img) => !hidden.includes(img.name));

  return (
    <main className="pt-10">
      <h1 className="mx-auto mb-10 max-w-7xl px-6 text-2xl font-medium tracking-tight">
        Input Gestures
      </h1>
      <Viewer images={ordered} notes={notes} />
    </main>
  );
}
