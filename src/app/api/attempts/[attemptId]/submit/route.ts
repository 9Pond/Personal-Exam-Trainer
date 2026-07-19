import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { nextReviewDate, isFullyResolved } from "@/lib/spaced-repetition";
import { performanceAnalysisQueue } from "@/lib/queue/queues";

const SubmitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedLabel: z.enum(["A", "B", "C", "D"]).nullable(), // null = ข้ามข้อนี้
    })
  ),
});

export async function POST(
  request: Request,
  { params }: { params: { attemptId: string } }
) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const attempt = await prisma.attempt.findUnique({ where: { id: params.attemptId } });

  if (!attempt || attempt.userId !== authUser.id) {
    return NextResponse.json({ error: "ไม่พบ Attempt นี้" }, { status: 404 });
  }
  if (attempt.finishedAt) {
    return NextResponse.json({ error: "Attempt นี้ถูกส่งคำตอบไปแล้ว" }, { status: 400 });
  }

  const { answers } = SubmitSchema.parse(await request.json());

  // ดึงเฉลย + explanation ของทุกข้อที่เกี่ยวข้องในครั้งเดียว (ไม่เรียก AI)
  const questions = await prisma.question.findMany({
    where: { id: { in: answers.map((a) => a.questionId) } },
    include: { answer: true, explanation: true, topic: true },
  });
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let correctCount = 0;
  const results: {
    questionId: string;
    isCorrect: boolean;
    correctLabel: string;
    reasoning: string;
    concept: string;
  }[] = [];

  for (const ans of answers) {
    const question = questionMap.get(ans.questionId);
    if (!question || !question.answer) continue;

    const isCorrect = ans.selectedLabel === question.answer.correctLabel;
    if (isCorrect) correctCount++;

    await prisma.attemptAnswer.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        selectedLabel: ans.selectedLabel ?? undefined,
        isCorrect,
      },
    });

    await updateWrongQuestionTracking(attempt.userId, question.id, isCorrect);

    results.push({
      questionId: question.id,
      isCorrect,
      correctLabel: question.answer.correctLabel,
      reasoning: question.explanation?.reasoning ?? "",
      concept: question.explanation?.concept ?? "",
    });
  }

  const score = (correctCount / answers.length) * 100;

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { correctCount, score, finishedAt: new Date() },
  });

  // วิเคราะห์ภาพรวม (async, ไม่ block response) — ใช้เฉพาะตอนจบ Quiz ทั้งชุด
  await performanceAnalysisQueue.add("analyze", { attemptId: attempt.id });

  return NextResponse.json({
    score,
    correctCount,
    totalCount: answers.length,
    results,
  });
}

/**
 * อัปเดต WrongQuestion:
 * - ตอบผิด → เพิ่ม wrongCount, รีเซ็ต reviewStage กลับ 0, ตั้ง nextReviewAt = +1 วัน
 * - ตอบถูก (และเคยผิดมาก่อน) → เลื่อน reviewStage ถัดไป, ถ้าครบทุก stage → resolved
 */
async function updateWrongQuestionTracking(userId: string, questionId: string, isCorrect: boolean) {
  const existing = await prisma.wrongQuestion.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (!isCorrect) {
    if (existing) {
      await prisma.wrongQuestion.update({
        where: { id: existing.id },
        data: {
          wrongCount: { increment: 1 },
          reviewStage: 0,
          nextReviewAt: nextReviewDate(0),
          lastReviewedAt: new Date(),
          resolved: false,
        },
      });
    } else {
      await prisma.wrongQuestion.create({
        data: {
          userId,
          questionId,
          wrongCount: 1,
          reviewStage: 0,
          nextReviewAt: nextReviewDate(0),
        },
      });
    }
    return;
  }

  // ตอบถูก — ถ้าไม่เคยผิดมาก่อน ไม่ต้องทำอะไร (ไม่เคยเข้า spaced repetition)
  if (!existing || existing.resolved) return;

  const newStage = existing.reviewStage + 1;
  await prisma.wrongQuestion.update({
    where: { id: existing.id },
    data: {
      reviewStage: newStage,
      nextReviewAt: nextReviewDate(newStage),
      lastReviewedAt: new Date(),
      resolved: isFullyResolved(newStage),
    },
  });
}
