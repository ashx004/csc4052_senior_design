import { describe, expect, it } from "vitest";
import { RequestFailure, classifyRequestFailure } from "./requestFailure";

describe("classifyRequestFailure", () => {
  it("keeps authorization outcomes out of generic recovery states", () => {
    expect(classifyRequestFailure(new RequestFailure(401))).toBe("authorization");
    expect(classifyRequestFailure(new RequestFailure(403))).toBe("authorization");
  });

  it("classifies unavailable and server responses without using server text", () => {
    expect(classifyRequestFailure(new RequestFailure(404, "private response body"))).toBe("unavailable");
    expect(classifyRequestFailure(new RequestFailure(503, "private response body"))).toBe("server");
  });

  it("classifies transport failures as network errors", () => {
    expect(classifyRequestFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyRequestFailure(new DOMException("Timed out", "AbortError"))).toBe("network");
  });
});
