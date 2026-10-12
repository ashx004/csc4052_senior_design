import { describe, expect, it } from "vitest";
import { nearestTextPoint } from "./clickTarget";

const text = { left: 80, right: 720, top: 72, bottom: 400 };

describe("nearestTextPoint", () => {
  it("moves a click in the left margin onto the start of the same line", () => {
    expect(nearestTextPoint({ x: 10, y: 200 }, text)).toEqual({ left: 81, top: 200 });
  });

  it("moves a click in the right margin onto the end of the same line", () => {
    expect(nearestTextPoint({ x: 790, y: 200 }, text)).toEqual({ left: 719, top: 200 });
  });

  it("sends a click above all the text to the very start, whatever its x", () => {
    expect(nearestTextPoint({ x: 600, y: 10 }, text)).toEqual({ left: 81, top: 73 });
  });

  it("sends a click below all the text to the very end, whatever its x", () => {
    expect(nearestTextPoint({ x: 100, y: 900 }, text)).toEqual({ left: 719, top: 399 });
  });

  it("leaves a click that is already over the text where it is", () => {
    expect(nearestTextPoint({ x: 300, y: 150 }, text)).toEqual({ left: 300, top: 150 });
  });

  it("copes with a text box narrower than the inset", () => {
    expect(nearestTextPoint({ x: 0, y: 0 }, { left: 10, right: 10, top: 5, bottom: 5 })).toEqual({ left: 11, top: 6 });
  });
});
