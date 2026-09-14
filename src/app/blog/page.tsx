import { getBlogPosts, getBlogStream } from "@/data/blog";
import Link from "next/link";

export const metadata = {
  title: "Writing",
  description: "Essays and short notes by Ethan Lambeth.",
};

export default async function BlogPage() {
  const [posts, stream] = await Promise.all([getBlogPosts(), getBlogStream()]);
  const sortedPosts = posts.sort(
    (a, b) =>
      new Date(b.metadata.publishedAt).getTime() -
      new Date(a.metadata.publishedAt).getTime()
  );
  const notes = stream
    .filter((item) => item.type === "thought")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6 sm:pt-20">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">
          Writing
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          Essays and short notes about technology, information, and the things I’m
          learning along the way.
        </p>
      </header>

      <section className="mt-16 max-w-2xl" aria-labelledby="essays-heading">
        <h2 id="essays-heading" className="border-b border-border pb-3 text-sm font-medium">
          Essays
        </h2>
        <div>
          {sortedPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border-b border-border py-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <h3 className="text-xl font-medium tracking-[-0.025em] group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
                {post.metadata.title}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {post.metadata.summary}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {notes.length > 0 && (
        <section className="mt-20 max-w-2xl" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="border-b border-border pb-3 text-sm font-medium">
            Notes
          </h2>
          <div className="divide-y divide-border">
            {notes.map((note) => (
              <article
                key={note.slug}
                className="note-prose py-6 text-[0.95rem] leading-7 text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: note.bodyHtml ?? "" }}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
