import { describe, expect, it, vi } from "vitest";
import { generateAcrossSources, MAX_BACKFILL_ATTEMPTS } from "./orchestrator";
import type { ResolvedSource } from "@/src/library/sources/sourceTypes";

const source = (title: string, text = `${title} body text that is long enough to quote from`): ResolvedSource => ({
  title,
  resourceId: title,
  sourceKey: `users/u/${title}`,
  text,
  pages: [1],
  viaRetrieval: true,
});

/** Items whose quote is genuinely inside the source text, so verification passes. */
const grounded = (s: ResolvedSource, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    question: `${s.title} Q${i}`,
    sourceQuote: s.text.slice(0, 30),
  }));

describe("generateAcrossSources", () => {
  it("asks each source for its own quota and returns the total", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
      topicName: "T",
      items: grounded(s, quota),
    }));
    const result = await generateAcrossSources({
      sources: [source("A"), source("B")],
      count: 20,
      generate,
    });
    expect(result.items).toHaveLength(20);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map((c) => c[1])).toEqual([10, 10]);
  });

  it("reports per-source coverage in the audit", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({ topicName: "T", items: grounded(s, quota) }));
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 20, generate });
    expect(result.audit).toEqual([
      { title: "A", resourceId: "A", requested: 10, produced: 10, viaRetrieval: true },
      { title: "B", resourceId: "B", requested: 10, produced: 10, viaRetrieval: true },
    ]);
  });

  it("drops items whose quote is not in that source's text", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
      topicName: "T",
      items: [
        ...grounded(s, quota - 1),
        { question: "fabricated", sourceQuote: "this sentence appears in no document at all" },
      ],
    }));
    const result = await generateAcrossSources({ sources: [source("A")], count: 5, generate });
    expect(result.items.some((i) => i.question === "fabricated")).toBe(false);
  });

  it("takes one generation call per source, never one combined call", async () => {
    const seen: string[] = [];
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => {
      seen.push(s.title);
      return { topicName: "T", items: grounded(s, quota) };
    });
    await generateAcrossSources({ sources: [source("A"), source("B"), source("C")], count: 12, generate });
    expect(seen).toEqual(["A", "B", "C"]);
  });

  // Review Focus 4: the shortfall loop must terminate.
  it("stops after the attempt limit when a source never produces valid items", async () => {
    const generate = vi.fn(async () => ({
      topicName: "T",
      items: [{ question: "bad", sourceQuote: "nowhere in the source text at all" }],
    }));
    const result = await generateAcrossSources({ sources: [source("A")], count: 5, generate });
    expect(result.items).toHaveLength(0);
    expect(generate).toHaveBeenCalledTimes(1 + MAX_BACKFILL_ATTEMPTS);
    expect(result.audit[0]).toMatchObject({ requested: 5, produced: 0 });
  });

  it("retries only the source that fell short", async () => {
    let aCalls = 0;
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => {
      if (s.title === "A") {
        aCalls++;
        if (aCalls === 1) return { topicName: "T", items: grounded(s, quota - 2) };
        // The backfill must offer NEW questions: grounded() restarts at Q0, and
        // a real model gets `alreadyAsked` precisely so it does not repeat.
        return {
          topicName: "T",
          items: grounded(s, quota).map((item, i) => ({ ...item, question: `A backfill Q${i}` })),
        };
      }
      return { topicName: "T", items: grounded(s, quota) };
    });
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 16, generate });
    expect(result.items).toHaveLength(16);
    const bCalls = generate.mock.calls.filter((c) => (c[0] as ResolvedSource).title === "B").length;
    expect(bCalls).toBe(1);
  });

  it("keeps the first topic name a source returns", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
      topicName: s.title === "A" ? "Binary Trees" : "Other",
      items: grounded(s, quota),
    }));
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 8, generate });
    expect(result.topicName).toBe("Binary Trees");
  });

  it("de-duplicates identical questions across sources", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) =>
      ({ topicName: "T", items: Array.from({ length: quota }, () => ({ question: "Same question?", sourceQuote: s.text.slice(0, 30) })) })
    );
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 8, generate });
    expect(result.items).toHaveLength(1);
  });

  it("shuffles into one pool when asked", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({ topicName: "T", items: grounded(s, quota) }));
    const result = await generateAcrossSources({
      sources: [source("A"), source("B")],
      count: 20,
      generate,
      shuffle: true,
      random: () => 0,
    });
    expect(result.items).toHaveLength(20);
    // With random() === 0 every swap targets index 0, so the order must change.
    expect(result.items.map((i) => i.question)).not.toEqual([
      ...grounded(source("A"), 10).map((i) => i.question),
      ...grounded(source("B"), 10).map((i) => i.question),
    ]);
  });

  it("keeps source order when not shuffling", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({ topicName: "T", items: grounded(s, quota) }));
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 8, generate });
    expect(result.items[0].question).toContain("A");
    expect(result.items[result.items.length - 1].question).toContain("B");
  });

  it("surfaces the quota error for a count below one item per source", async () => {
    const generate = vi.fn(async () => ({ topicName: "T", items: [] }));
    await expect(
      generateAcrossSources({ sources: [source("A"), source("B"), source("C")], count: 2, generate })
    ).rejects.toThrow("at least 3 items for 3 sources");
    expect(generate).not.toHaveBeenCalled();
  });

  // The central constraint: an item is verified against the text that was sent
  // for ITS source, never against the pooled text of every source. A quote
  // that is real, but belongs to a sibling document, must still be dropped.
  it("verifies each source's items against that source's own text", async () => {
    const a = source("A", "Alpha lecture covers red black trees and their rotations.");
    const b = source("B", "Beta lecture covers hash tables and open addressing.");
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => {
      if (s.title === "A") {
        return {
          topicName: "T",
          items: [
            { question: "cross-source", sourceQuote: "hash tables and open addressing" },
            ...grounded(s, quota - 1),
          ],
        };
      }
      return { topicName: "T", items: grounded(s, quota) };
    });
    const result = await generateAcrossSources({ sources: [a, b], count: 12, generate });
    expect(result.items.some((i) => i.question === "cross-source")).toBe(false);
    // Guard against a mutant that simply drops everything: A's own grounded
    // items must survive the same pass.
    expect(result.items.some((i) => i.question.startsWith("A Q"))).toBe(true);
  });

  it("refuses an empty source list", async () => {
    const generate = vi.fn(async () => ({ topicName: "T", items: [] }));
    await expect(generateAcrossSources({ sources: [], count: 10, generate })).rejects.toThrow("at least one source");
  });

  // Review Focus (I1): one bound across the loop. Each generator call keeps
  // its own 120-second deadline, so without an outer budget ten sources is
  // twenty serial calls inside a single HTTP request.
  describe("time budget", () => {
    /** A clock the test advances by `step` ms on every reading. */
    function clock(step: number) {
      let t = 1_000;
      return () => {
        const value = t;
        t += step;
        return value;
      };
    }

    it("stops reaching for new sources once the budget is spent", async () => {
      const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
        topicName: "T",
        items: grounded(s, quota),
      }));
      const result = await generateAcrossSources({
        sources: [source("A"), source("B"), source("C")],
        count: 12,
        generate,
        budgetMs: 10,
        now: clock(1_000),
      });
      // A alone is attempted; B and C are past the budget.
      expect(generate.mock.calls.map((c) => (c[0] as ResolvedSource).title)).toEqual(["A"]);
      expect(result.items).toHaveLength(4);
    });

    it("still reports every source in the audit when the budget cuts the loop short", async () => {
      const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
        topicName: "T",
        items: grounded(s, quota),
      }));
      const result = await generateAcrossSources({
        sources: [source("A"), source("B"), source("C")],
        count: 12,
        generate,
        budgetMs: 10,
        now: clock(1_000),
      });
      expect(result.audit.map((a) => a.title)).toEqual(["A", "B", "C"]);
      expect(result.audit[1]).toEqual({
        title: "B",
        resourceId: "B",
        requested: 4,
        produced: 0,
        viaRetrieval: true,
        skippedReason: "time-budget",
      });
      // An attempted source carries no marker, so a caller can tell a note
      // the model failed on from one that was never looked at.
      expect(result.audit[0].skippedReason).toBeUndefined();
    });

    it("does not start a backfill attempt past the budget", async () => {
      const generate = vi.fn(async () => ({
        topicName: "T",
        items: [{ question: "bad", sourceQuote: "nowhere in the source text at all" }],
      }));
      const result = await generateAcrossSources({
        sources: [source("A")],
        count: 5,
        generate,
        budgetMs: 10,
        now: clock(1_000),
      });
      // The first attempt always runs; the backfill is skipped.
      expect(generate).toHaveBeenCalledTimes(1);
      expect(result.audit[0].produced).toBe(0);
    });

    it("leaves the normal path untouched when the budget is ample", async () => {
      const generate = vi.fn(async (s: ResolvedSource, quota: number) => ({
        topicName: "T",
        items: grounded(s, quota),
      }));
      const result = await generateAcrossSources({
        sources: [source("A"), source("B"), source("C")],
        count: 12,
        generate,
        now: clock(1_000),
      });
      expect(generate).toHaveBeenCalledTimes(3);
      expect(result.items).toHaveLength(12);
      expect(result.audit.every((a) => a.skippedReason === undefined)).toBe(true);
    });
  });

  it("continues when one source's generation throws", async () => {
    const generate = vi.fn(async (s: ResolvedSource, quota: number) => {
      if (s.title === "A") throw new Error("model exploded");
      return { topicName: "T", items: grounded(s, quota) };
    });
    const result = await generateAcrossSources({ sources: [source("A"), source("B")], count: 16, generate });
    expect(result.audit[0]).toMatchObject({ title: "A", produced: 0 });
    expect(result.items.length).toBeGreaterThan(0);
  });
});
