export type Tone = "neutral" | "success" | "danger" | "warning" | "info" | "special";

/** Clases completas (Tailwind necesita verlas escritas) de cada tono, salidas de los tokens de globals.css. */
export const TONE_CLASS: Record<Tone, { soft: string; solid: string; ring: string; text: string; dot: string }> = {
  neutral: { soft: "bg-sunken text-fg-2", solid: "bg-fg text-surface", ring: "ring-line", text: "text-fg-2", dot: "bg-muted" },
  success: { soft: "bg-success-bg text-success-fg", solid: "bg-success text-white", ring: "ring-success-border", text: "text-success-fg", dot: "bg-success" },
  danger: { soft: "bg-danger-bg text-danger-fg", solid: "bg-danger text-white", ring: "ring-danger-border", text: "text-danger-fg", dot: "bg-danger" },
  warning: { soft: "bg-warning-bg text-warning-fg", solid: "bg-warning text-white", ring: "ring-warning-border", text: "text-warning-fg", dot: "bg-warning" },
  info: { soft: "bg-info-bg text-info-fg", solid: "bg-info text-white", ring: "ring-info-border", text: "text-info-fg", dot: "bg-info" },
  special: { soft: "bg-special-bg text-special-fg", solid: "bg-special text-white", ring: "ring-special-border", text: "text-special-fg", dot: "bg-special" },
};
