"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COUNT_OPTIONS = [10, 20, 50, 100] as const;
const DIFFICULTY_OPTIONS = [
  { value: "", label: "ผสม" },
  { value: "EASY", label: "ง่าย" },
  { value: "MEDIUM", label: "ปานกลาง" },
  { value: "HARD", label: "ยาก" },
] as const;
const MODE_OPTIONS = [
  { value: "PRACTICE", label: "Practice" },
  { value: "EXAM", label: "Exam Mode" },
  { value: "TIMED", label: "Timed Mode" },
  { value: "WRONG_ONLY", label: "ทบทวนข้อที่เคยผิด" },
  { value: "RANDOM", label: "Random Mode" },
] as const;

export default function NewQuizPage() {
  const router = useRouter();
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(10);
  const [difficulty, setDifficulty] = useState("");
  const [mode, setMode] = useState<(typeof MODE_OPTIONS)[number]["value"]>("PRACTICE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/quizzes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count,
        difficulty: difficulty || undefined,
        mode,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "สร้าง Quiz ไม่สำเร็จ");
      return;
    }

    router.push(`/quiz/${data.quizId}/take`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">สร้าง Quiz ใหม่</h1>

      <div className="space-y-2">
        <p className="text-sm font-medium">จำนวนข้อ</p>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`flex-1 rounded-lg border py-2 text-sm ${
                count === c ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {c} ข้อ
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">ระดับความยาก</p>
        <div className="flex gap-2">
          {DIFFICULTY_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`flex-1 rounded-lg border py-2 text-sm ${
                difficulty === d.value ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">โหมด</p>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {loading ? "กำลังสร้าง..." : "Generate Quiz"}
      </button>
    </main>
  );
}
