import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, signAccessToken } from "@/lib/access";
import { errorJson, json } from "@/lib/http";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  let body: { code?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson("طلب غير صالح");
  }
  const code = typeof body.code === "string" ? body.code.trim().slice(0, 64) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
  if (!code || !password) return errorJson("أدخل رمز الدخول وكلمة المرور");

  const { data, error } = await getServiceSupabase().rpc("verify_access", { p_code: code, p_password: password });
  if (error) return errorJson("تعذر الاتصال بقاعدة البيانات", 500);
  if (typeof data !== "number") {
    await sleep(700); // إبطاء محاولات التخمين
    return errorJson("رمز الدخول أو كلمة المرور غير صحيحة", 401);
  }

  const token = await signAccessToken(data);
  const store = await cookies();
  store.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  return json({ ok: true });
}
