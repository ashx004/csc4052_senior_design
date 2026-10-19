import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Public legal pages, rendered from docs/legal so the published text and the
// repo copy can't drift. Prerendered at build time (generateStaticParams), so
// the docs folder only has to exist where the app is built.
const DOCS = {
  terms: { file: "terms-of-service.md", title: "Terms of Service" },
  privacy: { file: "privacy-policy.md", title: "Privacy Policy" },
  credits: { file: "credits-and-refunds.md", title: "AI Credits, Refunds and End of Service" },
} as const;
type Slug = keyof typeof DOCS;

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  return { title: DOCS[doc as Slug]?.title ?? "Legal" };
}

// The docs cross-reference each other by bold title; turn those into links.
const LINKS: [string, string][] = [
  ["**AI Credits, Refunds and End of Service**", "[AI Credits, Refunds and End of Service](/legal/credits)"],
  ["**Privacy Policy**", "[Privacy Policy](/legal/privacy)"],
];

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const entry = DOCS[doc as Slug];
  if (!entry) notFound();
  let markdown = await readFile(path.join(process.cwd(), "docs", "legal", entry.file), "utf8");
  for (const [from, to] of LINKS) markdown = markdown.replaceAll(from, to);

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-bg-main px-4 py-10 text-text-main">
      <nav className="mb-6 flex flex-wrap gap-4 text-sm">
        {(Object.keys(DOCS) as Slug[]).map((slug) => (
          <Link key={slug} href={`/legal/${slug}`} className={slug === doc ? "font-semibold text-primary" : "text-text-muted hover:text-primary"}>
            {DOCS[slug].title}
          </Link>
        ))}
      </nav>
      <article className="prose max-w-none dark:prose-invert prose-table:text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </main>
  );
}
