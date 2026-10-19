// Slash commands typed in any Catalyst chat box. Each chat (main assistant,
// side panel, course panel) supplies its own handlers; a command a chat
// can't do (the side panel has no history) is simply left out of its list.

export type SlashCommandId = "compact" | "new" | "clear" | "cost" | "speed" | "help";

export const SLASH_COMMANDS: { id: SlashCommandId; usage: string; description: string }[] = [
  { id: "compact", usage: "/compact", description: "Summarize older messages now, so long chats stay fast and cheap" },
  { id: "new", usage: "/new", description: "Start a new chat" },
  { id: "clear", usage: "/clear", description: "Clear this conversation" },
  { id: "cost", usage: "/cost", description: "What this chat has cost, and your balance" },
  { id: "speed", usage: "/speed fast | balanced | thorough", description: "Trade quality for speed and credit" },
  { id: "help", usage: "/help", description: "List these commands" },
];

/** The command typed in `input`, if it is one ("/speed fast" gives speed with arg "fast"). */
export function parseSlashCommand(input: string, available: SlashCommandId[]): { id: SlashCommandId; arg: string } | null {
  const match = /^\/([a-z]+)(?:\s+(.*))?$/i.exec(input.trim());
  if (!match) return null;
  const id = match[1].toLowerCase() as SlashCommandId;
  return available.includes(id) ? { id, arg: (match[2] ?? "").trim() } : null;
}

/** Commands to suggest while the student is typing the first word after "/". */
export function suggestSlashCommands(input: string, available: SlashCommandId[]) {
  const match = /^\/([a-z]*)$/i.exec(input);
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return SLASH_COMMANDS.filter((c) => available.includes(c.id) && c.id.startsWith(typed));
}
