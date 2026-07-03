"use client";

import { FormEvent, useState } from "react";
import { Mic } from "lucide-react";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

const mockMessages: ChatMessage[] = [
  {
    id: 1,
    role: "user",
    text: "How am I currently doing in my Computer Science class?",
  },
  {
    id: 2,
    role: "assistant",
    text: "You currently have an 84% in CSC 310. Your strongest topics are finite automata and regular languages, but your recent quiz results show that you need more practice with context-free grammars and the pumping lemma.",
  },
  {
    id: 3,
    role: "user",
    text: "Based on my completed courses, which classes should I take next semester?",
  },
  {
    id: 4,
    role: "assistant",
    text: "Based on your course history and degree requirements, you should consider CSC 430, CSC 451, and one remaining mathematics course. Since CSC 430 and CSC 451 may both require significant project work, I recommend balancing them with a lighter elective and confirming the plan with your academic advisor.",
  },
  {
    id: 5,
    role: "user",
    text: "What should I study before my exam next Friday?",
  },
  {
    id: 6,
    role: "assistant",
    text: "Focus first on context-free grammars and the pumping lemma because these are your weakest topics. I recommend reviewing Lectures 14–17, completing two practice problems each day, and taking a generated practice quiz on Thursday.",
  },
];

export default function AIAssistantPage() {
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!input.trim()) {
      return;
    }

    setHasStarted(true);
    setInput("");
  }

  function handleNewChat() {
    setHasStarted(false);
    setInput("");
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log("Copy failed");
    }
  }

  return (
    <section className="flex h-screen flex-col bg-[#f7f5f1] text-[#1f2933]">
      <header className="relative flex h-[73px] shrink-0 items-center justify-between border-b border-[#d8d3ca] bg-[#fbfaf8] px-6">
        <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-lg font-semibold tracking-[0.45em] text-black">
          studora assistant.
        </h1>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-full px-3 py-2 text-xl text-[#27251f] transition hover:bg-[#eee9df]"
          >
            +
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-36 pt-10">
          {!hasStarted ? (
            <div className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-center justify-center text-center">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#ded8cf] bg-white shadow-sm">
                <span className="text-3xl">✦</span>
              </div>

              <h2 className="mb-4 text-4xl font-semibold tracking-tight text-[#111827]">
                Welcome to Studora.
              </h2>

              <p className="mb-2 text-xl text-[#4b5563]">
                How can we help today?
              </p>

              <p className="text-sm text-[#777166]">
                Let&apos;s make the conversation with us.
              </p>

              <div className="mt-10 grid w-full gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setInput("How am I currently doing in my Computer Science class?")}
                  className="rounded-2xl border border-[#ded8cf] bg-white p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="mb-2 block font-medium text-[#111827]">
                    Check my grade
                  </span>
                  <span className="text-xs text-[#6b675f]">
                    Ask how you are doing in a class.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setInput("Based on my completed courses, which classes should I take next semester?")}
                  className="rounded-2xl border border-[#ded8cf] bg-white p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="mb-2 block font-medium text-[#111827]">
                    Plan courses
                  </span>
                  <span className="text-xs text-[#6b675f]">
                    Get mock course planning support.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setInput("What should I study before my exam next Friday?")}
                  className="rounded-2xl border border-[#ded8cf] bg-white p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="mb-2 block font-medium text-[#111827]">
                    Study plan
                  </span>
                  <span className="text-xs text-[#6b675f]">
                    Ask what to review before an exam.
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
              {mockMessages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex w-full ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {isUser ? (
                      <div className="max-w-xl rounded-2xl rounded-tr-md bg-[#6f6a5e] px-5 py-3 text-sm leading-relaxed text-white shadow-sm">
                        {message.text}
                      </div>
                    ) : (
                      <div className="group flex max-w-2xl items-start gap-3">
                        <div className="rounded-2xl bg-white px-5 py-4 text-sm leading-relaxed text-[#2f2f2b] shadow-sm ring-1 ring-[#eee8dd]">
                          {message.text}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(message.text)}
                          className="mt-2 rounded-md border border-[#d8d3ca] bg-white px-2 py-1 text-xs text-[#6b675f] opacity-80 transition hover:bg-[#f0ece5] group-hover:opacity-100"
                          aria-label="Copy assistant message"
                        >
                          ⧉
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#f7f5f1] via-[#f7f5f1] to-transparent pb-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-[#ded8cf] bg-white px-4 py-2 shadow-lg shadow-stone-200/70"
          >
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[#6f6a5e] transition hover:bg-[#f0ece5]"
              aria-label="Add attachment"
            >
              +
            </button>

            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Generate a name of ...."
              className="min-w-1 flex-1 bg-transparent text-sm text-[#1f2933] outline-none placeholder:text-[#aaa39a]"
            />

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6f6a5e] transition hover:bg-[#f0ece5]"
              aria-label="Voice input"
            >
              <Mic size={18} strokeWidth={2} />
            </button>

            <button
              type="submit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6f6a5e] text-xl text-white shadow-sm transition hover:bg-[#565248]"
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
        </div>
      </main>
    </section>
  );
}