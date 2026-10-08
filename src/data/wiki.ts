import fs from "fs";
import matter from "gray-matter";
import path from "path";
import { markdownToHTML } from "@/data/blog";

// Topics live in content/topics/<slug>.md, wiki pages in content/wiki/<slug>.md.
// Posts in content/*.mdx join a topic with `topics: [slug]` in their frontmatter.
// Inside wiki pages, [[slug]] or [[slug|text]] links to another wiki page.

const TOPICS_DIR = path.join(process.cwd(), "content", "topics");
const WIKI_DIR = path.join(process.cwd(), "content", "wiki");
const POSTS_DIR = path.join(process.cwd(), "content");

export type Topic = {
  slug: string;
  title: string;
  summary: string;
  pages: string[]; // reading order
  introHtml: string;
};

export type WikiPage = {
  slug: string;
  title: string;
  summary: string;
  topics: string[];
  links: string[]; // outgoing [[links]]
  html: string;
};

export type TopicPost = { slug: string; title: string; summary: string };

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function readDir(dir: string, ext: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => path.extname(file) === ext)
    .map((file) => ({
      slug: path.basename(file, ext),
      ...matter(fs.readFileSync(path.join(dir, file), "utf-8")),
    }));
}

function rawPages() {
  return readDir(WIKI_DIR, ".md");
}

async function render(markdown: string, titles: Map<string, string>) {
  const linked = markdown.replace(WIKILINK, (_, slug: string, text?: string) => {
    const target = slug.trim();
    const label = text?.trim() ?? titles.get(target) ?? target;
    return titles.has(target) ? `[${label}](/wiki/${target})` : label;
  });
  return markdownToHTML(linked);
}

function pageTitles() {
  return new Map(rawPages().map((p) => [p.slug, String(p.data.title ?? p.slug)]));
}

export async function getWikiPages(): Promise<WikiPage[]> {
  const titles = pageTitles();
  return Promise.all(
    rawPages().map(async (p) => ({
      slug: p.slug,
      title: String(p.data.title ?? p.slug),
      summary: String(p.data.summary ?? ""),
      topics: (p.data.topics as string[] | undefined) ?? [],
      links: Array.from(p.content.matchAll(WIKILINK), (m) => m[1].trim()),
      html: await render(p.content, titles),
    }))
  );
}

export async function getWikiPage(slug: string) {
  const pages = await getWikiPages();
  return pages.find((p) => p.slug === slug);
}

export async function getTopics(): Promise<Topic[]> {
  const titles = pageTitles();
  return Promise.all(
    readDir(TOPICS_DIR, ".md").map(async (t) => ({
      slug: t.slug,
      title: String(t.data.title ?? t.slug),
      summary: String(t.data.summary ?? ""),
      pages: (t.data.pages as string[] | undefined) ?? [],
      introHtml: await render(t.content, titles),
    }))
  );
}

export async function getTopic(slug: string) {
  const topics = await getTopics();
  return topics.find((t) => t.slug === slug);
}

/** Published posts that list this topic in their frontmatter. */
export function getTopicPosts(topic: string): TopicPost[] {
  return readDir(POSTS_DIR, ".mdx")
    .filter((p) => !p.data.draft && (p.data.topics as string[] | undefined)?.includes(topic))
    .map((p) => ({
      slug: p.slug,
      title: String(p.data.title),
      summary: String(p.data.summary ?? ""),
    }));
}
