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

/* ------------------------------ Digi!HME (la plataforma) ------------------------------ */

export const DIGIHME = { name: "Digi!HME", navy: "#313572", ink: "#0C1136", cyan: "#34C4CC" } as const;

/** Isotipo de Digi!HME (la D con circuitos). Funciona sobre fondos claros y oscuros. */
export function DigiHmeIcon({ size = 24, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  // El archivo de 256 px reducido a ~18 px se ve borroso: para tamaños chicos hay uno de 72 px.
  const src = size <= 36 ? "/brand/digihme-icon-72.png" : "/brand/digihme-icon.png";
  return <img src={src} width={size} height={size} alt="" aria-hidden className={className} />;
}

/** Logo completo de Digi!HME. Las letras son azul oscuro: con el tema oscuro va sobre una placa blanca. */
export function DigiHmeLogo({ height = 28, className }: { height?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  // El original mide 1200 px; en pantalla se usa a 26-34 px de alto y reducirlo tanto en el navegador lo deja áspero.
  const src = height <= 60 ? "/brand/digihme-logo-480.png" : "/brand/digihme-logo.png";
  return <img src={src} width={Math.round(height * 4.1)} height={height} style={{ height, width: "auto" }} alt="Digi!HME" className={`dark:box-content dark:rounded-lg dark:bg-white dark:p-1.5 ${className ?? ""}`} />;
}

/** Nombre escrito con el "!" en cian. Sobre fondo oscuro va en blanco. */
export function DigiHmeName({ light, className }: { light?: boolean; className?: string }) {
  return (
    <b className={`font-black tracking-tight ${className ?? ""}`} style={{ color: light ? "#fff" : DIGIHME.navy }}>
      Dig<span style={{ color: DIGIHME.cyan }}>!</span>HME
    </b>
  );
}

/** Sello "Desarrollado por Digi!HME" del pie de la barra lateral y del ingreso. */
export function DigiSeal({ light }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-micro ${light ? "text-white/80" : "text-muted"}`}>
      Desarrollado por
      <DigiHmeIcon size={18} />
      <DigiHmeName light={light} className="text-xs" />
    </span>
  );
}
