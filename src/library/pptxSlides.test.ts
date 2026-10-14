import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parsePptxSlides, pptxSlidesToText } from "./pptxSlides";

const slideXml = (...paragraphs: string[]) =>
  `<p:sld>${paragraphs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:sld>`;

describe("parsePptxSlides", () => {
  it("reads slides in numeric order with entities decoded and notes attached", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide10.xml", slideXml("Last"));
    zip.file("ppt/slides/slide2.xml", slideXml("Second &amp; more", "A bullet"));
    zip.file("ppt/slides/slide1.xml", slideXml("First"));
    zip.file("ppt/notesSlides/notesSlide2.xml", slideXml("Say this"));
    const slides = await parsePptxSlides(await zip.generateAsync({ type: "uint8array" }));
    expect(slides.map((s) => s.number)).toEqual([1, 2, 10]);
    expect(slides[1]).toMatchObject({ title: "Second & more", lines: ["A bullet"], notes: "Say this" });
    expect(pptxSlidesToText(slides)).toContain("--- Slide 2 ---\nSecond & more\nA bullet\nSpeaker notes: Say this");
  });
});
