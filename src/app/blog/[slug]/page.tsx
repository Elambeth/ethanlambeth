import { getBlogPosts, getPost } from "@/data/blog";
import { DATA } from "@/data/resume";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ImageCarousel from "@/components/image-carousel";

export async function generateStaticParams() {
  let posts = await getBlogPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: {
    slug: string;
  };
}): Promise<Metadata | undefined> {
  let post = await getPost(params.slug);

  let {
    title,
    publishedAt: publishedTime,
    summary: description,
    image,
  } = post.metadata;
  let ogImage = image ? `${DATA.url}${image}` : `${DATA.url}/og?title=${title}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime,
      url: `${DATA.url}/blog/${post.slug}`,
      images: [
        {
          url: ogImage,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Blog({
  params,
}: {
  params: {
    slug: string;
  };
}) {
  let post = await getPost(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <main id="blog" className="mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-6 sm:pt-16">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.metadata.title,
            datePublished: post.metadata.publishedAt,
            dateModified: post.metadata.publishedAt,
            description: post.metadata.summary,
            image: post.metadata.image
              ? `${DATA.url}${post.metadata.image}`
              : `${DATA.url}/og?title=${post.metadata.title}`,
            url: `${DATA.url}/blog/${post.slug}`,
            author: {
              "@type": "Person",
              name: DATA.name,
            },
          }),
        }}
      />
      <div className="max-w-2xl">
        <Link
          href="/blog"
          className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          All writing
        </Link>
        <header className="mb-12 mt-8">
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
            {post.metadata.title}
          </h1>
          {post.metadata.summary && (
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              {post.metadata.summary}
            </p>
          )}
        </header>
        {post.metadata.gallery && (
          <ImageCarousel images={post.metadata.gallery} />
        )}
        <article
          className="prose article-prose dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: post.source }}
        />
        <footer className="mt-16 border-t border-border pt-6">
          <Link
            href="/blog"
            className="rounded-sm text-sm font-medium outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
          >
            More writing
          </Link>
        </footer>
      </div>
    </main>
  );
}
