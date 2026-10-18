"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// The markdown + math stack (react-markdown, remark/rehype, KaTeX and its
// CSS) is the heaviest part of the AI assistant page, and an empty chat never
// renders it. Kept in its own module so the page can load it lazily instead
// of parsing all of it on first entry.
export default function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
      {text}
    </ReactMarkdown>
  );
}
