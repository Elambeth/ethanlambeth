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

  // Wiki pages and posts are one list: curated order first, then anything else tagged with this topic.
  const wiki = (await getWikiPages())
    .filter((p) => p.topics.includes(slug))
    .map((p) => ({ slug: p.slug, href: `/wiki/${p.slug}`, title: p.title, summary: p.summary }));
  const posts = getTopicPosts(slug).map((p) => ({ ...p, href: `/blog/${p.slug}` }));
  const rank = (s: string) => {
    const i = topic.pages.indexOf(s);
    return i === -1 ? Infinity : i;
  };
  const entries = [...wiki, ...posts].sort((a, b) => rank(a.slug) - rank(b.slug));

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="max-w-2xl">
        <Link
          href="/blog"
          className="link-underline rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
            entries={entries.map(({ href, title, summary }) => ({ href, title, summary }))}
          />
        </section>
      </div>
    </main>
  );
}
