import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(
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

  const attempt = await prisma.attempt.findUnique({
    where: { id: params.attemptId },
    include: {
      quiz: { select: { title: true } },
      analysis: true,
      answers: {
        include: {
          question: {
            select: {
              content: true,
              answer: { select: { correctLabel: true } },
              explanation: { select: { reasoning: true, concept: true } },
              choices: { orderBy: { order: "asc" }, select: { label: true, content: true } },
            },
          },
        },
      },
    },
  });

  if (!attempt || attempt.userId !== authUser.id) {
    return NextResponse.json({ error: "ไม่พบ Attempt นี้" }, { status: 404 });
  }

  return NextResponse.json({
    quizTitle: attempt.quiz.title,
    score: attempt.score,
    correctCount: attempt.correctCount,
    totalCount: attempt.totalCount,
    finishedAt: attempt.finishedAt,
    analysis: attempt.analysis, // null ถ้ายังประมวลผลไม่เสร็จ (async job)
    answers: attempt.answers.map((a) => ({
      content: a.question.content,
      choices: a.question.choices,
      selectedLabel: a.selectedLabel,
      correctLabel: a.question.answer?.correctLabel,
      isCorrect: a.isCorrect,
      reasoning: a.question.explanation?.reasoning,
      concept: a.question.explanation?.concept,
    })),
  });
}
