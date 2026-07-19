import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(
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

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.quizId },
    include: {
      quizQuestions: {
        orderBy: { order: "asc" },
        include: {
          question: {
            select: {
              id: true,
              content: true,
              difficulty: true,
              needsReview: true,
              choices: { orderBy: { order: "asc" }, select: { label: true, content: true } },
              // ⚠️ ห้าม select answer/explanation ตรงนี้เด็ดขาด — จะรั่วเฉลย
              // ให้ผู้ใช้เห็นก่อนตอบ ส่งเฉพาะตอน submit แล้วเท่านั้น
            },
          },
        },
      },
    },
  });

  if (!quiz) {
    return NextResponse.json({ error: "ไม่พบ Quiz นี้" }, { status: 404 });
  }

  // Private quiz ดูได้เฉพาะเจ้าของ, Public/Unlisted ดูได้ทุกคนที่มีลิงก์
  if (quiz.visibility === "PRIVATE" && quiz.userId !== authUser.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง Quiz นี้" }, { status: 403 });
  }

  return NextResponse.json({
    id: quiz.id,
    title: quiz.title,
    mode: quiz.mode,
    questions: quiz.quizQuestions.map((qq) => qq.question),
  });
}
