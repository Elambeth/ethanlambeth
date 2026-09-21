const beliefs = [
  'Voice is not "the next interface".',
  "AI safety an extremely important problem",
];

const ideas = [
  "What conflict between large swarms of agents could look like.",
  "Interfaces, broadly.",
  "What an AR world would look like. What are the social norms that will form and dissapear (Arguably also an interface question)",
];

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Ethan Lambeth</h1>

      <div className="prose max-w-none dark:prose-invert">
        <p className="mb-6 text-lg leading-relaxed">
          At the moment I am building{" "}
          <a
            href="https://panaceaindex.com"
            className="text-blue-600 hover:underline"
          >
            panaceaindex.com
          </a>
        </p>
      </div>

      <section className="mt-16" aria-labelledby="beliefs-heading">
        <h2
          id="beliefs-heading"
          className="border-b border-border pb-3 text-base font-semibold"
        >
          Beliefs I currently have:
        </h2>
        <ul className="mt-5 list-disc space-y-2.5 pl-5 text-[0.95rem] leading-7 marker:text-muted-foreground">
          {beliefs.map((belief) => (
            <li key={belief}>{belief}</li>
          ))}
        </ul>
      </section>

      <section className="mt-16" aria-labelledby="ideas-heading">
        <h2
          id="ideas-heading"
          className="border-b border-border pb-3 text-base font-semibold"
        >
          Ideas I am currently chewing on:
        </h2>
        <ul className="mt-5 list-disc space-y-2.5 pl-5 text-[0.95rem] leading-7 marker:text-muted-foreground">
          {ideas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
