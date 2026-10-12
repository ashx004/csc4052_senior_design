import { describe, expect, it } from "vitest";
import { storedZip } from "./notebookArchive";

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

describe("storedZip", () => {
  it("writes a central directory every reader can walk", async () => {
    const entries = [
      { name: "a.txt", bytes: new TextEncoder().encode("hello") },
      { name: "dir/b.bin", bytes: new Uint8Array([1, 2, 3, 4]) },
    ];
    const zip = new Uint8Array(await storedZip(entries).arrayBuffer());
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    expect(u16(zip, eocd + 10)).toBe(2);
    const centralSize = u32(zip, eocd + 12);
    let pos = u32(zip, eocd + 16);
    expect(pos + centralSize).toBe(eocd);
    entries.forEach((entry) => {
      expect(u32(zip, pos)).toBe(0x02014b50);
      const nameLength = u16(zip, pos + 28);
      expect(u32(zip, pos + 24)).toBe(entry.bytes.length);
      const local = u32(zip, pos + 42);
      expect(u32(zip, local)).toBe(0x04034b50);
      expect(new TextDecoder().decode(zip.slice(pos + 46, pos + 46 + nameLength))).toBe(entry.name);
      expect(zip.slice(local + 30 + nameLength, local + 30 + nameLength + entry.bytes.length)).toEqual(entry.bytes);
      pos += 46 + nameLength;
    });
    expect(pos).toBe(eocd);
  });
});
