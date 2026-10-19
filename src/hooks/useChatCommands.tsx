"use client";

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useBilling } from "@/src/context/BillingContext";
import { CHAT_SPEEDS, CHAT_SPEED_EVENT, getChatSpeed, parseChatSpeed, setChatSpeed, type ChatSpeed } from "@/src/library/chatSpeed";
import { SLASH_COMMANDS, parseSlashCommand, suggestSlashCommands, type SlashCommandId } from "@/src/library/slashCommands";
import { formatUsd } from "@/src/library/billing/money";

type Options = {
  input: string;
  setInput: (value: string) => void;
  /** What this chat has cost so far, and how many replies that covers. */
  costMicros: number;
  replies: number;
  /** Runs /compact; resolves with what to tell the student. Leave out where there's nothing to compact. */
  onCompact?: () => Promise<string>;
  onNewChat?: () => void;
  onClear?: () => void;
};

/**
 * Slash commands, the speed setting and command answers for one chat box.
 * The chat calls `handleKeyDown` first in its own key handler and `runCommand`
 * before sending; both return true when they dealt with the input.
 */
export function useChatCommands({ input, setInput, costMicros, replies, onCompact, onNewChat, onClear }: Options) {
  const { wallet, openAddCredit } = useBilling();
  const [speed, setSpeed] = useState<ChatSpeed>("balanced");
  const [notice, setNotice] = useState<ReactNode | null>(null);
  const [active, setActive] = useState(0);
  const [compacting, setCompacting] = useState(false);

  // Read after mount (localStorage isn't there during server rendering), and
  // follow changes made in another chat box on the page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeed(getChatSpeed());
    const onChange = (e: Event) => setSpeed((e as CustomEvent<ChatSpeed>).detail);
    window.addEventListener(CHAT_SPEED_EVENT, onChange);
    return () => window.removeEventListener(CHAT_SPEED_EVENT, onChange);
  }, []);

  const available: SlashCommandId[] = [
    ...(onCompact ? (["compact"] as const) : []),
    ...(onNewChat ? (["new"] as const) : []),
    ...(onClear ? (["clear"] as const) : []),
    "cost",
    ...(wallet?.cloudAi ? (["speed"] as const) : []),
    "help",
  ];
  const suggestions = suggestSlashCommands(input, available);

  const changeSpeed = useCallback((next: ChatSpeed) => {
    setChatSpeed(next);
    setSpeed(next);
  }, []);

  const compact = useCallback(async () => {
    if (!onCompact || compacting) return;
    setCompacting(true);
    setNotice("Summarizing older messages...");
    try {
      setNotice(await onCompact());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't summarize right now. Please try again.");
    } finally {
      setCompacting(false);
    }
  }, [onCompact, compacting]);

  function run(id: SlashCommandId, arg: string) {
    setInput("");
    switch (id) {
      case "compact":
        void compact();
        return;
      case "new":
        setNotice(null);
        onNewChat?.();
        return;
      case "clear":
        setNotice(null);
        onClear?.();
        return;
      case "cost":
        setNotice(
          <>
            {wallet?.cloudAi ? (
              <>This chat has used <strong>{formatUsd(costMicros)}</strong> of AI credit over {replies} {replies === 1 ? "reply" : "replies"}.</>
            ) : (
              <>AI is free on your account right now, so this chat hasn&apos;t used any credit.</>
            )}
            {wallet?.enforced && (
              <>
                {" "}Balance: <strong>{formatUsd(wallet.balanceMicros)}</strong>.{" "}
                <button type="button" onClick={() => openAddCredit()} className="font-medium text-primary underline">Add credit</button>
                {" · "}
                <a href="/billing" className="font-medium text-primary underline">History</a>
              </>
            )}
          </>
        );
        return;
      case "speed": {
        const next = parseChatSpeed(arg);
        if (next) {
          changeSpeed(next);
          setNotice(<>Speed set to <strong>{CHAT_SPEEDS.find((s) => s.id === next)?.label}</strong>.</>);
        } else {
          setNotice(
            <>
              Speed is <strong>{CHAT_SPEEDS.find((s) => s.id === speed)?.label}</strong>. Try{" "}
              {CHAT_SPEEDS.map((s, i) => (
                <span key={s.id}>{i > 0 && ", "}<code>/speed {s.id}</code></span>
              ))}
              .
            </>
          );
        }
        return;
      }
      case "help":
        setNotice(
          <ul className="space-y-0.5">
            {SLASH_COMMANDS.filter((c) => available.includes(c.id)).map((c) => (
              <li key={c.id}><code className="font-semibold">{c.usage}</code> <span className="text-text-muted">{c.description}</span></li>
            ))}
          </ul>
        );
        return;
    }
  }

  /** Runs `input` if it's a command. Returns true when it was one (don't send it to the AI). */
  function runCommand(): boolean {
    const parsed = parseSlashCommand(input, available);
    if (parsed) {
      run(parsed.id, parsed.arg);
      return true;
    }
    // "/foo" alone looks like a command attempt, not a question.
    if (/^\/[a-z]+$/i.test(input.trim())) {
      setNotice(<>Unknown command. Type <code>/help</code> to see the list.</>);
      return true;
    }
    return false;
  }

  /** Arrow keys, Tab and Enter while the command menu is open. Returns true when it handled the key. */
  function handleKeyDown(e: KeyboardEvent<HTMLElement>): boolean {
    if (!suggestions.length) return false;
    const index = Math.min(active, suggestions.length - 1);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
      return true;
    }
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      pick(suggestions[index].usage);
      return true;
    }
    if (e.key === "Escape") {
      setInput("");
      return true;
    }
    return false;
  }

  /** A command chosen from the menu: run it, or for /speed, wait for the choice. */
  function pick(usage: string) {
    setActive(0);
    const id = usage.slice(1).split(" ")[0] as SlashCommandId;
    if (id === "speed") setInput("/speed ");
    else run(id, "");
  }

  return {
    speed,
    changeSpeed,
    compact,
    compacting,
    notice,
    dismissNotice: () => setNotice(null),
    suggestions,
    activeSuggestion: Math.min(active, Math.max(0, suggestions.length - 1)),
    pick,
    runCommand,
    handleKeyDown,
    cloudAi: Boolean(wallet?.cloudAi),
  };
}
