import { describe, expect, it } from "vitest";
import { documentDownloadUrl, documentDisplayName, storageKeyFromSourceDocKey } from "./documentSource";

// A resource uploaded through fileUploadService stores only `url`, so
// documentTargetForResource falls back to that url and a task's sourceDocKey is
// "/api/download?key=...". Wrapping that in another download url produced
// "/api/download?key=%2Fapi%2Fdownload%3Fkey%3D...", which ownsUrl rejects, so
// generation answered "Couldn't read any of the documents you picked."
const KEY = "users/u1/classes/c1/1730_lecture.pdf";
const URL_KEY = `/api/download?key=${encodeURIComponent(KEY)}`;

describe("storageKeyFromSourceDocKey", () => {
  it("passes a bare storage key through", () => {
    expect(storageKeyFromSourceDocKey(KEY)).toBe(KEY);
  });

  it("unwraps a key that is already a download url", () => {
    expect(storageKeyFromSourceDocKey(URL_KEY)).toBe(KEY);
  });

  it("unwraps an unencoded download url", () => {
    expect(storageKeyFromSourceDocKey(`/api/download?key=${KEY}`)).toBe(KEY);
  });
});

describe("documentDownloadUrl", () => {
  it("builds one download url from a bare key", () => {
    expect(documentDownloadUrl(KEY)).toBe(URL_KEY);
  });

  it("never wraps a download url inside another one", () => {
    expect(documentDownloadUrl(URL_KEY)).toBe(URL_KEY);
  });
});

describe("documentDisplayName", () => {
  it("names the file behind a bare key", () => {
    expect(documentDisplayName(KEY)).toBe("lecture.pdf");
  });

  it("names the file behind a download url", () => {
    expect(documentDisplayName(URL_KEY)).toBe("lecture.pdf");
  });

  it("falls back when there is no file name", () => {
    expect(documentDisplayName("")).toBe("document");
  });
});
