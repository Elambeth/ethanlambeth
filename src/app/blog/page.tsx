import BlogReader from "@/components/blog-reader";
import { getReaderEntries } from "@/lib/reader-entries";

export const metadata = {
  title: "Blog",
  description: "Writing, notes, and the occasional stray thought.",
};

export default async function BlogPage() {
  const entries = await getReaderEntries();

  return (
    <main className="px-6 py-12">
      <BlogReader entries={entries} />
    </main>
  );
}
