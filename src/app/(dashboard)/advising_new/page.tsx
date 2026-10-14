"use client";

import { useState, useEffect, useRef } from "react";
import AdvisingPermissionModal from "@/src/components/advising/AdvisingPermissionModal";
import AdvisingUploadModal from "@/src/components/advising/AdvisingUploadModal";
import AdvisingProgress from "@/src/components/advising/AdvisingProgress";
import TransferCreditForm from "@/src/components/advising/TransferCreditForm";
import AdvisingDocumentsViewer from "@/src/components/advising/AdvisingDocumentsViewer";
import { useAuth } from "@/src/context/AuthContext";
import JobProgressIndicator from "@/src/components/jobs/JobProgressIndicator";
import {
  PUBLIC_JOB_STATUS,
  isPublicActiveJobStatus,
  type PublicActiveJobStatus,
  type PublicJob,
} from "@/src/library/jobStatus";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import advisingNewSteps from "@/src/library/tutorials/steps/advising_new";
import advisingSetupSteps from "@/src/library/tutorials/steps/advising-setup";


type GeneratedCourse = {
  courseCode: string;
  courseTitle: string | null;
  creditHours: number | null;
  requirementId: string | null;
};

type GeneratedTerm = {
  term:
    | "Fall"
    | "Winter"
    | "Spring"
    | "Summer";

  year: number;
  courses: GeneratedCourse[];
};

type GeneratedSchedule = {
  terms: GeneratedTerm[];
  warnings: string[];
};

// Status of an advising background job, as reported by GET
// /api/advising/extract and GET /api/advising/generate. "stale" means the job
// stopped responding, so it's treated as not running.
type JobStatus = "none" | "queued" | "processing" | "complete" | "failed" | "stale";

type JobStatusResponse = {
  status: JobStatus;
  job: PublicJob | null;
  lastError: string | null;
  // extraction jobs
  needsManualTransferReview?: boolean;
  unreadableTransferInfo?: { rowCount: number; totalCreditHours: number } | null;
  // schedule jobs: the saved schedule, once complete
  schedule?: GeneratedSchedule | null;
};

const isRunning = (job: PublicJob | null): job is PublicJob & { status: PublicActiveJobStatus } =>
  Boolean(job && isPublicActiveJobStatus(job.status));

const JOB_POLL_INTERVAL_MS = 4000;
const MAX_JOB_POLL_MS = 20 * 60 * 1000;
type PendingPoll = { timer: ReturnType<typeof setTimeout>; resolve: () => void };


