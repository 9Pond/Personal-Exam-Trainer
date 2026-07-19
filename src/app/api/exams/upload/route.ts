import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { sha256 } from "@/lib/hash";
import { ocrAndExtractQueue } from "@/lib/queue/queues";

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

  // เคสที่ 1: อัปโหลด PDF เดี่ยว — จำนวนหน้ารู้หลัง OCR เท่านั้น
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

  // hash รวมของทุกไฟล์ในชุดอัปโหลดนี้ — ใช้กันการประมวลผลซ้ำถ้า user
  // อัปโหลดชุดเดิมซ้ำ (เช่น กด submit สองครั้งโดยไม่ตั้งใจ)
  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const combinedHash = sha256(Buffer.concat(buffers.map((b) => sha256(b)).map((h) => Buffer.from(h))));

  const existingExam = await prisma.exam.findUnique({
    where: { userId_fileHash: { userId: appUser.id, fileHash: combinedHash } },
  });

  if (existingExam) {
    // ไฟล์ชุดนี้เคยอัปโหลดแล้ว — ไม่สร้างใหม่ ไม่ enqueue ซ้ำ ส่ง exam เดิมกลับไปเลย
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
    // PDF: เก็บไฟล์ต้นฉบับไว้ที่ Exam โดยตรง worker จะสร้าง ExamPage
    // ทีละหน้าเองหลังจากรู้ผล OCR ว่ามีกี่หน้า
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
    // รูปภาพหลายรูป: รู้จำนวนหน้าแน่นอนตั้งแต่ตอนอัปโหลด สร้าง ExamPage ได้เลย
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

  await ocrAndExtractQueue.add("process-exam", { examId: exam.id });

  return NextResponse.json({ examId: exam.id, status: "PROCESSING", deduped: false });
}
