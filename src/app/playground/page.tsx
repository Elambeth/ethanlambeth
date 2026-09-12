import { DM_Sans, Inter, JetBrains_Mono, Libre_Baskerville } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import FontPlayground, { type PlaygroundFont } from "@/components/font-playground";
import { getReaderEntries } from "@/lib/reader-entries";

export const metadata = {
  title: "Font Playground",
  robots: { index: false, follow: false },
};

const inter = Inter({ subsets: ["latin"], variable: "--pf-inter", display: "swap" });
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--pf-libre",
  display: "swap",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--pf-dmsans", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--pf-jbmono",
  display: "swap",
});

const FONTS: PlaygroundFont[] = [
  { id: "geist", label: "Geist", cssVar: "var(--font-geist-sans)", note: "chosen" },
  { id: "libre", label: "Libre Baskerville", cssVar: "var(--pf-libre)", note: "saved pairing" },
  { id: "inter", label: "Inter", cssVar: "var(--pf-inter)", note: "saved pairing" },
  { id: "dmsans", label: "DM Sans", cssVar: "var(--pf-dmsans)", note: "saved" },
  { id: "jbmono", label: "JetBrains Mono", cssVar: "var(--pf-jbmono)", note: "your mono" },
];

export default async function PlaygroundPage() {
  const entries = await getReaderEntries();

  return (
    <div
      className={`${inter.variable} ${libreBaskerville.variable} ${dmSans.variable} ${GeistSans.variable} ${jetbrainsMono.variable}`}
    >
      <FontPlayground entries={entries} fonts={FONTS} />
    </div>
  );
}
