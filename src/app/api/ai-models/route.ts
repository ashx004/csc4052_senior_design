import { NextResponse } from "next/server";
import { modelDisplayName } from "@/src/library/modelDisplayName";

// Which models this deployment actually runs, for the Settings page - read
// from the same env vars the AI routes use, so the label can't drift from
// the real configuration the way a hardcoded one did. Model names only;
// nothing sensitive, so no auth check.
export async function GET() {
  return NextResponse.json({
    main: modelDisplayName(process.env.OLLAMA_MODEL_MAIN),
    ocr: modelDisplayName(process.env.OLLAMA_MODEL_OCR),
  });
}
