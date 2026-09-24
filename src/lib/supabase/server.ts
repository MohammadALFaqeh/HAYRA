import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** عميل السيرفر بجلسة المستخدم (للمشرف) — يحترم RLS */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // يُستدعى من Server Component — التحديث يتم في middleware
        }
      },
    },
  });
}

/** يتأكد أن المستخدم الحالي مشرف — يرجع المستخدم أو null */
export async function getAdminUser() {
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await sb.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? data.user : null;
}
