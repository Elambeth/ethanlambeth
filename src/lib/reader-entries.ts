import type { BlogReaderEntry } from "@/components/blog-reader";
import { getBlogPosts, getBlogStream } from "@/data/blog";

function formatAbsolute(date: string) {
  if (!date) return "";
  const value = date.includes("T") ? date : `${date}T00:00:00`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(date: string) {
  if (!date) return "";
  const value = date.includes("T") ? date : `${date}T00:00:00`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** Notes have no titles; use their first few words as a sidebar label. */
function deriveNoteTitle(html: string) {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "note";
  const words = text.split(" ");
  const title = words.slice(0, 6).join(" ");
  return words.length > 6 ? `${title}…` : title;
}

const byDateDesc = (a: { date: string }, b: { date: string }) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

/** The full reading stream — posts and notes, merged and date-sorted. */
export async function getReaderEntries(): Promise<BlogReaderEntry[]> {
  const [rawPosts, stream] = await Promise.all([
    getBlogPosts(),
    getBlogStream(),
  ]);

  const postEntries = rawPosts.map((post) => ({
    date: post.metadata.publishedAt,
    entry: {
      id: post.slug,
      kind: "post" as const,
      title: post.metadata.title,
      dateLabel: formatAbsolute(post.metadata.publishedAt),
      shortDate: formatShort(post.metadata.publishedAt),
      summary: post.metadata.summary,
      gallery: post.metadata.gallery,
      html: post.source,
    } satisfies BlogReaderEntry,
  }));

  const noteEntries = stream
    .filter((item) => item.type === "thought")
    .map((thought) => ({
      date: thought.date,
      entry: {
        id: `note-${thought.slug}`,
        kind: "note" as const,
        title: deriveNoteTitle(thought.bodyHtml ?? ""),
        dateLabel: formatAbsolute(thought.date),
        shortDate: formatShort(thought.date),
        html: thought.bodyHtml ?? "",
      } satisfies BlogReaderEntry,
    }));

  return [...postEntries, ...noteEntries]
    .sort((a, b) => byDateDesc(a, b))
    .map((pair) => pair.entry);
}
