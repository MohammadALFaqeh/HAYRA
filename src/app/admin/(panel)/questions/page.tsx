import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionList } from "@/components/admin/QuestionList";

export const metadata: Metadata = { title: "بنك الأسئلة" };

export default function QuestionsPage() {
  return (
    <Suspense>
      <QuestionList />
    </Suspense>
  );
}
