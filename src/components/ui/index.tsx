"use client";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "gold" | "volt" | "ghost" | "danger" | "success" | "soft";
const VARIANTS: Record<Variant, string> = {
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-night-950 shadow-gold hover:brightness-110",
  volt: "bg-gradient-to-b from-volt-400 to-volt-600 text-white shadow-volt hover:brightness-110",
  success: "bg-gradient-to-b from-leaf-400 to-leaf-600 text-white hover:brightness-110",
  danger: "bg-gradient-to-b from-wine-400 to-wine-600 text-white hover:brightness-110",
  soft: "bg-white/[0.07] text-white hover:bg-white/[0.12] border border-white/10",
  ghost: "bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white",
};
const SIZES = { sm: "h-9 px-3 text-sm rounded-xl", md: "h-11 px-5 rounded-2xl", lg: "h-14 px-7 text-lg rounded-2xl", xl: "h-16 px-8 text-xl rounded-[1.4rem]" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gold", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-bold transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4 py-2", disabled && "opacity-50")}>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-white/50">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-1 h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-gold-400" : "bg-white/15")}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "right-6 bg-night-950" : "right-1",
          )}
        />
      </button>
    </label>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-sm font-semibold text-white/80">{label}</span>
      {children}
      {hint && <span className="block text-xs text-white/45">{hint}</span>}
    </label>
  );
}

/** حقل كلمة مرور مع زر عين لإظهار/إخفاء النص */
export function PasswordInput({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={show ? "text" : "password"} dir="ltr" className={cn("w-full pl-11", className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute inset-y-0 left-0 grid w-11 place-items-center text-white/45 transition hover:text-gold-300"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-night-850 p-5 shadow-2xl animate-pop-in sm:rounded-[2rem]",
          wide ? "sm:max-w-3xl" : "sm:max-w-md",
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold", className)}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-white/60">
      <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Toast({ message, onClose, tone = "error" }: { message: string | null; onClose: () => void; tone?: "error" | "info" }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto rounded-2xl px-5 py-3 font-semibold shadow-2xl animate-pop-in",
          tone === "error" ? "bg-wine-500 text-white" : "bg-night-700 text-white ring-1 ring-white/10",
        )}
        onClick={onClose}
      >
        {message}
      </div>
    </div>
  );
}
