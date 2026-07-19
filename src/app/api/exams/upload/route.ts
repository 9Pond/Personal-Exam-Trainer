import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { sha256 } from "@/lib/hash";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB ต่อไฟล์

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUser = await getOrCreateAppUser(authUser);

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];
  const title = (formData.get("title") as string) || "ข้อสอบไม่มีชื่อ";
  const subject = (formData.get("subject") as string) || null;
  const hasAnswerKey = formData.get("hasAnswerKey") !== "false"; // default true

  if (files.length === 0) {
    return NextResponse.json({ error: "กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์" }, { status: 400 });
  }

  const isSinglePdf = files.length === 1 && files[0].type === "application/pdf";

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `ไฟล์ประเภท ${file.type} ไม่รองรับ` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `ไฟล์ ${file.name} มีขนาดเกิน 20MB` }, { status: 400 });
    }
  }

  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const combinedHash = sha256(Buffer.concat(buffers.map((b) => sha256(b)).map((h) => Buffer.from(h))));

  const existingExam = await prisma.exam.findUnique({
    where: { userId_fileHash: { userId: appUser.id, fileHash: combinedHash } },
  });

  if (existingExam) {
    return NextResponse.json({ examId: existingExam.id, status: existingExam.status, deduped: true });
  }

  const exam = await prisma.exam.create({
    data: {
      userId: appUser.id,
      title,
      subject,
      hasAnswerKey,
      fileHash: combinedHash,
      status: "PROCESSING",
    },
  });

  if (isSinglePdf) {
    const { url } = await uploadFile({
      path: `${appUser.id}/${exam.id}/source.pdf`,
      buffer: buffers[0],
      contentType: "application/pdf",
    });

    await prisma.exam.update({
      where: { id: exam.id },
      data: { sourceFileUrl: url, sourceMimeType: "application/pdf" },
    });
  } else {
    await Promise.all(
      files.map(async (file, index) => {
        const { url } = await uploadFile({
          path: `${appUser.id}/${exam.id}/page-${index + 1}-${file.name}`,
          buffer: buffers[index],
          contentType: file.type,
        });

        await prisma.examPage.create({
          data: {
            examId: exam.id,
            pageNumber: index + 1,
            fileUrl: url,
            status: "PENDING",
          },
        });
      })
    );
  }

  // 🚀 ประมวลผล AI และบล็อกขบวนการทำงานให้เสร็จตรง ๆ ก่อนตอบกลับหน้าบ้านเพื่อไม่ให้ Vercel ตัดไฟแครชกลางทาง
  try {
    const { runOcr, extractQuestionsWithAnswerKey, extractQuestionsWithoutAnswerKey } = await import("@/lib/ai/gateway");

    let combinedOcrText = "";

    // 1. ทำ OCR ตามประเภทไฟล์
    const ocrPages = await runOcr({
      fileBuffer: buffers[0],
      mimeType: files[0].type,
      userId: appUser.id,
    });
    combinedOcrText = ocrPages.join("\n");

    // 2. ส่งข้อความ OCR ไปให้ AI แยกร่างและวิเคราะห์สร้างควิซ
    let questions = [];
    if (hasAnswerKey) {
      questions = await extractQuestionsWithAnswerKey({
        ocrText: combinedOcrText,
        userId: appUser.id,
      });
    } else {
      questions = await extractQuestionsWithoutAnswerKey({
        ocrText: combinedOcrText,
        userId: appUser.id,
      });
    }

    // 3. บันทึกข้อสอบและตัวเลือกลงฐานข้อมูล Supabase ผ่าน Prisma
    for (const q of questions as any) {
      await prisma.question.create({
        data: {
          examId: exam.id,
          content: q.content,
          difficulty: q.difficulty.toUpperCase() as any, // แปลงเป็น EASY, MEDIUM, HARD
          topic: q.topic,
          choices: {
            create: (q.choices as any[]).map((c: any, idx: any) => ({
              label: c.label,
              content: c.content,
              order: idx,
              isCorrect: c.label === q.correct_label,
            })),
          },
          explanation: q.explanation?.reasoning || "",
        },
      });
    }

    // 4. อัปเดตสถานะชุดข้อสอบเป็นสำเร็จ
    await prisma.exam.update({
      where: { id: exam.id },
      data: { status: "READY" },
    });

    if (!isSinglePdf) {
      await prisma.examPage.updateMany({
        where: { examId: exam.id },
        data: { status: "EXTRACTED" },
      });
    }

    // ตอบกลับหน้าบ้านพร้อมบอกสถานะสำเร็จเพื่อให้เปลี่ยนหน้าทันที
    return NextResponse.json({ examId: exam.id, status: "READY", deduped: false });

  } catch (aiError) {
    console.error("Vercel AI Processing error:", aiError);
    
    // อัปเดตสถานะเป็น FAILED ในฐานข้อมูล
    await prisma.exam.update({
      where: { id: exam.id },
      data: { status: "FAILED" },
    });

    return NextResponse.json({ error: "การประมวลผลข้อสอบล้มเหลว" }, { status: 500 });
  }
}