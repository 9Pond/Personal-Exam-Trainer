import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const examId = searchParams.get("examId");

  if (!examId) {
    return NextResponse.json({ error: "ต้องระบุ examId" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      pages: { select: { pageNumber: true, status: true } },
      _count: { select: { questions: true } },
    },
  });

  if (!exam || exam.userId !== authUser.id) {
    return NextResponse.json({ error: "ไม่พบข้อสอบนี้" }, { status: 404 });
  }

  const needsReviewCount = await prisma.question.count({
    where: { examId: exam.id, needsReview: true },
  });

  return NextResponse.json({
    examId: exam.id,
    status: exam.status,
    pages: exam.pages,
    questionCount: exam._count.questions,
    needsReviewCount,
  });
}
