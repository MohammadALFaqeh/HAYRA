import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ size = 160, className, glow = true }: { size?: number; className?: string; glow?: boolean }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="حيرة"
      width={418}
      height={330}
      priority
      style={{ width: size, height: "auto" }}
      className={cn("mx-auto select-none", glow && "drop-shadow-[0_0_35px_rgba(255,203,61,0.35)]", className)}
    />
  );
}
