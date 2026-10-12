import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobProgressIndicator from "./JobProgressIndicator";
import { JOB_STATUS } from "@/src/library/jobStatus";

describe("JobProgressIndicator", () => {
  it("communicates that a queued OCR job is waiting to start", () => {
    const markup = renderToStaticMarkup(<JobProgressIndicator kind="ocr" status={JOB_STATUS.pending} />);

    expect(markup).toContain("OCR transcription: Waiting to start");
    expect(markup).toContain("Your transcription is waiting to start.");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuetext="Waiting to start"');
  });

  it("communicates that an Advising job is actively processing", () => {
    const markup = renderToStaticMarkup(<JobProgressIndicator kind="advising" status={JOB_STATUS.inProgress} />);

    expect(markup).toContain("Advising request: Processing");
    expect(markup).toContain("Your advising request is being processed.");
    expect(markup).toContain('aria-label="Advising request progress"');
    expect(markup).toContain('aria-valuetext="Processing"');
  });
});