export default function AdvisingPage() {
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [isCheckingDocuments, setIsCheckingDocuments] = useState<boolean>(true);
  // Bumped when new results are saved, so the results view reloads them.
  const [resultsKey, setResultsKey] = useState<number>(0);
  const { user, loading } = useAuth();
  const [documentsReady, setDocumentsReady] = useState<boolean>(false);
  const [generatedSchedule, setGeneratedSchedule,] = useState<GeneratedSchedule | null>(null);
  const [isGeneratingSchedule, setIsGeneratingSchedule,] = useState<boolean>(false);
  const [scheduleJobStatus, setScheduleJobStatus] = useState<PublicActiveJobStatus | null>(null);
  const [transferReviewInfo, setTransferReviewInfo] = useState<{rowCount: number; totalCreditHours: number;} | null>(null);
  const [showManualCourseForm, setShowManualCourseForm] = useState<boolean>(false);
  const [scheduleNeedsRegeneration, setScheduleNeedsRegeneration] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionJobStatus, setExtractionJobStatus] = useState<PublicActiveJobStatus | null>(null);

  // Upload/generate jobs run on the server, so leaving this page doesn't stop
  // them - a popup (NotificationToast) reports the result wherever the
  // student is. This only stops this page's status polling once it's gone.
  const mountedRef = useRef(true);
  const pendingPollsRef = useRef<Set<PendingPoll>>(new Set());
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const poll of pendingPollsRef.current) {
        clearTimeout(poll.timer);
        poll.resolve();
      }
      pendingPollsRef.current.clear();
    };
  }, []);

  function waitForNextPoll() {
    return new Promise<void>((resolve) => {
      let poll: PendingPoll;
      const timer = setTimeout(() => {
        pendingPollsRef.current.delete(poll);
        resolve();
      }, JOB_POLL_INTERVAL_MS);
      poll = { timer, resolve };
      pendingPollsRef.current.add(poll);
    });
  }

  async function fetchJobStatus(url: string) {
    const token = await user!.getIdToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not check on your advising request.");
    }
    return data as JobStatusResponse;
  }

  // Polls a job until it finishes. Returns the final status data, or null if
  // the student left the page first (the job keeps running on the server).
  async function waitForJob(
    url: string,
    fallbackError: string,
    onActiveStatus: (status: PublicActiveJobStatus) => void
  ) {
    const deadline = Date.now() + MAX_JOB_POLL_MS;

    while (Date.now() < deadline) {
      await waitForNextPoll();
      if (!mountedRef.current) return null;

      const data = await fetchJobStatus(url);
      if (isRunning(data.job)) onActiveStatus(data.job.status);
      if (data.job?.status === PUBLIC_JOB_STATUS.completed) return data;
      if (data.job?.status === PUBLIC_JOB_STATUS.failed) throw new Error(data.lastError ?? fallbackError);
      if (!isRunning(data.job)) {
        throw new Error("Your request stopped responding. Please try again.");
      }
    }

    throw new Error("This is taking longer than expected. You'll get a notification when it's done.");
  }

  useEffect(() => {
  if (loading || !user) {
    return;
  }

  async function checkExistingDocuments() {
        try {
        setIsCheckingDocuments(true);
        setErrorMessage("");

        // Pick up where the student left off - but only if an upload or a
        // schedule is actually still being worked on. Otherwise (nothing
        // running, or it already finished or failed) the page opens normally.
        const [extractionJob, scheduleJob] = await Promise.all([
          fetchJobStatus("/api/advising/extract"),
          fetchJobStatus("/api/advising/generate"),
        ]);

        if (isRunning(extractionJob.job)) {
          setExtractionJobStatus(extractionJob.job.status);
          setIsCheckingDocuments(false);
          resumeExtraction();
          return;
        }

        if (scheduleJob.job?.status === PUBLIC_JOB_STATUS.completed && scheduleJob.schedule) {
          setGeneratedSchedule(scheduleJob.schedule);
        }

        if (isRunning(scheduleJob.job)) {
          setScheduleJobStatus(scheduleJob.job.status);
          setDocumentsReady(true);
          setIsCheckingDocuments(false);
          resumeScheduleGeneration();
          return;
        }

        const response = await fetch(
            `/api/advising/upload?userId=${encodeURIComponent(
            user!.uid
            )}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
            data.error ??
                "Could not check your advising documents."
            );
        }

        // Returning students go straight to their results; "Replace files" is there
        // if they want to start over, so there's no question to answer first.
        if (data.hasDocuments) {
            setDocumentsReady(true);
        } else {
            setShowPermissionModal(true);
        }
        } catch (error) {
        setErrorMessage(
            error instanceof Error
            ? error.message
            : "Could not check your advising documents."
        );
        } finally {
        setIsCheckingDocuments(false);
        }
    }

    checkExistingDocuments();
 }, [user, loading]);


  // Give the advising model a head start loading into VRAM as soon as the
  // upload modal opens, so cold-load time overlaps with the student's file
  // upload instead of sitting on the extraction call's critical path (where
  // it risks the Cloudflare tunnel's ~100s timeout - see advisingOllama.ts).
  // Best-effort: extraction still works if this fails, just slower.
  useEffect(() => {
    if (!showUploadModal || !user) { return; }

    user.getIdToken()
      .then((token) =>
        fetch("/api/warm-model", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ modelKey: "museGlimmer" }),
        })
      )
      .catch(() => {});
  }, [showUploadModal, user]);


  function handleAcceptUpload() {
    setShowPermissionModal(false);
    setShowUploadModal(true);
    setErrorMessage("");
    setUploadSuccess(false);
  }


  function handleDeclineUpload() {
    setShowPermissionModal(false);
    setShowUploadModal(false);
    setErrorMessage(
      "Catalyst cannot access the advising tools without your transcript and curriculum information."
    );
  }

  if (loading || isCheckingDocuments) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <p className="text-text-muted">
          Loading...
        </p>
      </div>
    );
  }

  async function extractDocuments(): Promise<boolean> {

  if (!user) { return false; }

  try {

    setErrorMessage("");
    setIsExtracting(true);

    const token = await user.getIdToken();

    const response =
      await fetch(
        "/api/advising/extract",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    const data = await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ??
          "The documents could not be read."
      );
    }

    setExtractionJobStatus(
      isPublicActiveJobStatus(data.job?.status) ? data.job.status : PUBLIC_JOB_STATUS.pending
    );

    // Extraction runs as a background job (it can involve several sequential
    // AI calls, easily taking a few minutes) instead of one long blocking
    // request, so poll for the result rather than waiting on this response.
    return await finishExtraction();

  } catch (error) {

    if (mountedRef.current) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The documents could not be read."
      );
      setIsExtracting(false);
    }

    return false;
  }
}

  // Waits for the running extraction job and applies its result. Shared by a
  // fresh upload and by returning to the page while one is still running.
  async function finishExtraction(): Promise<boolean> {
    try {
      const statusData = await waitForJob(
        "/api/advising/extract",
        "The documents could not be read.",
        setExtractionJobStatus
      );
      if (!statusData) return false; // left the page - the popup takes it from here

      if (statusData.needsManualTransferReview && statusData.unreadableTransferInfo) {
        setTransferReviewInfo({
          rowCount: statusData.unreadableTransferInfo.rowCount,
          totalCreditHours: statusData.unreadableTransferInfo.totalCreditHours,
        });
      } else {
        setTransferReviewInfo(null);
      }

      return true;
    } finally {
      if (mountedRef.current) {
        setIsExtracting(false);
        setExtractionJobStatus(null);
      }
    }
  }

  async function resumeExtraction() {
    setIsExtracting(true);
    try {
      if (await finishExtraction()) setDocumentsReady(true);
    } catch (error) {
      if (mountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "The documents could not be read.");
      }
    }
  }

  async function generateSchedule() {

    if (!user) { return; }

    try {

      setErrorMessage("");

      setIsGeneratingSchedule(true);

      const token = await user.getIdToken();


      const response =
        await fetch(
          "/api/advising/generate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${token}`,
            },
          }
        );


      const data = await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ??
            "The schedule could not be generated."
        );
      }

      setScheduleJobStatus(
        isPublicActiveJobStatus(data.job?.status) ? data.job.status : PUBLIC_JOB_STATUS.pending
      );

      // Generation runs as a background job, like extraction - wait for it.
      await finishScheduleGeneration();

    } catch (error) {

      if (mountedRef.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The schedule could not be generated."
        );
        setIsGeneratingSchedule(false);
      }
    }
  }

  // Waits for the running schedule job and shows the saved schedule. Shared
  // by clicking Generate and by returning to the page while one is running.
  async function finishScheduleGeneration() {
    try {
      const statusData = await waitForJob(
        "/api/advising/generate",
        "The schedule could not be generated.",
        setScheduleJobStatus
      );
      if (!statusData) return; // left the page - the popup takes it from here

      setGeneratedSchedule(statusData.schedule ?? null);
      setScheduleNeedsRegeneration(false);
    } finally {
      if (mountedRef.current) {
        setIsGeneratingSchedule(false);
        setScheduleJobStatus(null);
      }
    }
  }

  async function resumeScheduleGeneration() {
    setIsGeneratingSchedule(true);
    try {
      await finishScheduleGeneration();
    } catch (error) {
      if (mountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "The schedule could not be generated.");
      }
    }
  }

  const showFiles = documentsReady;

  return (
    <div className="min-h-screen bg-bg-main text-text-main">
      {documentsReady && !showPermissionModal && <PageTutorial id="advising_new" steps={advisingNewSteps} />}

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4" data-tutorial="advising-new-welcome">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">Advising</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-text-muted">
              Add your transcript and curriculum sheet to see how far along you are, what&apos;s left, and a suggested schedule for the rest of your time here.
            </p>
          </div>
          {showFiles && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowManualCourseForm(true)}
                disabled={showManualCourseForm}
                className="rounded-lg border border-border-light bg-bg-container px-3.5 py-2 text-sm font-medium text-text-main transition hover:bg-bg-warm disabled:opacity-50"
              >
                Add a completed course
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  setShowPermissionModal(true);
                }}
                disabled={isExtracting}
                className="rounded-lg border border-border-light bg-bg-container px-3.5 py-2 text-sm font-medium text-text-main transition hover:bg-bg-warm disabled:opacity-50"
              >
                Replace files
              </button>
            </div>
          )}
        </header>

        {errorMessage && (
          <div role="alert" className="mt-5 w-full overflow-hidden break-words whitespace-pre-wrap rounded-lg border border-alert-error bg-alert-error-bg px-4 py-3 text-sm text-alert-error">
            {errorMessage}
          </div>
        )}

        {uploadSuccess && !isExtracting && (
          <div className="mt-5 rounded-lg border border-alert-success bg-alert-success-bg px-4 py-3 text-sm text-alert-success">
            Your files were uploaded and read. Your results are below.
          </div>
        )}

        {isExtracting && (
          <section className="mt-5 rounded-xl border border-border-light bg-bg-container p-5" aria-live="polite">
            <JobProgressIndicator kind="advising" status={extractionJobStatus ?? PUBLIC_JOB_STATUS.inProgress} />
            <p className="mt-3 text-sm text-text-muted">
              Reading your transcript and curriculum sheet. This can take a few minutes, and you can leave this page: it keeps going and you&apos;ll get a notification when it&apos;s done.
            </p>
          </section>
        )}

        {!showFiles && !isExtracting && (
          <section className="mt-8 rounded-2xl border border-border-light bg-bg-container p-8 shadow-sm">
            <h2 className="text-lg font-semibold">Get started in two steps</h2>
            <ol className="mt-4 space-y-3 text-sm text-text-main">
              <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-warm text-xs font-semibold text-primary">1</span><span><span className="font-medium">Add two PDFs.</span> <span className="text-text-muted">Your unofficial transcript and your program&apos;s curriculum sheet.</span></span></li>
              <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-warm text-xs font-semibold text-primary">2</span><span><span className="font-medium">Review what we found.</span> <span className="text-text-muted">See your progress and requirements, then generate a suggested schedule.</span></span></li>
            </ol>
            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setShowPermissionModal(true);
              }}
              className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover"
            >
              Add your files
            </button>
          </section>
        )}

        {showFiles && !isExtracting && user && <AdvisingProgress uid={user.uid} refreshKey={resultsKey} />}

        {showFiles && (transferReviewInfo || showManualCourseForm) && (
          <section className="mt-8">
            <TransferCreditForm
              expectedRowCount={transferReviewInfo?.rowCount}
              expectedTotalCreditHours={transferReviewInfo?.totalCreditHours}
              heading={transferReviewInfo ? undefined : "Add a completed course"}
              description={
                transferReviewInfo ? undefined : "Add a course you've already completed elsewhere (transfer credit, AP credit, or anything not on your transcript) so it counts toward your remaining requirements."
              }
              dismissLabel={transferReviewInfo ? "Skip for now" : "Close"}
              onSaved={() => {
                setTransferReviewInfo(null);
                setShowManualCourseForm(false);
                setScheduleNeedsRegeneration(true);
                setResultsKey((key) => key + 1);
              }}
              onDismiss={() => {
                setTransferReviewInfo(null);
                setShowManualCourseForm(false);
              }}
            />
          </section>
        )}

        {showFiles && !isExtracting && (
          <section className="mt-8 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">Suggested schedule</h2>
                <p className="mt-1.5 max-w-xl text-sm text-text-muted">
                  A plan for your remaining terms, built from the requirements above. It takes about a minute.
                </p>
              </div>
              <button
                type="button"
                onClick={generateSchedule}
                disabled={isGeneratingSchedule}
                data-tutorial="advising-new-generate"
                className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingSchedule ? "Generating..." : generatedSchedule ? "Regenerate schedule" : "Generate schedule"}
              </button>
            </div>

            {isGeneratingSchedule && (
              <div aria-live="polite">
                <JobProgressIndicator className="mt-4" kind="advising" status={scheduleJobStatus ?? PUBLIC_JOB_STATUS.inProgress} />
                <p className="mt-3 text-sm text-text-muted">You can leave this page. You&apos;ll get a notification when your schedule is ready.</p>
              </div>
            )}

            {scheduleNeedsRegeneration && !isGeneratingSchedule && (
              <p className="mt-3 text-sm text-primary">Your courses changed. Regenerate the schedule to see the update.</p>
            )}

            <div className="mt-5 rounded-lg border border-border-light bg-bg-main p-5" data-tutorial="advising-new-preview">
              {!generatedSchedule && <p className="text-sm text-text-muted">Your suggested schedule will appear here.</p>}
            {generatedSchedule && (
              <div className="space-y-6">


                {generatedSchedule.terms
                  .filter((term) => term.courses.length > 0)
                  .map(
                    (term) => (
                      <section key={`${term.term}-${term.year}`}
                      className="
                        rounded-xl
                        border
                        border-border-light
                        bg-bg-container
                        p-5
                      "
                    >

                      <h3
                        className="
                          text-lg
                          font-semibold
                        "
                      >
                        {term.term} {term.year}
                      </h3>


                      <div className="mt-4 space-y-3">

                        {term.courses.map(
                          (course) => (

                            <div
                              key={
                                `${term.term}-${term.year}-${course.courseCode}`
                              }
                              className="
                                flex
                                items-center
                                justify-between
                                gap-4
                                rounded-lg
                                border
                                border-border-light
                                px-4
                                py-3
                              "
                            >

                              <div>

                                <p
                                  className="
                                    text-sm
                                    font-semibold
                                  "
                                >
                                  {course.courseCode}
                                </p>


                                {course.courseTitle && (

                                  <p
                                    className="
                                      mt-1
                                      text-xs
                                      text-text-muted
                                    "
                                  >
                                    {course.courseTitle}
                                  </p>

                                )}

                              </div>


                              {course.creditHours !== null && (

                                <span
                                  className="
                                    whitespace-nowrap
                                    text-xs
                                    text-text-muted
                                  "
                                >
                                  {course.creditHours} credits
                                </span>

                              )}

                            </div>
                          )
                        )}

                      </div>

                    </section>

                  )
                )}


                {generatedSchedule.warnings.length > 0 && (

                  <section
                    className="
                      rounded-lg
                      border
                      border-border-hover
                      bg-bg-warm
                      p-4
                    "
                  >

                    <h3 className="text-sm font-semibold">
                      Advising Notes
                    </h3>


                    <ul
                      className="
                        mt-2
                        list-disc
                        space-y-1
                        pl-5
                        text-sm
                      "
                    >

                      {generatedSchedule.warnings.map(
                        (warning, index) => (

                          <li key={index}>
                            {warning}
                          </li>

                        )
                      )}

                    </ul>

                  </section>

                )}

              </div>
            )}
            </div>
          </section>
        )}

        {showFiles && user && <AdvisingDocumentsViewer user={user} />}
      </main>

      {/* Students without documents get a short tour of the prompt; the main tour plays once their results are ready. */}
      {showPermissionModal && <PageTutorial id="advising-setup" steps={advisingSetupSteps} />}

      <AdvisingPermissionModal
        isOpen={showPermissionModal}
        onAccept={handleAcceptUpload}
        onDecline={handleDeclineUpload}
      />

      {showUploadModal && user && (
        <AdvisingUploadModal
          userId={user.uid}
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploaded={async () => {
            setShowUploadModal(false);
            setUploadSuccess(true);
            setGeneratedSchedule(null); // built from the documents just replaced
            setErrorMessage("");
            const success = await extractDocuments();
            if (success) {
              setDocumentsReady(true);
              setResultsKey((key) => key + 1);
            }
          }}
        />
      )}
    </div>
  );
}
