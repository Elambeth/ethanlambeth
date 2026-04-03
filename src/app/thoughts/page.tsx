import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";

interface Thought {
  slug: string;
  title: string;
  date: string;
  content: string;
}

export default async function ThoughtsPage() {
  const thoughts = await getThoughts();

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Thoughts</h1>

      <div className="space-y-8">
        {thoughts.map((thought) => (
          <article key={thought.slug} className="border-b border-gray-200 dark:border-gray-700 pb-8 last:border-0">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {new Date(thought.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown>{thought.content}</ReactMarkdown>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

async function getThoughts(): Promise<Thought[]> {
  const thoughtsDirectory = path.join(process.cwd(), "content/thoughts");
  const filenames = fs.readdirSync(thoughtsDirectory);

  const thoughts = filenames
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => {
      const filePath = path.join(thoughtsDirectory, filename);
      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(fileContents);

      return {
        slug: filename.replace(/\.md$/, ""),
        title: data.title || filename,
        date: data.date || new Date().toISOString(),
        content,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return thoughts;
}
