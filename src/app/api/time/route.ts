import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** توقيت السيرفر لمزامنة المؤقتات بين التلفزيون والجوال */
export async function GET() {
  return json({ now: Date.now() });
}
