import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

let client: SupabaseClient | null = null;

/** عميل anon للسيرفر (قراءة البيانات العامة في Server Components بدون كوكيز) */
export function getPublicSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
