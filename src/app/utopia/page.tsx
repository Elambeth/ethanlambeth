import type { Metadata, Viewport } from "next";
import UtopiaQuiz from "./utopia-quiz";

export const metadata: Metadata = {
  title: "Utopia",
  description:
    "A short personality quiz that sorts you into one of fifteen Hives.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function UtopiaPage() {
  return <UtopiaQuiz />;
}
