import type { Metadata } from "next";
import { QuestionEditor } from "@/components/admin/QuestionEditor";

export const metadata: Metadata = { title: "محرر السؤال" };

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestionEditor id={id === "new" ? null : id} />;
}
