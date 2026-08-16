import { describe, expect, it } from "vitest";
import { stripThinkLeak, extractFirstJsonObject } from "./stripThinkLeak";

describe("stripThinkLeak", () => {
  it("returns content unchanged when there's no leak", () => {
    expect(stripThinkLeak('{"a":1}')).toBe('{"a":1}');
  });

  it("strips everything up to and including a stray closing tag", () => {
    expect(stripThinkLeak('some leaked reasoning</think>{"a":1}')).toBe('{"a":1}');
  });
});

describe("extractFirstJsonObject", () => {
  it("returns a clean JSON object unchanged", () => {
    const input = '{"topicName":"Test","questions":[]}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it("strips trailing garbage after the JSON object — the live 2026-08-14 bug", () => {
    const input = '{"topicName":"Recurrences","questions":[{"q":"x"}]} extra trailing fragment that broke JSON.parse';
    expect(extractFirstJsonObject(input)).toBe('{"topicName":"Recurrences","questions":[{"q":"x"}]}');
    expect(() => JSON.parse(extractFirstJsonObject(input))).not.toThrow();
  });

  it("doesn't get confused by braces inside string values", () => {
    const input = '{"note":"use {curly braces} in math"} trailing junk';
    expect(extractFirstJsonObject(input)).toBe('{"note":"use {curly braces} in math"}');
  });

  it("doesn't get confused by an escaped quote right before a brace", () => {
    const input = '{"note":"a quote: \\" then a brace }"} trailing junk';
    expect(JSON.parse(extractFirstJsonObject(input))).toEqual({ note: 'a quote: " then a brace }' });
  });

  it("handles nested objects correctly", () => {
    const input = '{"a":{"b":{"c":1}},"d":2} trailing junk';
    expect(extractFirstJsonObject(input)).toBe('{"a":{"b":{"c":1}},"d":2}');
  });

  it("falls back to the original text when there's no opening brace", () => {
    expect(extractFirstJsonObject("not json at all")).toBe("not json at all");
  });

  it("falls back to the original text when the object never closes", () => {
    const input = '{"a":1, "b":2';
    expect(extractFirstJsonObject(input)).toBe(input);
  });
});
