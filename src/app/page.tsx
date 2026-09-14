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
    </main>
  );
}
