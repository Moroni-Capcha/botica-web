const money = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const soles = (n: number) => `S/ ${money.format(Math.round((n || 0) * 100) / 100)}`;

export const dateShort = (iso: string | number) => {
  const d = typeof iso === "number" ? new Date(iso) : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const timeShort = (iso: string | number) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

export const initials = (name: string) =>
  name
    .replace(/^Q\.F\.\s*/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
