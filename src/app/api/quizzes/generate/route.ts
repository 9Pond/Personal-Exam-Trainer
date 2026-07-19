import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const GenerateQuizSchema = z.object({
  title: z.string().optional(),
  examIds: z.array(z.string()).optional(), // ไม่ระบุ = สุ่มจากทุกข้อสอบของ user
  folderId: z.string().optional(),
  count: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), // ไม่ระบุ = ผสม
  mode: z.enum(["PRACTICE", "EXAM", "TIMED", "WRONG_ONLY", "RANDOM"]),
  timeLimitSec: z.number().optional(),
});

/** Fisher-Yates shuffle — ใช้สุ่มลำดับ/เลือกข้อแบบไม่ bias */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUser = await getOrCreateAppUser(authUser);
  const body = GenerateQuizSchema.parse(await request.json());

  let questionIds: string[] = [];

  if (body.mode === "WRONG_ONLY") {
    // จัดลำดับข้อที่ผิดบ่อยที่สุดก่อน ตามที่ PRD กำหนด
    const wrongQuestions = await prisma.wrongQuestion.findMany({
      where: { userId: appUser.id, resolved: false },
      orderBy: { wrongCount: "desc" },
      take: body.count,
      select: { questionId: true },
    });
    questionIds = wrongQuestions.map((w) => w.questionId);
  } else {
    // สุ่มจาก DB ล้วนๆ — ไม่มีการเรียก AI ใดๆ ในขั้นตอนนี้
    const candidates = await prisma.question.findMany({
      where: {
        exam: { userId: appUser.id },
        ...(body.examIds ? { examId: { in: body.examIds } } : {}),
        ...(body.difficulty ? { difficulty: body.difficulty } : {}),
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบคำถามที่ตรงเงื่อนไข ลองปรับตัวกรองหรืออัปโหลดข้อสอบเพิ่ม" },
        { status: 400 }
      );
    }

    questionIds = shuffle(candidates.map((c) => c.id)).slice(0, body.count);
  }

  if (questionIds.length === 0) {
    return NextResponse.json(
      { error: "ไม่มีข้อที่ผิดให้ทบทวนตอนนี้ — เก่งมาก!" },
      { status: 400 }
    );
  }

  const quiz = await prisma.quiz.create({
    data: {
      userId: appUser.id,
      title: body.title ?? `Quiz ${new Date().toLocaleDateString("th-TH")}`,
      mode: body.mode,
      difficulty: body.difficulty,
      folderId: body.folderId,
      quizQuestions: {
        create: questionIds.map((questionId, index) => ({ questionId, order: index })),
      },
    },
  });

  return NextResponse.json({ quizId: quiz.id, questionCount: questionIds.length });
}
