/**
 * OCR + Extraction Worker
 *
 * รันแยกจาก Next.js app เป็น process ต่างหาก เพราะงานนี้ใช้เวลานาน
 * (OCR + LLM call หลายครั้ง) ไม่เหมาะกับ serverless function ที่มี
 * time limit สั้น
 *
 * วิธีรัน (dev):   npx tsx worker/ocr-extract.worker.ts
 * วิธีรัน (prod):  ควร build เป็น Docker image แยก แล้วรันเป็น
 *                  long-running container/service (ดู README สำหรับ deploy)
 */

import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/lib/queue/connection";
import { QUEUE_NAMES, type OcrAndExtractJobData } from "../src/lib/queue/queues";
import { prisma } from "../src/lib/prisma";
import { runOcr, extractQuestionsWithAnswerKey, extractQuestionsWithoutAnswerKey } from "../src/lib/ai/gateway";
import type { QuestionWithAnswerKey, QuestionWithoutAnswerKey } from "../src/lib/ai/schemas";

async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** สร้าง ExamPage records ให้ PDF หลังรู้ผล OCR ว่ามีกี่หน้า (ครั้งแรกเท่านั้น) */
async function ensurePagesForPdf(examId: string, sourceFileUrl: string) {
  const existingPages = await prisma.examPage.count({ where: { examId } });
  if (existingPages > 0) return; // เคยสร้างแล้ว (retry job) ไม่ต้องสร้างซ้ำ

  const buffer = await downloadFile(sourceFileUrl);
  const pageTexts = await runOcr({ fileBuffer: buffer, mimeType: "application/pdf" });

  for (let i = 0; i < pageTexts.length; i++) {
    const page = await prisma.examPage.create({
      data: {
        examId,
        pageNumber: i + 1,
        fileUrl: sourceFileUrl,
        status: "OCR_DONE",
      },
    });

    await prisma.ocrText.create({
      data: {
        examPageId: page.id,
        rawText: pageTexts[i],
        ocrProvider: "mistral-ocr",
      },
    });
  }
}

/** OCR รูปภาพทีละหน้า (กรณีอัปโหลดเป็นรูปภาพหลายรูป ไม่ใช่ PDF) */
async function ocrImagePage(examPageId: string, fileUrl: string, mimeType: string) {
  const existing = await prisma.ocrText.findUnique({ where: { examPageId } });
  if (existing) return; // OCR แล้ว ห้ามทำซ้ำ (idempotency)

  const buffer = await downloadFile(fileUrl);
  const [text] = await runOcr({ fileBuffer: buffer, mimeType });

  await prisma.ocrText.create({
    data: { examPageId, rawText: text, ocrProvider: "mistral-ocr" },
  });

  await prisma.examPage.update({ where: { id: examPageId }, data: { status: "OCR_DONE" } });
}

async function findOrCreateTopic(name: string, subject?: string | null) {
  return prisma.topic.upsert({
    where: { name },
    update: {},
    create: { name, subject: subject ?? undefined },
  });
}

/** บันทึกผล extraction ของหนึ่งหน้าลง DB ทั้งหมด (Question/Choice/Answer/Explanation) */
async function saveExtractedQuestions(
  examId: string,
  subject: string | null,
  questions: (QuestionWithAnswerKey | QuestionWithoutAnswerKey)[]
) {
  for (const q of questions) {
    const topic = await findOrCreateTopic(q.topic, subject);
    const confidence = "confidence" in q ? q.confidence : null;

    await prisma.question.create({
      data: {
        examId,
        topicId: topic.id,
        content: q.content,
        difficulty: q.difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD",
        confidence: confidence ?? undefined,
        needsReview: confidence !== null && confidence < 0.7,
        hasOriginalAnswerKey: confidence === null,
        choices: {
          create: q.choices.map((c) => ({
            label: c.label,
            content: c.content,
            order: ["A", "B", "C", "D"].indexOf(c.label),
          })),
        },
        answer: { create: { correctLabel: q.correct_label } },
        explanation: {
          create: { reasoning: q.explanation.reasoning, concept: q.explanation.concept },
        },
      },
    });
  }
}

async function processExam(examId: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });

  // ขั้นที่ 1: OCR — สร้างหน้าให้ PDF หรือ OCR รูปภาพที่ยังไม่ได้ทำ
  if (exam.sourceMimeType === "application/pdf" && exam.sourceFileUrl) {
    await ensurePagesForPdf(examId, exam.sourceFileUrl);
  } else {
    const pages = await prisma.examPage.findMany({ where: { examId, status: "PENDING" } });
    for (const page of pages) {
      try {
        await ocrImagePage(page.id, page.fileUrl, guessMimeFromUrl(page.fileUrl));
      } catch (err) {
        await prisma.examPage.update({ where: { id: page.id }, data: { status: "FAILED" } });
        console.error(`OCR failed for page ${page.id}:`, err);
      }
    }
  }

  // ขั้นที่ 2: Extraction — เฉพาะหน้าที่ OCR สำเร็จแล้วและยังไม่ extract
  const pagesToExtract = await prisma.examPage.findMany({
    where: { examId, status: "OCR_DONE" },
    include: { ocrText: true },
  });

  let anySucceeded = false;
  let anyFailed = false;

  for (const page of pagesToExtract) {
    if (!page.ocrText) continue;
    try {
      const questions = exam.hasAnswerKey
        ? await extractQuestionsWithAnswerKey({ ocrText: page.ocrText.rawText, userId: exam.userId })
        : await extractQuestionsWithoutAnswerKey({ ocrText: page.ocrText.rawText, userId: exam.userId });

      await saveExtractedQuestions(examId, exam.subject, questions);
      await prisma.examPage.update({ where: { id: page.id }, data: { status: "EXTRACTED" } });
      anySucceeded = true;
    } catch (err) {
      await prisma.examPage.update({ where: { id: page.id }, data: { status: "FAILED" } });
      anyFailed = true;
      console.error(`Extraction failed for page ${page.id}:`, err);
    }
  }

  const finalStatus = anyFailed ? (anySucceeded ? "PARTIAL" : "FAILED") : "READY";
  await prisma.exam.update({ where: { id: examId }, data: { status: finalStatus } });
}

function guessMimeFromUrl(url: string): string {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const worker = new Worker<OcrAndExtractJobData>(
  QUEUE_NAMES.OCR_AND_EXTRACT,
  async (job: Job<OcrAndExtractJobData>) => {
    console.log(`[worker] processing exam ${job.data.examId}`);
    await processExam(job.data.examId);
  },
  { connection: redisConnection, concurrency: 3 }
);

worker.on("completed", (job) => console.log(`[worker] done: ${job.id}`));
worker.on("failed", (job, err) => console.error(`[worker] failed: ${job?.id}`, err));

console.log("OCR + Extraction worker started, waiting for jobs...");
