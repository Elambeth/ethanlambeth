import type { Metadata } from "next";
import AdminEditor from "./admin-editor";

export const metadata: Metadata = {
  title: "Edit private page",
  description: "Private page administration.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminEditor />;
}
