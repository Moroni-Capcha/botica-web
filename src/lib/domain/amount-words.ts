import { round2 } from "./pharmacy";

// Monto en letras para el ticket, al estilo SUNAT:
// 114.8 -> "SON: CIENTO CATORCE Y 80/100 SOLES".

const UNIDADES = [
  "", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS",
  "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUN", "VEINTIDOS",
  "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE",
  "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

const MAX = 999_999_999;

/** 1..999 con "UN" apocopado al final (la unidad siempre queda antes de SOLES/MIL/MILLON). */
function bajoMil(n: number): string {
  if (n === 100) return "CIEN";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c] ?? "");
  if (resto > 0) {
    if (resto < 30) partes.push(UNIDADES[resto] ?? "");
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u === 0 ? (DECENAS[d] ?? "") : `${DECENAS[d] ?? ""} Y ${UNIDADES[u] ?? ""}`);
    }
  }
  return partes.join(" ");
}

function entero(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) partes.push(millones === 1 ? "UN MILLON" : `${bajoMil(millones)} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${bajoMil(miles)} MIL`);
  if (resto > 0) partes.push(bajoMil(resto));
  return partes.join(" ");
}

/** Línea "SON: ... Y NN/100 SOLES". Devuelve "" si el monto es negativo, no finito o pasa de 999 999 999.99. */
export function amountInWords(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "";
  const centimos = Math.round(round2(total) * 100);
  const soles = Math.floor(centimos / 100);
  if (soles > MAX) return "";
  const cents = String(centimos % 100).padStart(2, "0");
  return `SON: ${entero(soles)} Y ${cents}/100 SOLES`;
}
