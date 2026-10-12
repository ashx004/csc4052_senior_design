"use client";

import { use } from "react";
import CustomSetPlayer from "@/src/components/custom/CustomSetPlayer";

export default function CustomSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params);
  return <CustomSetPlayer setId={setId} />;
}
