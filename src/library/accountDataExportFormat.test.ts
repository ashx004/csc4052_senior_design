import { describe, expect, it } from "vitest";
import { accountExportFilename, encodeAccountExportValue, objectArchivePath } from "./accountDataExportFormat";
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
