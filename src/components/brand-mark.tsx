/** Cruz de botica con cápsula. Los colores salen de las variables de marca. */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      <rect x="1" y="1" width="46" height="46" rx="14" fill="#fff" />
      <path d="M19 9h10v10h10v10H29v10H19V29H9V19h10z" fill="var(--brand)" />
      <rect x="18.5" y="20" width="11" height="8" rx="4" fill="var(--accent)" transform="rotate(-35 24 24)" />
    </svg>
  );
}

export function DigiSeal({ light }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${light ? "text-white/45" : "text-zinc-400"}`}>
      Desarrollado por <b className="font-black" style={{ color: light ? "#fff" : "#1B1D4F" }}>Dig<span style={{ color: "#22C7D6" }}>!</span>HME</b>
    </span>
  );
}
