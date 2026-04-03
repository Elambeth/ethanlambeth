import { DATA } from "@/data/resume";
import Link from "next/link";

export default function Page() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Ethan Lambeth</h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg leading-relaxed mb-6">
          At the moment I am building{" "}
          <a href="https://panaceaindex.com" className="text-blue-600 hover:underline">
            panaceaindex.com
          </a>
        </p>
      </div>
    </main>
  );
}