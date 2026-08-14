"use client";

import { useState, useEffect } from "react";
import AdvisingPermissionModal from "@/src/components/advising/AdvisingPermissionModal";
import AdvisingUploadModal from "@/src/components/advising/AdvisingUploadModal";
import ExistingDocumentsModal from "@/src/components/advising/ExistingDocumentsModal";
import { useAuth } from "@/src/context/AuthContext";


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

  useEffect(() => {
  if (loading || !user) {
    return;
  }

  async function checkExistingDocuments() {
        try {
        setIsCheckingDocuments(true);
        setErrorMessage("");

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
      <div className="mx-auto w-full max-w-4xl py-8">

        {/* Welcome Section */}
        <section
          className="rounded-2xl border border-[#d8d3ca] bg-white p-8 shadow-sm 
          dark:border-gray-700 dark:bg-[#202020]" >
          <h1 className="text-3xl font-semibold">
            Welcome to Advising
          </h1>

          <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Studora's advising feature helps you understand your academic progress and plan
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
            className="mt-8 rounded-lg bg-[#b08957] px-6 py-3 text-sm font-medium
            text-white transition hover:bg-[#9c7849] disabled:cursor-not-allowed
            disabled:opacity-60" >

            {isGeneratingSchedule ? "Generating Schedule..." : "Generate Schedule"}

          </button>
        </section>

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
          >

            {!generatedSchedule && (
              <p className="text-sm text-text-muted">
                Your generated schedule will appear here.
              </p>
            )}


            {generatedSchedule && (
              <div className="space-y-6">

                {generatedSchedule.terms.map(
                  (term) => (

                    <section
                      key={`${term.term}-${term.year}`}
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

    console.log("Transcript:", data.transcript);
    console.log("Curriculum:", data.curriculum);

    return true;


  } catch (error) {

    setErrorMessage(
      error instanceof Error
        ? error.message
        : "The documents could not be read."
    );

    return false;
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

      setGeneratedSchedule(data.schedule);

      console.log("Generated Schedule:", data.schedule);


    } catch (error) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The schedule could not be generated."
      );

    } finally {

      setIsGeneratingSchedule(false);
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

        {usingExistingDocuments && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 
            text-sm text-green-700">
                Your previously uploaded transcript and curriculum sheet
                will be used.
            </div>
            )}            
      </main>

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