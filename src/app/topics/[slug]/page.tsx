import EntryList from "@/components/entry-list";
import { getTopic, getTopicPosts, getTopics, getWikiPages } from "@/data/wiki";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata | undefined> {
  const topic = await getTopic((await params).slug);
  if (!topic) return;
  return { title: topic.title, description: topic.summary };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = await getTopic(slug);
  if (!topic) notFound();

  // Curated order first, then anything else tagged with this topic.
  const tagged = (await getWikiPages()).filter((p) => p.topics.includes(slug));
  const rank = (s: string) => {
    const i = topic.pages.indexOf(s);
    return i === -1 ? Infinity : i;
  };
  const pages = tagged.sort((a, b) => rank(a.slug) - rank(b.slug));
  const posts = getTopicPosts(slug);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="max-w-2xl">
        <Link
          href="/blog"
          className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          All writing
        </Link>
        <header className="mb-14 mt-8">
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
            {topic.title}
          </h1>
          <div
            className="prose article-prose mt-6 text-muted-foreground dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: topic.introHtml }}
          />
        </header>

        <section aria-labelledby="pages-heading">
          <h2 id="pages-heading" className="border-b border-border pb-3 text-sm font-medium">
            Notes
          </h2>
          <EntryList
            entries={pages.map((p) => ({ href: `/wiki/${p.slug}`, title: p.title, summary: p.summary }))}
          />
        </section>

        {posts.length > 0 && (
          <section className="mt-16" aria-labelledby="posts-heading">
            <h2 id="posts-heading" className="border-b border-border pb-3 text-sm font-medium">
              Essays
            </h2>
            <EntryList
              entries={posts.map((p) => ({ href: `/blog/${p.slug}`, title: p.title, summary: p.summary }))}
            />
          </section>
        )}
      </div>
    </main>
  );
}
