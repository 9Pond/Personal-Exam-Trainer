"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Analysis = {
  overallSummary: string;
  weakTopics: { topic: string; percentage: number }[];
  strongTopics: { topic: string; percentage: number }[];
  recommendation: string;
} | null;

type ResultData = {
  quizTitle: string;
  score: number;
  correctCount: number;
  totalCount: number;
  analysis: Analysis;
  answers: {
    content: string;
    choices: { label: string; content: string }[];
    selectedLabel: string | null;
    correctLabel: string;
    isCorrect: boolean;
    reasoning?: string;
    concept?: string;
  }[];
};

export default function AttemptResultPage() {
  const params = useParams<{ attemptId: string }>();
  const [data, setData] = useState<ResultData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchResult() {
      const res = await fetch(`/api/attempts/${params.attemptId}`);
      if (!res.ok) return;
      const json: ResultData = await res.json();
      setData(json);

      // การวิเคราะห์ (analysis) เป็น async job — poll จนกว่าจะเสร็จ
      if (json.analysis && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }

    fetchResult();
    pollRef.current = setInterval(fetchResult, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [params.attemptId]);

  if (!data) return <p className="p-8 text-sm text-muted-foreground">กำลังโหลดผลคะแนน...</p>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">{data.quizTitle}</p>
        <p className="text-4xl font-bold">{data.score.toFixed(0)}%</p>
        <p className="text-sm text-muted-foreground">
          ตอบถูก {data.correctCount}/{data.totalCount} ข้อ
        </p>
      </div>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium text-sm">การวิเคราะห์ผลการเรียนรู้</h2>
        {!data.analysis ? (
          <p className="text-sm text-muted-foreground">AI กำลังวิเคราะห์ผล... (ไม่กี่วินาที)</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>{data.analysis.overallSummary}</p>
            {data.analysis.weakTopics.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">หัวข้อที่ควรทบทวน:</p>
                {data.analysis.weakTopics.map((t) => (
                  <div key={t.topic} className="flex justify-between">
                    <span>{t.topic}</span>
                    <span className="text-red-500">{t.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
            <p className="rounded-md bg-muted p-3">💡 {data.analysis.recommendation}</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-medium text-sm">เฉลยและคำอธิบายรายข้อ</h2>
        {data.answers.map((a, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 space-y-2 ${
              a.isCorrect ? "border-green-500/30" : "border-red-500/30"
            }`}
          >
            <p className="text-sm">
              {i + 1}. {a.content}
            </p>
            <p className="text-xs">
              คำตอบของคุณ: <span className="font-medium">{a.selectedLabel ?? "ข้าม"}</span>
              {" · "}
              เฉลย: <span className="font-medium">{a.correctLabel}</span>{" "}
              {a.isCorrect ? "✅" : "❌"}
            </p>
            {a.reasoning && (
              <p className="text-xs text-muted-foreground">
                <strong>เหตุผล:</strong> {a.reasoning}
              </p>
            )}
            {a.concept && (
              <p className="text-xs text-muted-foreground">
                <strong>แนวคิด:</strong> {a.concept}
              </p>
            )}
          </div>
        ))}
      </section>

      <div className="flex gap-3">
        <Link
          href="/quiz/new"
          className="flex-1 rounded-lg bg-primary py-2.5 text-center text-sm text-primary-foreground"
        >
          สร้าง Quiz ใหม่
        </Link>
        <Link href="/dashboard" className="flex-1 rounded-lg border py-2.5 text-center text-sm">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
