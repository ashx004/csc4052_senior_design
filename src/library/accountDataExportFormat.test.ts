import { describe, expect, it } from "vitest";
import { accountExportFilename, decodeAccountExportValue, encodeAccountExportValue, objectArchivePath } from "./accountDataExportFormat";
import { shouldIncludeFirebaseData } from "./accountDataExport";

describe("account data export formatting", () => {
  it("preserves timestamp and byte types in JSON", () => {
    expect(encodeAccountExportValue({ at: new Date("2026-01-02T03:04:05.000Z"), bytes: Buffer.from([1, 2, 3]) })).toEqual({
      at: { __catalystExportType: "timestamp", value: "2026-01-02T03:04:05.000Z" },
      bytes: { __catalystExportType: "bytes", base64: "AQID" },
    });
  });

  it("keeps original names/extensions while preventing archive-path collisions", () => {
    expect(objectArchivePath(1, "users/u1/classes/c1/Lecture Notes.pdf"))
      .toBe("files/objects/Lecture Notes--00000001.pdf");
    expect(objectArchivePath(24, "users/u1/classes/c2/Lecture Notes.pdf"))
      .toBe("files/objects/Lecture Notes--00000024.pdf");
  });

  it("removes path-like characters from user-controlled object names", () => {
    expect(objectArchivePath(1, "users/u1/classes/c1/../../unsafe?.docx"))
      .toBe("files/objects/unsafe_--00000001.docx");
  });

  it("creates a safe dated download filename", () => {
    expect(accountExportFilename(new Date("2026-10-06T12:00:00.000Z"))).toBe("catalyst-data-export-2026-10-06.zip");
  });

  it("uses the complete Firebase export unless the temporary mode explicitly disables it", () => {
    expect(shouldIncludeFirebaseData(undefined)).toBe(true);
    expect(shouldIncludeFirebaseData("FALSE")).toBe(false);
    expect(shouldIncludeFirebaseData("true")).toBe(true);
  });
});

describe("decodeAccountExportValue", () => {
  const factories = {
    geopoint: (latitude: number, longitude: number) => ({ geo: [latitude, longitude] }),
    reference: (path: string) => (path.startsWith("users/me/") ? { ref: path } : null),
  };

  it("reverses the export encoding", () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    const encoded = encodeAccountExportValue({ when: date, bytes: Buffer.from("hi"), list: [1, "a", null] });
    expect(decodeAccountExportValue(encoded, factories)).toEqual({ when: date, bytes: Buffer.from("hi"), list: [1, "a", null] });
  });

  it("only rebuilds references into the importing account", () => {
    const value = {
      mine: { __catalystExportType: "reference", path: "users/me/enrollment/a" },
      theirs: { __catalystExportType: "reference", path: "users/other/enrollment/a" },
      place: { __catalystExportType: "geopoint", latitude: 1, longitude: 2 },
    };
    expect(decodeAccountExportValue(value, factories)).toEqual({
      mine: { ref: "users/me/enrollment/a" },
      theirs: "users/other/enrollment/a",
      place: { geo: [1, 2] },
    });
  });

  it("drops an invalid timestamp instead of storing a broken date", () => {
    expect(decodeAccountExportValue({ __catalystExportType: "timestamp", value: "not a date" }, factories)).toBeNull();
  });
});
