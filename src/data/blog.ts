import fs from "fs";
import matter from "gray-matter";
import path from "path";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

type Metadata = {
  title: string;
  publishedAt: string;
  summary: string;
  image?: string;
};

function getMDXFiles(dir: string) {
  return fs.readdirSync(dir).filter((file) => path.extname(file) === ".mdx");
}

export async function markdownToHTML(markdown: string) {
  const p = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypePrettyCode, {
      // https://rehype-pretty.pages.dev/#usage
      theme: {
        light: "min-light",
        dark: "min-dark",
      },
      keepBackground: false,
    })
    .use(rehypeStringify)
    .process(markdown);

  return p.toString();
}

export async function getPost(slug: string) {
  const filePath = path.join("content", `${slug}.mdx`);
  let source = fs.readFileSync(filePath, "utf-8");
  const { content: rawContent, data: metadata } = matter(source);
  const content = await markdownToHTML(rawContent);
  return {
    source: content,
    metadata,
    slug,
  };
}

async function getAllPosts(dir: string) {
  let mdxFiles = getMDXFiles(dir);
  return Promise.all(
    mdxFiles.map(async (file) => {
      let slug = path.basename(file, path.extname(file));
      let { metadata, source } = await getPost(slug);
      return {
        metadata,
        slug,
        source,
      };
    })
  );
}

export async function getBlogPosts() {
  return getAllPosts(path.join(process.cwd(), "content"));
}

export type BlogStreamItem = {
  type: "post" | "thought";
  slug: string;
  date: string;
  title?: string; // posts
  summary?: string; // posts
  bodyHtml?: string; // thoughts (rendered)
};

async function getThoughtItems(): Promise<BlogStreamItem[]> {
  const dir = path.join(process.cwd(), "content", "thoughts");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => path.extname(file) === ".md");

  return Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file);
      const source = fs.readFileSync(filePath, "utf-8");
      const { content, data } = matter(source);
      return {
        type: "thought" as const,
        slug: path.basename(file, ".md"),
        date: String(data.date ?? ""),
        bodyHtml: await markdownToHTML(content),
      };
    })
  );
}

/** Merged stream of posts (link out) and thoughts (render inline), unsorted. */
export async function getBlogStream(): Promise<BlogStreamItem[]> {
  const [posts, thoughts] = await Promise.all([getBlogPosts(), getThoughtItems()]);
  return [
    ...posts.map((post) => ({
      type: "post" as const,
      slug: post.slug,
      title: post.metadata.title,
      summary: post.metadata.summary,
      date: post.metadata.publishedAt,
    })),
    ...thoughts,
  ];
}
