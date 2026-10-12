"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CustomSetForm from "@/src/components/custom/CustomSetForm";
import { CUSTOM_TYPES, type CustomType } from "@/src/library/custom/customRequest";

function NewCustomSet() {
  const requested = useSearchParams().get("type");
  const type = CUSTOM_TYPES.includes(requested as CustomType) ? (requested as CustomType) : "quiz";
  // Keyed so a link with a different ?type= starts the form fresh.
  return <CustomSetForm key={type} initialType={type} />;
}

export default function NewCustomSetPage() {
  return (
    <Suspense fallback={null}>
      <NewCustomSet />
    </Suspense>
  );
}
