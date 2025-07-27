import { DATA } from "@/data/resume";
import Link from "next/link";

export default function Page() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Ethan Lambeth</h1>
      
      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg leading-relaxed mb-6">
          Like anyone, I have spent too long collecting information. I am now trying to apply it.
        </p>
        
        <p className="text-lg leading-relaxed mb-6">
          In order to do this I dropped out of{" "}
          <a href="https://substack.com/home/post/p-161085114" className="text-blue-600 hover:underline">
            University
          </a>
          , and I am spending my time trying to build something I think is useful (more soon).
        </p>
        
        <p className="text-lg leading-relaxed mb-6">
          I want to see what happens when I commit to one impossible project, and go deep enough to either fail or succeed spectacularly.
        </p>
        
        <blockquote className="text-lg leading-relaxed border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic">
          I believe insight is scattered everywhere, waiting to be synthesized.
        </blockquote>

        <p className="text-lg leading-relaxed mb-6">
          elambethnz@gmail.com
        </p> 
      </div>
    </main>
  );
}