"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type ExamStatus = {
  examId: string;
  status: "PROCESSING" | "READY" | "FAILED" | "PARTIAL";
  pages: { pageNumber: number; status: string }[];
  questionCount: number;
  needsReviewCount: number;
};

export default function UploadPage() {
  const router = useRouter(); // เพิ่ม router เพื่อใช้เปลี่ยนหน้า
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [hasAnswerKey, setHasAnswerKey] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examStatus, setExamStatus] = useState<ExamStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(examId: string) {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/exams/status?examId=${examId}`);
      if (!res.ok) return;
      const data: ExamStatus = await res.json();
      setExamStatus(data);

      if (data.status === "READY" || data.status === "FAILED" || data.status === "PARTIAL") {
        if (pollRef.current) clearInterval(pollRef.current);
        // เมื่อประมวลผลเสร็จแล้วให้ไปหน้าข้อสอบ
        if (data.status === "READY") router.push(`/quiz/${examId}`);
      }
    }, 2500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์");
      return;
    }

    setSubmitting(true);
    setError(null);
    setExamStatus(null);

    const formData = new FormData();
    formData.set("title", title || files[0].name);
    formData.set("subject", subject);
    formData.set("hasAnswerKey", String(hasAnswerKey));
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/exams/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }

      // แก้ไขตรงนี้: ถ้าไฟล์ซ้ำ ให้ไปที่หน้าข้อสอบทันที
      if (data.deduped) {
        router.push(`/quiz/${data.examId}`);
        return;
      }

      setExamStatus({ examId: data.examId, status: data.status, pages: [], questionCount: 0, needsReviewCount: 0 });
      startPolling(data.examId);
    } catch {
      setError("เกิดข้อผิดพลาดระหว่างอัปโหลด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">อัปโหลดข้อสอบ</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="ชื่อข้อสอบ (เช่น Midterm Biology Ch.1-3)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
        />
        <input
          type="text"
          placeholder="วิชา (ไม่บังคับ)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasAnswerKey}
            onChange={(e) => setHasAnswerKey(e.target.checked)}
          />
          ข้อสอบนี้มีเฉลยแนบอยู่ในเอกสาร
        </label>

        <input
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full text-sm"
        />
        <p className="text-xs text-muted-foreground">
          รองรับ PDF (หลายหน้า) หรือรูปภาพหลายรูป — เลือกอย่างใดอย่างหนึ่ง
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "กำลังอัปโหลด..." : "อัปโหลดและเริ่มวิเคราะห์"}
        </button>
      </form>

      {examStatus && (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p>
            สถานะ:{" "}
            <span className="font-medium">
              {
                {
                  PROCESSING: "กำลังประมวลผล...",
                  READY: "พร้อมใช้งาน ✅",
                  FAILED: "ล้มเหลว ❌",
                  PARTIAL: "สำเร็จบางส่วน ⚠️",
                }[examStatus.status]
              }
            </span>
          </p>
          <p className="text-muted-foreground">จำนวนคำถามที่สร้างได้: {examStatus.questionCount}</p>
        </div>
      )}
    </main>
  );
}