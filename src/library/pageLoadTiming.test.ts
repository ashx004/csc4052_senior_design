import { describe, expect, it } from "vitest";
import {
  PAGE_LOAD_METRIC_VERSION,
  readPageLoadMeasurement,
} from "./pageLoadTiming";

describe("readPageLoadMeasurement", () => {
  it("uses and rounds a completed Navigation Timing duration", () => {
    const measurement = readPageLoadMeasurement({
      getEntriesByType: () =>
        [
          { name: "https://catalyst.test/dashboard", duration: 123.6, type: "reload" },
        ] as PerformanceEntry[],
    });

    expect(measurement).toEqual({
      load_time_ms: 124,
      navigation_type: "reload",
      metric_version: PAGE_LOAD_METRIC_VERSION,
    });
  });

  it("uses legacy timing only when it provides a completed load duration", () => {
    expect(
      readPageLoadMeasurement({
        getEntriesByType: () => [],
        timing: { navigationStart: 100, loadEventEnd: 380 },
      }),
    ).toMatchObject({ load_time_ms: 280, navigation_type: "unknown" });
    expect(
      readPageLoadMeasurement({
        getEntriesByType: () => [],
        timing: { navigationStart: 100, loadEventEnd: 0 },
      }),
    ).toBeNull();
  });

  it("does not invent a value when the browser exposes no valid timing", () => {
    expect(readPageLoadMeasurement({ getEntriesByType: () => [] })).toBeNull();
    expect(
      readPageLoadMeasurement({
        getEntriesByType: () =>
          [{ name: "navigation", duration: Number.NaN }] as PerformanceEntry[],
      }),
    ).toBeNull();
  });
});
