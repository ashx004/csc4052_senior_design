import { describe, expect, it } from "vitest";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS,
  TERMINAL_JOB_STATUSES,
  isActiveJobStatus,
  isJobStatus,
  isTerminalJobStatus,
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
});
