import { describe, expect, it } from "vitest";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS,
  PUBLIC_JOB_STATUS,
  TERMINAL_JOB_STATUSES,
  isActiveJobStatus,
  isJobStatus,
  isTerminalJobStatus,
  toPublicJob,
  toPublicJobStatus,
} from "./jobStatus";

describe("background job status", () => {
  it("defines the shared OCR and Advising in-flight lifecycle", () => {
    expect(ACTIVE_JOB_STATUSES).toEqual([JOB_STATUS.pending, JOB_STATUS.inProgress]);
    expect(JOB_STATUS.pending).toBe("queued");
    expect(JOB_STATUS.inProgress).toBe("processing");
  });

  it("defines successful, failed, and worker-specific terminal outcomes", () => {
    expect(TERMINAL_JOB_STATUSES).toEqual([
      JOB_STATUS.completed,
      JOB_STATUS.failed,
      JOB_STATUS.cancelled,
      JOB_STATUS.superseded,
    ]);
    expect(isTerminalJobStatus(JOB_STATUS.completed)).toBe(true);
    expect(isTerminalJobStatus(JOB_STATUS.failed)).toBe(true);
  });

  it("recognizes only supported persisted status values", () => {
    expect(isJobStatus(JOB_STATUS.pending)).toBe(true);
    expect(isJobStatus("waiting")).toBe(false);
    expect(isActiveJobStatus(JOB_STATUS.inProgress)).toBe(true);
    expect(isActiveJobStatus(JOB_STATUS.completed)).toBe(false);
    expect(isTerminalJobStatus("waiting")).toBe(false);
  });

  it("converts persisted worker states into the four public API outcomes", () => {
    expect(toPublicJobStatus(JOB_STATUS.pending)).toBe(PUBLIC_JOB_STATUS.pending);
    expect(toPublicJobStatus(JOB_STATUS.inProgress)).toBe(PUBLIC_JOB_STATUS.inProgress);
    expect(toPublicJobStatus(JOB_STATUS.completed)).toBe(PUBLIC_JOB_STATUS.completed);
    expect(toPublicJobStatus(JOB_STATUS.failed)).toBe(PUBLIC_JOB_STATUS.failed);
    expect(toPublicJobStatus(JOB_STATUS.cancelled)).toBe(PUBLIC_JOB_STATUS.failed);
    expect(toPublicJobStatus("unknown")).toBeNull();
  });

  it("exposes only truthful, known progress values", () => {
    expect(toPublicJob("job-1", "ocr", JOB_STATUS.pending)).toEqual({
      id: "job-1", type: "ocr", status: "pending", progress: 0,
    });
    expect(toPublicJob("job-1", "advising_schedule", JOB_STATUS.inProgress)).toEqual({
      id: "job-1", type: "advising_schedule", status: "in_progress",
    });
    expect(toPublicJob("job-1", "advising_extraction", JOB_STATUS.completed)).toEqual({
      id: "job-1", type: "advising_extraction", status: "completed", progress: 100,
    });
    expect(toPublicJob("job-1", "ocr", JOB_STATUS.pending, true)).toEqual({
      id: "job-1", type: "ocr", status: "in_progress",
    });
  });
});
