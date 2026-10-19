import { describe, expect, it } from "vitest";
import { parseSlashCommand, suggestSlashCommands } from "./slashCommands";
import { parseChatSpeed } from "./chatSpeed";
import { COMPACTION_CHAR_THRESHOLD, memoryFill } from "./chatCompactionLimits";

const all = ["compact", "new", "clear", "cost", "speed", "help"] as const;

describe("slash commands", () => {
  it("parses a command and its argument, only when that chat offers it", () => {
    expect(parseSlashCommand("/speed fast", [...all])).toEqual({ id: "speed", arg: "fast" });
    expect(parseSlashCommand("  /COST ", [...all])).toEqual({ id: "cost", arg: "" });
    expect(parseSlashCommand("/new", ["cost", "help"])).toBeNull();
    expect(parseSlashCommand("what is /usr/bin", [...all])).toBeNull();
  });

  it("suggests while the first word is being typed, then stops", () => {
    expect(suggestSlashCommands("/c", [...all]).map((c) => c.id)).toEqual(["compact", "clear", "cost"]);
    expect(suggestSlashCommands("/", ["cost", "help"]).map((c) => c.id)).toEqual(["cost", "help"]);
    expect(suggestSlashCommands("/speed ", [...all])).toEqual([]);
    expect(suggestSlashCommands("hello", [...all])).toEqual([]);
  });

  it("understands speed words", () => {
    expect(parseChatSpeed("Quick")).toBe("fast");
    expect(parseChatSpeed("deep")).toBe("thorough");
    expect(parseChatSpeed("medium")).toBeNull();
  });
});

describe("memoryFill", () => {
  it("counts only what isn't summarized yet, capped at full", () => {
    const half = "x".repeat(COMPACTION_CHAR_THRESHOLD / 2);
    expect(memoryFill([{ text: half }, { text: half }], 0)).toBe(1);
    expect(memoryFill([{ text: half }, { content: half }], 1)).toBe(0.5);
    expect(memoryFill([{ text: half.repeat(4) }], 0)).toBe(1);
  });
});
