import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

let client: SupabaseClient | null = null;

/**
 * عميل service role — يتجاوز RLS. للسيرفر فقط (API Routes).
 * لا تستورده أبدًا في مكوّن "use client".
 */
export function getServiceSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY غير مضبوط في متغيرات البيئة");
  if (!client) {
    client = createClient(supabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
