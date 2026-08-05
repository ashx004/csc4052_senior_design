"use client";

import { useState, useEffect } from "react";
import AdvisingPermissionModal from "@/src/components/advising/AdvisingPermissionModal";
import AdvisingUploadModal from "@/src/components/advising/AdvisingUploadModal";
import ExistingDocumentsModal from "@/src/components/advising/ExistingDocumentsModal";
import { useAuth } from "@/src/context/AuthContext";

export default function AdvisingPage() {
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [showExistingModal, setShowExistingModal] = useState<boolean>(false);
  const [isCheckingDocuments, setIsCheckingDocuments] = useState<boolean>(true);
  const [usingExistingDocuments, setUsingExistingDocuments] = useState<boolean>(false);
  const { user, loading } = useAuth();

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

  return (
    <div
      className="min-h-screen bg-[#f7f5f1] text-[#1f2933] dark:bg-[#171717] 
      dark:text-gray-100" >

      <header
        className="relative flex h-[73px] items-center justify-center border-b 
        border-[#d8d3ca] bg-[#fbfaf8] px-6 dark:border-gray-700 dark:bg-[#202020]" >

        <h1 className="text-lg font-semibold"> Advising. </h1>

      </header>

      <main className="mx-auto w-3/4 py-8">
      
        {errorMessage && (
          <div
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3
            text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300" >
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
        onUseExisting={() => {
            setShowExistingModal(false);
            setUsingExistingDocuments(true);
            setUploadSuccess(false);
            setErrorMessage("");
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
            onUploaded={() => {
                setShowUploadModal(false);
                setUploadSuccess(true);
                setUsingExistingDocuments(false);
                setErrorMessage("");
          }}
        />
      )}
    </div>
  );
}