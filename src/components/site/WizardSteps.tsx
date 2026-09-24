import { cn } from "@/lib/utils";

export function WizardSteps({ step, pack }: { step: 1 | 2 | 3; pack: boolean }) {
  const steps = pack ? ["الفرق", "الإعدادات"] : ["الفرق", "الإعدادات", "الفئات"];
  return (
    <ol className="flex items-center justify-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full font-bold",
              i + 1 === step ? "bg-gold-400 text-night-950" : i + 1 < step ? "bg-leaf-500 text-white" : "bg-white/10 text-white/50",
            )}
          >
            {i + 1 < step ? "✓" : i + 1}
          </span>
          <span className={i + 1 === step ? "font-bold" : "text-white/50"}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-white/15" />}
        </li>
      ))}
    </ol>
  );
}
