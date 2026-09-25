"use client";

import { useState, useEffect, useRef } from "react";
import AdvisingPermissionModal from "@/src/components/advising/AdvisingPermissionModal";
import AdvisingUploadModal from "@/src/components/advising/AdvisingUploadModal";
import ExistingDocumentsModal from "@/src/components/advising/ExistingDocumentsModal";
import TransferCreditForm from "@/src/components/advising/TransferCreditForm";
import { useAuth } from "@/src/context/AuthContext";
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
  lastError: string | null;
  // extraction jobs
  needsManualTransferReview?: boolean;
  unreadableTransferInfo?: { rowCount: number; totalCreditHours: number } | null;
  // schedule jobs: the saved schedule, once complete
  schedule?: GeneratedSchedule | null;
};

const isRunning = (status: JobStatus) => status === "queued" || status === "processing";

const JOB_POLL_INTERVAL_MS = 4000;
const MAX_JOB_POLL_MS = 20 * 60 * 1000;


export default function AdvisingPage() {
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [showExistingModal, setShowExistingModal] = useState<boolean>(false);
  const [isCheckingDocuments, setIsCheckingDocuments] = useState<boolean>(true);
  const [usingExistingDocuments, setUsingExistingDocuments] = useState<boolean>(false);
  const { user, loading } = useAuth();
  const [documentsReady, setDocumentsReady] = useState<boolean>(false);
  const [generatedSchedule, setGeneratedSchedule,] = useState<GeneratedSchedule | null>(null);
  const [isGeneratingSchedule, setIsGeneratingSchedule,] = useState<boolean>(false);
  const [transferReviewInfo, setTransferReviewInfo] = useState<{rowCount: number; totalCreditHours: number;} | null>(null);
  const [showManualCourseForm, setShowManualCourseForm] = useState<boolean>(false);
  const [scheduleNeedsRegeneration, setScheduleNeedsRegeneration] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);

  // Upload/generate jobs run on the server, so leaving this page doesn't stop
  // them - a popup (NotificationToast) reports the result wherever the
  // student is. This only stops this page's status polling once it's gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
  async function waitForJob(url: string, fallbackError: string) {
    const deadline = Date.now() + MAX_JOB_POLL_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
      if (!mountedRef.current) return null;

      const data = await fetchJobStatus(url);
      if (data.status === "complete") return data;
      if (data.status === "failed") throw new Error(data.lastError ?? fallbackError);
      if (!isRunning(data.status)) {
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

        if (isRunning(extractionJob.status)) {
          setIsCheckingDocuments(false);
          resumeExtraction();
          return;
        }

        if (scheduleJob.status === "complete" && scheduleJob.schedule) {
          setGeneratedSchedule(scheduleJob.schedule);
        }

        if (isRunning(scheduleJob.status)) {
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

        if (data.hasDocuments) {
            setShowExistingModal(true);
            setShowPermissionModal(false);
        } else {
            setShowPermissionModal(true);
            setShowExistingModal(false);
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
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5f1] dark:bg-[#171717]">
        <p className="text-gray-600 dark:text-gray-300">
          Loading...
        </p>
      </div>
    );
  }

  if (documentsReady) {
  return (
    <main
      className="min-h-screen bg-[#f7f5f1] text-[#1f2933] dark:bg-[#171717] dark:text-gray-100 px-6 py-12" >
      <PageTutorial id="advising_new" steps={advisingNewSteps} />
      <div className="mx-auto w-full max-w-4xl py-8">

        {/* Welcome Section */}
        <section
          className="rounded-2xl border border-[#d8d3ca] bg-white p-8 shadow-sm
          dark:border-gray-700 dark:bg-[#202020]"
          data-tutorial="advising-new-welcome" >
          <h1 className="text-3xl font-semibold">
            Welcome to Advising
          </h1>

          <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Catalyst's advising feature helps you understand your academic progress and plan
            the courses you may need to take next.
          </p>

          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Using your transcript and curriculum sheet, Catalyst can review the courses you
            have already taken and the courses that remain in your degree requirements to
            create a suggested schedule for your remaining time at the university.
          </p>

          <button
            type="button"
            onClick={generateSchedule}
            disabled={isGeneratingSchedule}
            data-tutorial="advising-new-generate"
            className="mt-8 rounded-lg bg-[#b08957] px-6 py-3 text-sm font-medium
            text-white transition hover:bg-[#9c7849] disabled:cursor-not-allowed
            disabled:opacity-60" >

            {isGeneratingSchedule ? "Generating Schedule..." : "Generate Schedule"}

          </button>

               {isGeneratingSchedule && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                    This can take a minute. Feel free to leave this page — you'll get a notification when your schedule is ready.
                  </p>
                )}

               {errorMessage && !isGeneratingSchedule && (
                  <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700
                  dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    {errorMessage}
                  </div>
                )}

               {scheduleNeedsRegeneration && (
                  <p className="mt-3 text-sm text-amber-700">
                    Your courses were updated. Click <strong>Generate Schedule</strong> again to see the changes reflected.
                  </p>
                )}
        </section>

        {(transferReviewInfo || showManualCourseForm) && (
          <section className="mt-8">
            <TransferCreditForm
              expectedRowCount={transferReviewInfo?.rowCount}
              expectedTotalCreditHours={transferReviewInfo?.totalCreditHours}
              heading={transferReviewInfo ? undefined : "Add a completed course"}
              description={
                transferReviewInfo ? undefined : "Add a course you've already completed elsewhere — transfer credit, AP credit, or anything not reflected above — so it counts toward your remaining requirements."
              }
              dismissLabel={transferReviewInfo ? "Skip for now" : "Close"}
              onSaved={() => {
                setTransferReviewInfo(null);
                setShowManualCourseForm(false);
                setScheduleNeedsRegeneration(true);
              }}
              onDismiss={() => {
                setTransferReviewInfo(null);
                setShowManualCourseForm(false);
              }}
            />
          </section>
        )}

        {!transferReviewInfo && !showManualCourseForm && (
          <section className="mt-8">
            <button
              type="button"
              onClick={() => setShowManualCourseForm(true)}
              className="text-sm font-medium text-[#b08957] hover:underline"
            >
              + Add a completed course
            </button>
          </section>
        )}

        {/* Previous Schedule Section */}
        <section 
          className="mt-8 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light">
          <div className="flex items-center justify-between gap-4">

            <div>
              <h2 className="text-xl font-semibold">
                Generate Schedule
              </h2>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your suggested schedule will appear below after generation.
              </p>
            </div>
          </div>

            {/* Schedule preview area */}
          <div
            className="
              min-h-[320px]
              rounded-lg
              border
              border-border-light
              bg-bg-main
              p-5
            "
            data-tutorial="advising-new-preview"
          >

            {!generatedSchedule && (
              <p className="text-sm text-text-muted">
                Your generated schedule will appear here.
              </p>
            )}


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
                        border-[#d8d3ca]
                        bg-white
                        p-5
                        dark:border-gray-700
                        dark:bg-[#202020]
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
                                border-[#ece8e1]
                                px-4
                                py-3
                                dark:border-gray-700
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
                                      text-gray-500
                                      dark:text-gray-400
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
                                    text-gray-500
                                    dark:text-gray-400
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
                      border-yellow-300
                      bg-yellow-50
                      p-4
                      dark:border-yellow-700
                      dark:bg-yellow-950/20
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
      </div>
    </main>
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
      const statusData = await waitForJob("/api/advising/extract", "The documents could not be read.");
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
      if (mountedRef.current) setIsExtracting(false);
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
      const statusData = await waitForJob("/api/advising/generate", "The schedule could not be generated.");
      if (!statusData) return; // left the page - the popup takes it from here

      setGeneratedSchedule(statusData.schedule ?? null);
      setScheduleNeedsRegeneration(false);
    } finally {
      if (mountedRef.current) setIsGeneratingSchedule(false);
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

  return (
    <div
      className="min-h-screen bg-[#f7f5f1] text-[#1f2933] dark:bg-[#171717] dark:text-gray-100" >

      <header
        className="relative flex h-[73px] items-center justify-center border-b 
        border-[#d8d3ca] bg-[#fbfaf8] px-6 dark:border-gray-700 dark:bg-[#202020]" >

        <h1 className="text-lg font-semibold"> Advising. </h1>

      </header>

      <main className="mx-auto w-3/4 py-8">
      
        {errorMessage && (
          <div
            className="
              w-full max-w-full overflow-hidden break-words whitespace-pre-wrap
              rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700
              dark:border-red-800 dark:bg-red-950/30 dark:text-red-300" >
            {errorMessage}
          </div>
        )}

        {uploadSuccess && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3
            text-sm text-green-700">
                Your transcript and curriculum sheet were uploaded successfully!
            </div>
            )}

        {isExtracting && (
            <div className="mt-4 rounded-lg border border-[#d8d3ca] bg-white px-4 py-3
            text-sm text-gray-600 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-300">
                Reading your transcript and curriculum sheet — this can take a few minutes.
                Feel free to leave this page; you'll get a notification when it's done.
            </div>
            )}

        {usingExistingDocuments && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 
            text-sm text-green-700">
                Your previously uploaded transcript and curriculum sheet
                will be used.
            </div>
            )}            
      </main>

      {/* Students without documents only ever see this prompt, so they get
          their own short tour of it; the main advising_new tour plays once
          their documents are ready. Mounted only while the prompt is open,
          so returning students never get a tour waiting on absent targets. */}
      {showPermissionModal && <PageTutorial id="advising-setup" steps={advisingSetupSteps} />}

      <AdvisingPermissionModal
        isOpen={showPermissionModal}
        onAccept={handleAcceptUpload}
        onDecline={handleDeclineUpload}
        onClose={() => setShowPermissionModal(false)}
      />

     <ExistingDocumentsModal
        isOpen={showExistingModal}
        onUseExisting={async () => {
          setShowExistingModal(false);
          setUsingExistingDocuments(true);
          setUploadSuccess(false);
          setErrorMessage("");
          setDocumentsReady(true);
        }}
        onReplace={() => {
            setShowExistingModal(false);
            setGeneratedSchedule(null); // was built from the documents being replaced
            setShowUploadModal(true);
            setUploadSuccess(false);
            setUsingExistingDocuments(false);
            setErrorMessage("");
        }}
        onClose={() => setShowExistingModal(false)}
        />

        {showUploadModal && user && (
        <AdvisingUploadModal
            userId={user.uid}
            isOpen={showUploadModal}
            onClose={() => setShowUploadModal(false)}
            onUploaded={async () => {
              setShowUploadModal(false);
              setUploadSuccess(true);
              setGeneratedSchedule(null);
              setUsingExistingDocuments(false);
              setErrorMessage("");
              const success = await extractDocuments();
              if (success) { setDocumentsReady(true); }
            }}
        />
      )}
    </div>
  );
}