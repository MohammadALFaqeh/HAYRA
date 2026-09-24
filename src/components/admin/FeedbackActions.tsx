"use client";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function FeedbackActions({ id }: { id: number }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await getBrowserSupabase().from("question_feedback").delete().eq("id", id);
        router.refresh();
      }}
      className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-wine-400"
      aria-label="حذف التقييم"
      title="تمت المراجعة — حذف"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
