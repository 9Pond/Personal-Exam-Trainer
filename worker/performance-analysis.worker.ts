/**
 * Performance Analysis Worker
 * รันคู่กับ ocr-extract.worker.ts (คนละ process หรือรวมกันก็ได้ตอน dev)
 *
 * วิธีรัน (dev): npx tsx worker/performance-analysis.worker.ts
 */

import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/lib/queue/connection";
import { QUEUE_NAMES, type PerformanceAnalysisJobData } from "../src/lib/queue/queues";
import { prisma } from "../src/lib/prisma";
import { runPerformanceAnalysis } from "../src/lib/ai/gateway";

async function analyzeAttempt(attemptId: string) {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      answers: { include: { question: { include: { topic: true } } } },
      quiz: { select: { title: true } },
    },
  });

  // จัดกลุ่มคำตอบตาม Topic เพื่อคำนวณ % ก่อนส่งเข้า AI (ไม่ส่ง raw text)
  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const ans of attempt.answers) {
    const topicName = ans.question.topic?.name ?? "ไม่ระบุหมวดหมู่";
    const stat = byTopic.get(topicName) ?? { correct: 0, total: 0 };
    stat.total += 1;
    if (ans.isCorrect) stat.correct += 1;
    byTopic.set(topicName, stat);
  }

  const topics = Array.from(byTopic.entries()).map(([name, s]) => ({
    name,
    correct: s.correct,
    total: s.total,
    percentage: Math.round((s.correct / s.total) * 100),
  }));

  const analysis = await runPerformanceAnalysis({
    subject: attempt.quiz.title,
    topics,
    userId: attempt.userId,
  });

  await prisma.attemptAnalysis.upsert({
    where: { attemptId },
    update: {
      overallSummary: analysis.overall_summary,
      weakTopics: analysis.weak_topics,
      strongTopics: analysis.strong_topics,
      recommendation: analysis.recommendation,
    },
    create: {
      attemptId,
      overallSummary: analysis.overall_summary,
      weakTopics: analysis.weak_topics,
      strongTopics: analysis.strong_topics,
      recommendation: analysis.recommendation,
    },
  });

  // อัปเดต Dashboard aggregate stat แบบง่าย (average score, streak คำนวณเพิ่มได้ทีหลัง)
  await updateDashboardStat(attempt.userId, attempt.score ?? 0);
}

async function updateDashboardStat(userId: string, latestScore: number) {
  const existing = await prisma.dashboardStat.findUnique({ where: { userId } });
  const today = new Date();
  const isConsecutiveDay =
    existing?.lastActiveDate &&
    Math.floor((today.getTime() - existing.lastActiveDate.getTime()) / 86_400_000) === 1;

  const newStreak = isConsecutiveDay ? (existing?.currentStreak ?? 0) + 1 : 1;

  await prisma.dashboardStat.upsert({
    where: { userId },
    update: {
      totalQuizzesTaken: { increment: 1 },
      averageScore: existing
        ? (existing.averageScore * existing.totalQuizzesTaken + latestScore) /
          (existing.totalQuizzesTaken + 1)
        : latestScore,
      currentStreak: newStreak,
      longestStreak: Math.max(existing?.longestStreak ?? 0, newStreak),
      lastActiveDate: today,
    },
    create: {
      userId,
      totalQuizzesTaken: 1,
      averageScore: latestScore,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: today,
    },
  });
}

const worker = new Worker<PerformanceAnalysisJobData>(
  QUEUE_NAMES.PERFORMANCE_ANALYSIS,
  async (job: Job<PerformanceAnalysisJobData>) => {
    console.log(`[worker] analyzing attempt ${job.data.attemptId}`);
    await analyzeAttempt(job.data.attemptId);
  },
  { connection: redisConnection, concurrency: 5 }
);

worker.on("completed", (job) => console.log(`[worker] analysis done: ${job.id}`));
worker.on("failed", (job, err) => console.error(`[worker] analysis failed: ${job?.id}`, err));

console.log("Performance Analysis worker started, waiting for jobs...");
