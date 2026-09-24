import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, readAccessToken } from "./access";
import { getServiceSupabase } from "./supabase/admin";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomKey = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** يتحقق من كوكي الدخول + أن نسخة بيانات الدخول لم تتغير من لوحة الإدارة */
export async function hasValidAccess(): Promise<boolean> {
  const store = await cookies();
  const token = await readAccessToken(store.get(ACCESS_COOKIE)?.value);
  if (!token) return false;
  const { data, error } = await getServiceSupabase().rpc("current_access_version");
  if (error) return false;
  return data === token.v;
}

/** يتحقق من مفتاح المضيف المرسل في الهيدر x-host-key */
export function hostKeyMatches(req: NextRequest, storedHash: string): boolean {
  const key = req.headers.get("x-host-key");
  if (!key || key.length < 16) return false;
  const a = Buffer.from(sha256(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
