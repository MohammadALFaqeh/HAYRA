import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CategoriesStep } from "./CategoriesStep";

export const metadata: Metadata = { title: "اختيار الفئات" };

export default function CategoriesPage() {
  return (
    <>
      <SiteHeader />
      <CategoriesStep />
    </>
  );
}
