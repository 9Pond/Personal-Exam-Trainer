"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Question = {
  id: string;
  content: string;
  difficulty: string;
  needsReview: boolean;
  choices: { label: string; content: string }[];
};

export default function TakeQuizPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const quizRes = await fetch(`/api/quizzes/test-123`);
      const quizData = await quizRes.json();

      if (!quizRes.ok) {
        setError(quizData.error ?? "โหลด Quiz ไม่สำเร็จ");
        setLoading(false);
        return;
      }

      setTitle(quizData.title);
      setQuestions(quizData.questions);

      const attemptRes = await fetch(`/api/quizzes/${params.quizId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const attemptData = await attemptRes.json();
      setAttemptId(attemptData.attemptId);
      setLoading(false);
    }
    init();
  }, [params.quizId]);

  function selectAnswer(questionId: string, label: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setSubmitting(true);

    const payload = {
      answers: questions.map((q) => ({
        questionId: q.id,
        selectedLabel: answers[q.id] ?? null,
      })),
    };

    const res = await fetch(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (res.ok) {
      router.push(`/attempt/${attemptId}/result`);
    } else {
      const data = await res.json();
      setError(data.error ?? "ส่งคำตอบไม่สำเร็จ");
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted-foreground">กำลังโหลด...</p>;
  if (error) return <p className="p-8 text-sm text-red-500">{error}</p>;
  if (questions.length === 0) return <p className="p-8 text-sm">ไม่มีคำถามใน Quiz นี้</p>;

  const question = questions[current];
  const answeredCount = Object.keys(answers).length;

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{title}</h1>
        <span className="text-sm text-muted-foreground">
          {current + 1}/{questions.length}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${((current + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="space-y-4">
        <p className="text-base leading-relaxed">{question.content}</p>
        {question.needsReview && (
          <p className="text-xs text-amber-600">⚠️ ข้อนี้ AI มีความมั่นใจต่ำ ตรวจสอบคำตอบด้วยตนเองด้วย</p>
        )}

        <div className="space-y-2">
          {question.choices.map((choice) => (
            <button
              key={choice.label}
              onClick={() => selectAnswer(question.id, choice.label)}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                answers[question.id] === choice.label
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted"
              }`}
            >
              <span className="font-medium mr-2">{choice.label}.</span>
              {choice.content}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
        >
          ก่อนหน้า
        </button>

        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            ข้อถัดไป
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "กำลังส่ง..." : `ส่งคำตอบ (${answeredCount}/${questions.length})`}
          </button>
        )}
      </div>
    </main>
  );
}
