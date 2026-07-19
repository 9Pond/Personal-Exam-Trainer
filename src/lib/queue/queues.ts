import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";

export const QUEUE_NAMES = {
  OCR_AND_EXTRACT: "ocr-and-extract",
  PERFORMANCE_ANALYSIS: "performance-analysis",
  EMBEDDING_GENERATION: "embedding-generation",
} as const;

export type OcrAndExtractJobData = {
  examId: string;
};

export type PerformanceAnalysisJobData = {
  attemptId: string;
};

export const ocrAndExtractQueue = new Queue<OcrAndExtractJobData>(
  QUEUE_NAMES.OCR_AND_EXTRACT,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2, // retry ระดับ job (แยกจาก retry ระดับ AI call ใน gateway)
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 3600 }, // เก็บ log 1 ชม. แล้วลบ กัน Redis บวม
      removeOnFail: { age: 86400 },
    },
  }
);

export const performanceAnalysisQueue = new Queue<PerformanceAnalysisJobData>(
  QUEUE_NAMES.PERFORMANCE_ANALYSIS,
  { connection: redisConnection }
);
