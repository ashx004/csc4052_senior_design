// src/library/discover/blocksSounds.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("playSound (SSR / no window)", () => {
  it("does nothing and does not throw when window is unavailable", async () => {
    const { playMove } = await import("./blocksSounds");
    expect(() => playMove()).not.toThrow();
  });
});

describe("playSound (browser-like environment)", () => {
  function stubAudio() {
    const playSpy = vi.fn().mockResolvedValue(undefined);
    const constructedSrcs: string[] = [];

    class FakeAudioElement {
      src: string;
      constructor(src: string) {
        this.src = src;
        constructedSrcs.push(src);
      }
      cloneNode() {
        return { play: playSpy };
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudioElement);
    return { playSpy, constructedSrcs };
  }

  it("constructs the right file and plays a cloned node, not the cached base", async () => {
    const { playSpy, constructedSrcs } = stubAudio();
    const { playPlace } = await import("./blocksSounds");

    playPlace();

    expect(constructedSrcs).toEqual(["/sounds/blocks/drop.mp3"]);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached base Audio element across repeated calls (constructs only once)", async () => {
    const { constructedSrcs } = stubAudio();
    const { playCorrect } = await import("./blocksSounds");

    playCorrect();
    playCorrect();
    playCorrect();

    expect(constructedSrcs).toEqual(["/sounds/blocks/correct.mp3"]);
  });

  it("does not throw when play() rejects (e.g. autoplay blocked)", async () => {
    vi.stubGlobal("window", {});
    const rejectingPlay = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    class RejectingAudioElement {
      constructor(_src: string) {}
      cloneNode() {
        return { play: rejectingPlay };
      }
    }
    vi.stubGlobal("Audio", RejectingAudioElement);

    const { playMove } = await import("./blocksSounds");
    expect(() => playMove()).not.toThrow();
  });
});
