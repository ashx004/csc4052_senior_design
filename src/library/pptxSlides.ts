// Reads the text of a .pptx (a zip of XML) slide by slide. Shared by the server
// extractor (documentExtract.ts, for AI use) and the course file viewer
// (thumbnails and preview), so both see the same slides.

export interface PptxSlide {
  number: number;
  /** First line of the slide, usually its title. */
  title: string;
  /** Remaining paragraphs. */
  lines: string[];
  notes: string;
}

const decodeXmlEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** Paragraphs from the <a:t> runs inside each <a:p> of a slide's XML. */
function paragraphsOf(xml: string): string[] {
  return (xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? [])
    .map((paragraph) =>
      decodeXmlEntities((paragraph.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) ?? []).map((run) => run.replace(/<[^>]+>/g, "")).join(""))
    )
    .filter((line) => line.trim());
}

const slideNumber = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);

export async function parsePptxSlides(data: ArrayBuffer | Uint8Array | Buffer): Promise<PptxSlide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: PptxSlide[] = [];
  for (const path of slidePaths) {
    const number = slideNumber(path);
    const [title = "", ...lines] = paragraphsOf(await zip.files[path].async("string"));
    const notesFile = zip.files[`ppt/notesSlides/notesSlide${number}.xml`];
    const notes = notesFile ? paragraphsOf(await notesFile.async("string")).join("\n") : "";
    if (title || notes) slides.push({ number, title, lines, notes });
  }
  return slides;
}

/** Plain text for the AI: one block per slide, speaker notes included. */
export function pptxSlidesToText(slides: PptxSlide[]): string {
  return slides
    .map((s) => `--- Slide ${s.number} ---\n${[s.title, ...s.lines].join("\n")}${s.notes ? `\nSpeaker notes: ${s.notes}` : ""}`)
    .join("\n\n");
}
