const beliefs = [
  "Data is more fundamental than the widget, but you need widgets to know what data to prune",
  "The cognitive benefits of handwriting are mostly just that it takes longer than typing",
  "Starting again from scratch hurts, but it is far more freeing than patching what you already have",
];

const ideas = [
  "A live ad-blocker — AR glasses that replace every billboard and physical ad with artwork",
  "Whether I am pruning data or making output widgets day to day, and which one should come first",
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
          className="border-b border-border pb-3 text-sm font-medium"
        >
          beliefs i currently have:
        </h2>
        <ul className="mt-5 space-y-2.5">
          {beliefs.map((belief) => (
            <li key={belief} className="flex gap-3 text-[0.95rem] leading-7">
              <span aria-hidden="true" className="text-muted-foreground">
                —
              </span>
              <span>{belief}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" aria-labelledby="ideas-heading">
        <h2
          id="ideas-heading"
          className="border-b border-border pb-3 text-sm font-medium"
        >
          ideas i am currently chewing on:
        </h2>
        <ul className="mt-5 space-y-2.5">
          {ideas.map((idea) => (
            <li key={idea} className="flex gap-3 text-[0.95rem] leading-7">
              <span aria-hidden="true" className="text-muted-foreground">
                —
              </span>
              <span>{idea}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
