"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Button, Field, PasswordInput } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const sb = getBrowserSupabase();
    // "admin" اختصار لبريد المشرف
    const login = email.trim().toLowerCase();
    const fullEmail = login === "admin" ? "mohammadalfaqeeh73@gmail.com" : login;
    const { data, error } = await sb.auth.signInWithPassword({ email: fullEmail, password });
    if (error || !data.user) {
      setError("اسم المستخدم أو كلمة المرور غير صحيحة");
      setLoading(false);
      return;
    }
    const { data: row } = await sb.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (!row) {
      await sb.auth.signOut();
      setError("هذا الحساب ليس مشرفًا. أضفه لجدول admins (انظر README).");
      setLoading(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6">
        <Logo size={130} />
        <h1 className="text-center font-display text-2xl font-extrabold">لوحة الإدارة</h1>
        <Field label="اسم المستخدم أو البريد">
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" className="w-full" autoComplete="username" autoCapitalize="none" />
        </Field>
        <Field label="كلمة المرور">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <p className="rounded-xl bg-wine-500/20 px-3 py-2 text-sm text-wine-400">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          دخول
        </Button>
      </form>
    </main>
  );
}
