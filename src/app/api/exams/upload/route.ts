import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { sha256 } from "@/lib/hash";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  console.log("DEBUG: เริ่มต้น API /api/exams/upload");
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUser = await getOrCreateAppUser(authUser);
  const formData = await request.formData();
  const files = formData.getAll("files") as File[];
  const title = (formData.get("title") as string) || "ข้อสอบไม่มีชื่อ";
  const hasAnswerKey = formData.get("hasAnswerKey") !== "false";

  if (files.length === 0) return NextResponse.json({ error: "กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์" }, { status: 400 });

  const isSinglePdf = files.length === 1 && files[0].type === "application/pdf";
  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const combinedHash = sha256(Buffer.concat(buffers.map((b) => sha256(b)).map((h) => Buffer.from(h))));

  const existingExam = await prisma.exam.findUnique({
    where: { userId_fileHash: { userId: appUser.id, fileHash: combinedHash } },
  });
  if (existingExam) return NextResponse.json({ examId: existingExam.id, status: existingExam.status, deduped: true });

  const exam = await prisma.exam.create({
    data: { userId: appUser.id, title, hasAnswerKey, fileHash: combinedHash, status: "PROCESSING" },
  });
  console.log("DEBUG: สร้าง Exam ใน DB แล้ว ID:", exam.id);

  // อัปโหลดไฟล์
  if (isSinglePdf) {
    const { url } = await uploadFile({ path: `${appUser.id}/${exam.id}/source.pdf`, buffer: buffers[0], contentType: "application/pdf" });
    await prisma.exam.update({ where: { id: exam.id }, data: { sourceFileUrl: url } });
  } else {
    await Promise.all(files.map(async (file, index) => {
      const { url } = await uploadFile({ path: `${appUser.id}/${exam.id}/page-${index + 1}-${file.name}`, buffer: buffers[index], contentType: file.type });
      await prisma.examPage.create({ data: { examId: exam.id, pageNumber: index + 1, fileUrl: url, status: "PENDING" } });
    }));
  }
  console.log("DEBUG: อัปโหลดไฟล์เสร็จสิ้น เข้าสู่ช่วงประมวลผล AI...");

  // 🚀 รัน AI พร้อม Log ตรวจสอบ
  try {
    const { runOcr, extractQuestionsWithAnswerKey, extractQuestionsWithoutAnswerKey } = await import("@/lib/ai/gateway");
    
    console.log("DEBUG: กำลังเริ่มรัน OCR...");
    const ocrPages = await runOcr({ fileBuffer: buffers[0], mimeType: files[0].type, userId: appUser.id });
    const combinedOcrText = ocrPages.join("\n");
    console.log("DEBUG: OCR เสร็จสิ้น ข้อความยาว:", combinedOcrText.length);

    console.log("DEBUG: กำลังส่งให้ AI สร้างคำถาม...");
    const questions = hasAnswerKey 
      ? await extractQuestionsWithAnswerKey({ ocrText: combinedOcrText, userId: appUser.id })
      : await extractQuestionsWithoutAnswerKey({ ocrText: combinedOcrText, userId: appUser.id });
    console.log("DEBUG: AI สร้างคำถามสำเร็จ จำนวน:", questions.length);

    // บันทึกลงฐานข้อมูล
    console.log("DEBUG: กำลังบันทึกคำถามลง DB...");
    for (const q of questions as any) {
      await prisma.question.create({
        data: {
          examId: exam.id,
          content: q.content,
          difficulty: q.difficulty?.toUpperCase() || "MEDIUM",
          topic: q.topic || "ทั่วไป",
          explanation: q.explanation?.reasoning || "",
          choices: {
            create: (q.choices as any[]).map((c: any, idx: any) => ({
              label: c.label,
              content: c.content,
              order: idx,
              isCorrect: c.label === q.correct_label,
            })),
          },
        },
      });
    }

    await prisma.exam.update({ where: { id: exam.id }, data: { status: "READY" } });
    console.log("DEBUG: ประมวลผลทั้งหมดสำเร็จสถานะเป็น READY");

    return NextResponse.json({ examId: exam.id, status: "READY", deduped: false });

  } catch (aiError) {
    console.error("DEBUG: ERROR เกิดขึ้นที่ AI!", aiError);
    await prisma.exam.update({ where: { id: exam.id }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "ประมวลผลล้มเหลว" }, { status: 500 });
  }
}