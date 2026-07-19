import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { callOpenAI, callAnthropic, callGemini, ocrWithMistral, ocrWithGeminiVision, type LlmResult } from "@/lib/ai/providers";
import {
  EXTRACTION_WITH_ANSWER_KEY_SYSTEM_PROMPT,
  EXTRACTION_WITHOUT_ANSWER_KEY_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  PERFORMANCE_ANALYSIS_SYSTEM_PROMPT,
  buildPerformanceAnalysisUserPrompt,
} from "@/lib/ai/prompts";
import {
  ExtractionWithAnswerKeyResponseSchema,
  ExtractionWithoutAnswerKeyResponseSchema,
  PerformanceAnalysisResponseSchema,
  type QuestionWithAnswerKey,
  type QuestionWithoutAnswerKey,
} from "@/lib/ai/schemas";

// ราคาโดยประมาณต่อ 1M token (สำหรับ log/monitor เท่านั้น ไม่ใช่ billing จริง)
const PRICE_PER_M_TOKEN: Record<string, { in: number; out: number }> = {
  "gpt-5": { in: 5, out: 15 },
  claude: { in: 3, out: 15 },
  gemini: { in: 1.25, out: 5 },
};

/**
 * เรียก LLM พร้อม fallback chain: GPT-5 -> Claude -> Gemini
 * validate ผลลัพธ์ด้วย zod schema ก่อนคืนค่า, retry 1 ครั้งต่อ provider
 * ถ้า JSON parse/validate ไม่ผ่าน ก่อนจะข้ามไป provider ถัดไป
 */
async function callWithFallback<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  jobType: string;
  userId?: string;
}): Promise<T> {
  const providers: { name: string; call: (s: string, u: string) => Promise<LlmResult> }[] = [
    { name: "gpt-5", call: callOpenAI },
    { name: "claude", call: callAnthropic },
    { name: "gemini", call: callGemini },
  ];

  let lastError: unknown;

  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt =
          attempt === 0
            ? params.userPrompt
            : `${params.userPrompt}\n\n(คำเตือน: ครั้งก่อนตอบ JSON ผิดรูปแบบ กรุณาตอบให้ตรง schema เป๊ะๆ)`;

        const result = await provider.call(params.systemPrompt, prompt);
        const parsed = JSON.parse(result.text);
        const validated = params.schema.parse(parsed);

        await logAiUsage({
          jobType: params.jobType,
          provider: provider.name,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          userId: params.userId,
        });

        return validated;
      } catch (err) {
        lastError = err;
        // ลอง attempt ถัดไปของ provider เดิมก่อน ค่อยข้ามไป provider ถัดไป
      }
    }
  }

  throw new Error(
    `AI Gateway: ทุก provider ล้มเหลวสำหรับ jobType=${params.jobType}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function logAiUsage(params: {
  jobType: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string;
}) {
  const price = PRICE_PER_M_TOKEN[params.provider] ?? { in: 0, out: 0 };
  const costUsd =
    (params.inputTokens / 1_000_000) * price.in + (params.outputTokens / 1_000_000) * price.out;

  await prisma.aiUsageLog.create({
    data: {
      userId: params.userId,
      jobType: params.jobType,
      provider: params.provider,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd,
      status: "DONE",
    },
  });
}

/** Extraction: กรณีมีเฉลยต้นฉบับ */
export async function extractQuestionsWithAnswerKey(params: {
  ocrText: string;
  answerKeyText?: string;
  userId?: string;
}): Promise<QuestionWithAnswerKey[]> {
  const result = await callWithFallback({
    systemPrompt: EXTRACTION_WITH_ANSWER_KEY_SYSTEM_PROMPT,
    userPrompt: buildExtractionUserPrompt(params),
    schema: ExtractionWithAnswerKeyResponseSchema,
    jobType: "extraction-with-answer-key",
    userId: params.userId,
  });

  return result.questions;
}

/** Extraction: กรณีไม่มีเฉลย — ต้องมี confidence ต่อข้อ */
export async function extractQuestionsWithoutAnswerKey(params: {
  ocrText: string;
  userId?: string;
}): Promise<QuestionWithoutAnswerKey[]> {
  const result = await callWithFallback({
    systemPrompt: EXTRACTION_WITHOUT_ANSWER_KEY_SYSTEM_PROMPT,
    userPrompt: buildExtractionUserPrompt(params),
    schema: ExtractionWithoutAnswerKeyResponseSchema,
    jobType: "extraction-without-answer-key",
    userId: params.userId,
  });

  return result.questions;
}

/**
 * OCR: Mistral OCR ก่อน (คุณภาพดีสำหรับ PDF/ตาราง/สูตร) — ถ้า fail
 * fallback ไป Gemini Vision โดยอัตโนมัติ
 * คืนค่าเป็น array ของข้อความต่อหน้า (สำหรับ PDF หลายหน้า)
 */
export async function runOcr(params: {
  fileBuffer: Buffer;
  mimeType: string;
  userId?: string;
}): Promise<string[]> {
  try {
    const result = await ocrWithMistral(params.fileBuffer, params.mimeType);
    await logAiUsage({
      jobType: "ocr",
      provider: "mistral-ocr",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId: params.userId,
    });
    if (result.pages.length > 0) return result.pages;
    throw new Error("Mistral OCR คืนค่าว่าง");
  } catch {
    // Fallback ไป Gemini Vision (ประมวลผลทีละไฟล์ ไม่แยกหน้าอัตโนมัติ
    // เหมาะกับรูปภาพเดี่ยวมากกว่า PDF หลายหน้า)
    const result = await ocrWithGeminiVision(params.fileBuffer, params.mimeType);
    await logAiUsage({
      jobType: "ocr",
      provider: "gemini",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId: params.userId,
    });
    return [result.text];
  }
}

/** Performance Analysis: ส่งเฉพาะตัวเลข % สรุปแล้ว ไม่ส่ง raw question text เพื่อประหยัด token */
export async function runPerformanceAnalysis(params: {
  subject: string;
  topics: { name: string; percentage: number; correct: number; total: number }[];
  userId?: string;
}) {
  return callWithFallback({
    systemPrompt: PERFORMANCE_ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildPerformanceAnalysisUserPrompt(params),
    schema: PerformanceAnalysisResponseSchema,
    jobType: "performance-analysis",
    userId: params.userId,
  });
}
