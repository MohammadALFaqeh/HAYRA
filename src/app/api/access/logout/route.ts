import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/access";
import { json } from "@/lib/http";

export async function POST() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  return json({ ok: true });
}
