"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "apple", label: "Apple" },
] as const;

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: (typeof OAUTH_PROVIDERS)[number]["id"]) {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirectedFrom=${redirectedFrom}`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(redirectedFrom);
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setError(error ? error.message : "ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">AI Quiz Platform</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "เข้าสู่ระบบเพื่อเริ่มเรียนรู้" : "สร้างบัญชีใหม่"}
          </p>
        </div>

        <div className="space-y-2">
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleOAuth(provider.id)}
              className="w-full rounded-lg border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              เข้าสู่ระบบด้วย {provider.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-muted" />
          หรือใช้อีเมล
          <div className="h-px flex-1 bg-muted" />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            required
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "กำลังดำเนินการ..." : mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button onClick={handleForgotPassword} className="hover:underline">
            ลืมรหัสผ่าน?
          </button>
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="hover:underline"
          >
            {mode === "signin" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
          </button>
        </div>
      </div>
    </main>
  );
}
