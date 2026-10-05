import { noteToPlainText } from "./noteText";
import type { Note } from "./types";

type Entry = { name: string; bytes: Uint8Array };

const encoder = new TextEncoder();

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
}

function uniqueName(name: string, seen: Set<string>): string {
  const clean = safeName(name);
  if (!seen.has(clean)) {
    seen.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let n = 2;
  while (seen.has(`${stem} (${n})${ext}`)) n++;
  const result = `${stem} (${n})${ext}`;
  seen.add(result);
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number) { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }

/** Builds a standards-compliant, uncompressed ZIP in the browser. This avoids
 * adding a large archive dependency just to export a notebook. */
function storedZip(entries: Entry[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), 0, 0]);
    chunks.push(local, name, entry.bytes);
    central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset)]), name);
    offset += local.length + name.length + entry.bytes.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  return new Blob([...chunks, ...central, new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(entries.length), ...u16(entries.length), ...u32(centralSize), ...u32(offset), 0, 0])], { type: "application/zip" });
}

function downloadZip(filename: string, entries: Entry[]): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(storedZip(entries));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadNotebookArchive(notebookName: string, notes: Note[]): Promise<void> {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const note of notes) {
    if (note.kind === "typed") {
      const text = noteToPlainText(note.content) || note.plainText || "";
      entries.push({ name: uniqueName(`${note.title}.txt`, seen), bytes: encoder.encode(text) });
      continue;
    }
    if (!note.url) continue;
    const response = await fetch(note.url);
    if (!response.ok) throw new Error(`Couldn't add "${note.title}" to the notebook download.`);
    const ext = note.fileType ? `.${note.fileType}` : "";
    entries.push({ name: uniqueName(note.title.toLowerCase().endsWith(ext.toLowerCase()) ? note.title : `${note.title}${ext}`, seen), bytes: new Uint8Array(await response.arrayBuffer()) });
  }
  downloadZip(`${safeName(notebookName)}.zip`, entries);
}

/** Downloads an OCR document as its editable transcript and the source images
 * that produced it, so neither half of the document is lost on export. */
export async function downloadScanArchive(noteTitle: string, transcript: string, pages: { src: string }[]): Promise<void> {
  const seen = new Set<string>();
  const entries: Entry[] = [{ name: uniqueName(`${noteTitle}.txt`, seen), bytes: encoder.encode(transcript) }];
  for (let index = 0; index < pages.length; index++) {
    const response = await fetch(pages[index].src);
    if (!response.ok) throw new Error(`Couldn't add source image ${index + 1} to the download.`);
    const type = response.headers.get("content-type") || "";
    const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    entries.push({
      name: uniqueName(`source-image-${index + 1}.${extension}`, seen),
      bytes: new Uint8Array(await response.arrayBuffer()),
    });
  }
  downloadZip(`${safeName(noteTitle)}.zip`, entries);
}
