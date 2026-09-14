import { getBlogPosts } from "@/data/blog";
import Link from "next/link";

export default async function Page() {
  const recentPosts = (await getBlogPosts())
    .sort(
      (a, b) =>
        new Date(b.metadata.publishedAt).getTime() -
        new Date(a.metadata.publishedAt).getTime()
    )
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-20 sm:px-6 sm:pt-28">
      <section className="max-w-2xl">
        <h1 className="text-balance text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
          Ethan Lambeth
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
          I build tools for making sense of complicated information. Right now,
          I’m working on{" "}
          <a
            href="https://panaceaindex.com"
            className="link-underline text-foreground"
          >
            Panacea Index
          </a>
          .
        </p>
      </section>

      <section className="mt-24 max-w-2xl" aria-labelledby="recent-writing">
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <h2 id="recent-writing" className="text-sm font-medium">
            Recent writing
          </h2>
          <Link
            href="/blog"
            className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all
          </Link>
        </div>
        <div>
          {recentPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border-b border-border py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <h3 className="text-[1.05rem] font-medium tracking-[-0.015em] group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
                {post.metadata.title}
              </h3>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
                {post.metadata.summary}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
