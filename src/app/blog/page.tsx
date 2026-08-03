import BlurFade from "@/components/magicui/blur-fade";
import { getBlogStream } from "@/data/blog";
import Link from "next/link";

export const metadata = {
  title: "Blog",
  description: "Writing, notes, and the occasional stray thought.",
};

const BLUR_FADE_DELAY = 0.04;

function formatAbsolute(date: string) {
  if (!date) return "";
  const value = date.includes("T") ? date : `${date}T00:00:00`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogPage() {
  const items = (await getBlogStream()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <BlurFade delay={BLUR_FADE_DELAY}>
        <h1 className="font-medium text-2xl mb-8 tracking-tighter">blog</h1>
      </BlurFade>
      {items.map((item, id) => (
        <BlurFade delay={BLUR_FADE_DELAY * 2 + id * 0.05} key={`${item.type}-${item.slug}`}>
          {item.type === "post" ? (
            <Link
              className="flex flex-col space-y-1 mb-4"
              href={`/blog/${item.slug}`}
            >
              <p className="tracking-tight">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatAbsolute(item.date)}
              </p>
            </Link>
          ) : (
            <article className="mb-10">
              <p className="text-xs text-muted-foreground mb-2">
                {formatAbsolute(item.date)}
              </p>
              <div
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: item.bodyHtml ?? "" }}
              />
            </article>
          )}
        </BlurFade>
      ))}
    </main>
  );
}
