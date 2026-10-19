import { NextRequest, NextResponse } from "next/server";
import { modelDisplayName } from "@/src/library/modelDisplayName";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { enterAiUser } from "@/src/library/ai/usageScope";
import { fallbackModels, isCloudBackend, modelForFeature, speedOverride } from "@/src/library/ai/cloudModels";

// Which models answer for the signed-in student, for the Settings page. Read
// from the same configuration the AI routes use, so it can't drift. With
// cloud AI the list depends on the account (developers stay on Ollama).
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (auth) enterAiUser(auth.uid);

  if (!isCloudBackend()) {
    return NextResponse.json({
      cloud: false,
      main: modelDisplayName(process.env.OLLAMA_MODEL_MAIN),
      ocr: modelDisplayName(process.env.OLLAMA_MODEL_OCR),
      rows: [
        { label: "Chat, quizzes, flashcards, advising", model: modelDisplayName(process.env.OLLAMA_MODEL_MAIN) },
        { label: "Document scanning (OCR)", model: modelDisplayName(process.env.OLLAMA_MODEL_OCR) },
      ],
    });
  }

  const name = (m: string | undefined) => modelDisplayName(m) ?? "—";
  const chat = modelForFeature("chat");
  return NextResponse.json({
    cloud: true,
    main: name(chat),
    ocr: name(modelForFeature("ocr")),
    rows: [
      { label: "Chat and advising: Balanced", model: name(chat) },
      { label: "Chat: Fast", model: name(speedOverride("chat", "fast").model ?? chat) },
      { label: "Chat: Thorough", model: name(speedOverride("chat", "thorough").model ?? chat) },
      { label: "Quizzes, flashcards, practice", model: name(modelForFeature("quiz-generation")) },
      { label: "Document scanning (OCR)", model: name(modelForFeature("ocr")) },
      { label: "Backups if a provider is down", model: fallbackModels(chat).map((m) => name(m)).join(", then ") || "—" },
    ],
  });
}
