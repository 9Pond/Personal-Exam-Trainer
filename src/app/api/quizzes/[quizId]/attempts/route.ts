import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUser = await getOrCreateAppUser(authUser);

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.quizId },
    include: { _count: { select: { quizQuestions: true } } },
  });

  if (!quiz) {
    return NextResponse.json({ error: "ไม่พบ Quiz นี้" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const timeLimitSec = quiz.mode === "TIMED" ? body.timeLimitSec ?? 600 : null;

  const attempt = await prisma.attempt.create({
    data: {
      quizId: quiz.id,
      userId: appUser.id,
      totalCount: quiz._count.quizQuestions,
      timeLimitSec,
    },
  });

  // นับจำนวนครั้งที่ Quiz นี้ถูกทำ (สำหรับ Community: Most Solved)
  await prisma.quiz.update({ where: { id: quiz.id }, data: { solveCount: { increment: 1 } } });

  return NextResponse.json({ attemptId: attempt.id, timeLimitSec });
}
