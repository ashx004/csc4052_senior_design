import { describe, expect, it } from "vitest";
import { getEnrollmentStatus } from "./enrollmentStatus";

describe("getEnrollmentStatus", () => {
  it("passes through recognized statuses", () => {
    expect(getEnrollmentStatus({ status: "completed" })).toBe("completed");
    expect(getEnrollmentStatus({ status: "planned" })).toBe("planned");
  });

  it("defaults unset status to in-progress", () => {
    expect(getEnrollmentStatus({})).toBe("in-progress");
  });

  it("defaults an unrecognized status string to in-progress", () => {
    expect(getEnrollmentStatus({ status: "archived" })).toBe("in-progress");
  });
});
