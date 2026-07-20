import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { quizId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

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
                choices: { 
                    orderBy: { order: "asc" }, 
                    select: { label: true, content: true } 
                },
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      return NextResponse.json({ error: "ไม่พบ Quiz นี้" }, { status: 404 });
    }

    // ตรวจสอบสิทธิ์การเข้าถึง
    if (quiz.visibility === "PRIVATE" && quiz.userId !== authUser.id) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง Quiz นี้" }, { status: 403 });
    }

    return NextResponse.json({
      id: quiz.id,
      title: quiz.title,
      mode: quiz.mode,
      questions: quiz.quizQuestions.map((qq) => qq.question),
    });
    
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }, { status: 500 });
  }
}