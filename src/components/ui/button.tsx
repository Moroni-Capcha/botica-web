import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { hitArea } from "./icon-button";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:brightness-110",
  secondary: "border border-line bg-surface text-fg-2 hover:bg-subtle",
  ghost: "bg-sunken text-fg-2 hover:bg-sunken-strong",
  danger: "bg-danger text-white hover:bg-danger-fg",
  dark: "bg-fg text-white hover:bg-fg-2",
};
const sizes: Record<Size, string> = { sm: cn("h-8 px-3 text-xs", hitArea), md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, className, disabled, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});
