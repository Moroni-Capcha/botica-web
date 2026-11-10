import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm transition-colors duration-[var(--dur-fast)] placeholder:text-muted focus:border-brand-ink aria-[invalid=true]:border-danger aria-[invalid=true]:focus:border-danger";

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-xs font-medium text-fg-2">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-micro text-danger-fg">{error}</span> : hint ? <span className="mt-1 block text-micro text-muted">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClass, "w-full", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputClass, "w-full pr-8", className)} {...rest}>
      {children}
    </select>
  );
});
