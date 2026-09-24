"use client";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Button, Field, Spinner } from "@/components/ui";

export default function AccessPage() {
  const [current, setCurrent] = useState<{ access_code: string; version: number; updated_at: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await getBrowserSupabase().rpc("admin_get_access");
    const row = Array.isArray(data) ? data[0] : data;
    setCurrent(row ?? null);
    setCode(row?.access_code ?? "");
  };
  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (code.trim().length < 3) return setMsg({ ok: false, text: "رمز الدخول 3 أحرف على الأقل" });
    if (password && password.length < 6) return setMsg({ ok: false, text: "كلمة المرور 6 أحرف على الأقل" });
    if (password !== confirmPw) return setMsg({ ok: false, text: "كلمتا المرور غير متطابقتين" });
    setSaving(true);
    const { error } = await getBrowserSupabase().rpc("admin_set_access", { p_code: code.trim(), p_password: password || null });
    setSaving(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPassword("");
    setConfirmPw("");
    setMsg({ ok: true, text: "تم التحديث ✅ — تم تسجيل خروج كل الأجهزة، والدخول يحتاج البيانات الجديدة." });
    await load();
  }

  if (!current) return <Spinner />;
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="font-display text-3xl font-extrabold">بيانات الدخول المشتركة</h1>
      <div className="panel space-y-1 p-4 text-sm">
        <div>
          الرمز الحالي: <b dir="ltr">{current.access_code}</b>
        </div>
        <div className="text-white/50">آخر تحديث: {new Date(current.updated_at).toLocaleString("ar")} (نسخة {current.version})</div>
        {current.version === 1 && <div className="text-ember-400">⚠️ ما زالت البيانات الافتراضية مستخدمة — غيّرها الآن.</div>}
      </div>
      <form onSubmit={save} className="panel space-y-4 p-5">
        <Field label="رمز الدخول الجديد">
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full" dir="ltr" />
        </Field>
        <Field label="كلمة مرور جديدة" hint="اتركها فارغة للإبقاء على الحالية">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full" dir="ltr" autoComplete="new-password" />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full" dir="ltr" autoComplete="new-password" />
        </Field>
        {msg && <p className={msg.ok ? "text-leaf-400" : "text-wine-400"}>{msg.text}</p>}
        <Button type="submit" className="w-full" size="lg" loading={saving} icon={<KeyRound className="h-5 w-5" />}>
          حفظ (يسجّل خروج الجميع)
        </Button>
      </form>
      <p className="text-sm text-white/45">كلمة المرور تُحفظ مشفّرة (bcrypt) داخل قاعدة البيانات، ولا يمكن لأحد قراءتها.</p>
    </div>
  );
}
