"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Download, FileUp, Upload } from "lucide-react";
import type { Branch, BranchId, Pharmacy, Product, Supplier } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { parseImportSheet, productChanged, productKey, type ImportResult } from "@/lib/domain/product-import";
import { isValidSupplierDocument } from "@/lib/domain/purchasing";
import { readSpreadsheetFile } from "@/lib/excel/read-xlsx";
import { useCreatePurchase, useSaveProduct } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, td } from "@/components/ui/table";
import type { Tone } from "@/components/ui/tone";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { downloadImportTemplate } from "./export";

interface Props {
  isAdmin: boolean;
  branches: Branch[];
  allowed: BranchId[];
  defaultBranch: BranchId;
  products: Product[];
  suppliers: Supplier[];
  pharmacy: Pharmacy | undefined;
  onClose: () => void;
}

/**
 * Carga masiva desde Excel: crea o actualiza productos (solo administrador) y registra los lotes como un ingreso.
 * Se revisa todo antes de guardar; las filas con errores se omiten.
 */
export function ImportDialog({ isAdmin, branches, allowed, defaultBranch, products, suppliers, pharmacy, onClose }: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<BranchId>(allowed.includes(defaultBranch) ? defaultBranch : (allowed[0] ?? defaultBranch));
  const active = suppliers.filter((s) => s.active);
  const [supplierId, setSupplierId] = useState<number | null>(active[0]?.id ?? null);
  const [docNumber, setDocNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveProduct = useSaveProduct();
  const createPurchase = useCreatePurchase();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setReading(true);
    setReadError(null);
    setResult(null);
    try {
      setResult(parseImportSheet(await readSpreadsheetFile(file), products, Date.now()));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* Qué se va a hacer con cada fila válida */
  const plan = useMemo(() => {
    const rows = result?.rows ?? [];
    const valid = rows.filter((r) => r.errors.length === 0 && (isAdmin || r.matchId !== null));
    return {
      valid,
      invalid: rows.length - valid.length,
      /* Un producto nuevo puede venir en varias filas (un lote por fila): se crea una sola vez */
      newProducts: isAdmin ? [...new Map(valid.filter((r) => r.matchId === null).map((r) => [productKey(r.product), r])).values()] : [],
      changed: isAdmin ? valid.filter((r) => r.matchId !== null && productChanged(r, products)) : [],
      lots: valid.filter((r) => r.lot),
      blockedNew: isAdmin ? 0 : rows.filter((r) => r.errors.length === 0 && r.matchId === null).length,
    };
  }, [result, isAdmin, products]);

  const lotsCost = plan.lots.reduce((s, r) => s + r.lot!.units * r.lot!.unitCost, 0);
  const needsPurchase = plan.lots.length > 0;
  const docOk = !needsPurchase || isValidSupplierDocument(docNumber);
  const canSave = !saving && plan.valid.length > 0 && (plan.newProducts.length + plan.changed.length + plan.lots.length > 0) && (!needsPurchase || (!!supplierId && docOk));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const idFor = new Map<string, number>(); // producto nuevo → id creado
      let done = 0;
      for (const r of plan.newProducts) {
        setProgress(`Creando productos ${++done}/${plan.newProducts.length}`);
        const p = await saveProduct.mutateAsync({ input: r.product });
        idFor.set(productKey(r.product), p.id);
      }
      done = 0;
      for (const r of plan.changed) {
        setProgress(`Actualizando productos ${++done}/${plan.changed.length}`);
        await saveProduct.mutateAsync({ id: r.matchId!, input: r.product });
      }
      if (needsPurchase && supplierId) {
        setProgress("Registrando lotes");
        await createPurchase.mutateAsync({
          branchId,
          supplierId,
          document: docNumber.trim().toUpperCase(),
          items: plan.lots.map((r) => ({ productId: r.matchId ?? idFor.get(productKey(r.product))!, lotCode: r.lot!.lotCode, expiresOn: r.lot!.expiresOn, units: r.lot!.units, unitCost: r.lot!.unitCost })),
        });
      }
      notify(`Importación lista: ${plan.newProducts.length} productos nuevos, ${plan.changed.length} actualizados, ${plan.lots.length} lotes`);
      onClose();
    } catch (e) {
      setSaveError(`${errorMessage(e)} Lo que ya se guardó se mantiene; corrige el archivo y vuelve a importarlo.`);
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  return (
    <Dialog
      title="Importar productos y lotes desde Excel"
      description={isAdmin ? "Crea o actualiza productos del catálogo y registra sus lotes como un ingreso." : "Registra lotes de productos que ya están en el catálogo. Para productos nuevos, pide al administrador."}
      onClose={() => !saving && onClose()}
      size="xl"
      footer={
        <>
          <p className="mr-auto min-w-0 text-sm" role={saveError ? "alert" : undefined}>
            {saveError ? <span className="text-danger-fg">{saveError}</span> : progress ? <span className="text-fg-2">{progress}…</span> : null}
          </p>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave} loading={saving} onClick={() => void save()}>
            <Upload className="h-4 w-4" aria-hidden /> Importar {plan.valid.length} {plan.valid.length === 1 ? "fila" : "filas"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sunken p-3 text-sm">
          <p className="min-w-0 flex-1 basis-56 text-fg-2">
            1. Descarga la plantilla y llénala, una fila por lote. 2. Súbela aquí. Se aceptan <b>.xlsx</b> y <b>.csv</b>.
          </p>
          <Button size="sm" onClick={() => downloadImportTemplate(pharmacy)}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Plantilla
          </Button>
          <Button size="sm" variant="dark" loading={reading} onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" aria-hidden /> {fileName ? "Cambiar archivo" : "Elegir archivo"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>

        {readError && <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{readError}</p>}
        {result?.fatal && <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{result.fatal}</p>}

        {!result && !readError && (
          <Empty icon={FileUp} title="Elige un archivo para revisarlo">
            Nada se guarda hasta que confirmes. Verás cada fila con lo que se va a hacer y los errores a corregir.
          </Empty>
        )}

        {result && !result.fatal && (
          <>
            <div className="flex flex-wrap gap-2 text-xs" role="status" aria-live="polite">
              <Pill tone="ok">{plan.valid.length} listas</Pill>
              {plan.invalid > 0 && <Pill tone="bad">{plan.invalid} con errores (se omiten)</Pill>}
              {plan.newProducts.length > 0 && <Pill>{plan.newProducts.length} productos nuevos</Pill>}
              {plan.changed.length > 0 && <Pill>{plan.changed.length} productos con cambios</Pill>}
              {plan.lots.length > 0 && <Pill>{plan.lots.length} lotes · {soles(lotsCost)} sin IGV</Pill>}
              {plan.blockedNew > 0 && <Pill tone="bad">{plan.blockedNew} productos nuevos que solo el administrador puede crear</Pill>}
              {result.missingColumns.length > 0 && <span className="text-muted">Columnas que no vinieron (se usa lo del catálogo): {result.missingColumns.join(", ")}</span>}
            </div>

            {needsPurchase && (
              <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_2fr_1.3fr]">
                <Field label="Los lotes ingresan a">
                  <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={allowed.length < 2}>
                    {branches.filter((b) => allowed.includes(b.id)).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Proveedor">
                  <Select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}>
                    {active.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Factura, guía o inventario inicial" hint="Para el stock inicial usa, por ejemplo, INV-1" error={docNumber && !docOk ? "Serie y número: F001-00012345" : undefined}>
                  <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value.toUpperCase())} placeholder="F001-00012345" aria-invalid={!!docNumber && !docOk} />
                </Field>
              </div>
            )}

            {wide ? (
              <div className="max-h-[45dvh] overflow-y-auto rounded-xl border border-line">
                <Table minWidth={860} head={["Fila", "Producto", "Acción", "Lote", "Vence", { label: "Unid.", align: "right" }, { label: "Precio u.", align: "right" }, "Revisión"]}>
                  {result.rows.map((r) => {
                    const blocked = !isAdmin && r.matchId === null;
                    const bad = r.errors.length > 0 || blocked;
                    const action = r.matchId === null ? "Nuevo" : isAdmin && productChanged(r, products) ? "Actualiza" : "Ya existe";
                    return (
                      <tr key={r.line} className={bad ? "bg-danger-bg/50" : undefined}>
                        <td className={cn(td, "text-xs tabular-nums text-muted")}>{r.line}</td>
                        <td className={td}>
                          <p className="font-medium">
                            {r.product.name} <span className="font-normal text-muted">{r.product.conc}</span>
                          </p>
                          <p className="text-xs text-muted">{r.product.lab || "Sin laboratorio"} · {r.product.category || "Sin tipo"}</p>
                        </td>
                        <td className={td}>
                          <ActionChip action={action} />
                        </td>
                        <td className={cn(td, "text-xs tabular-nums")}>{r.lot?.lotCode || "—"}</td>
                        <td className={cn(td, "whitespace-nowrap text-xs tabular-nums")}>{r.lot?.expiresOn ? dateShort(r.lot.expiresOn) : "—"}</td>
                        <td className={cn(td, "text-right text-xs tabular-nums")}>{r.lot ? r.lot.units.toLocaleString("es-PE") : "—"}</td>
                        <td className={cn(td, "text-right text-xs tabular-nums")}>{soles(r.product.priceUnit)}</td>
                        <td className={cn(td, "max-w-[260px] text-xs")}>
                          <Review bad={bad} text={bad ? (blocked ? "Producto nuevo: solo el administrador puede crearlo" : r.errors.join(" · ")) : r.warnings.join(" · ") || "Lista"} />
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </div>
            ) : (
              <ul className="grid max-h-[45dvh] gap-2 overflow-y-auto">
                {result.rows.map((r) => {
                  const blocked = !isAdmin && r.matchId === null;
                  const bad = r.errors.length > 0 || blocked;
                  const action = r.matchId === null ? "Nuevo" : isAdmin && productChanged(r, products) ? "Actualiza" : "Ya existe";
                  return (
                    <li key={r.line}>
                      <Card padding="sm" className={cn(bad && "border-danger-border bg-danger-bg/50")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-caption tabular-nums text-muted">Fila {r.line}</span>
                          <ActionChip action={action} />
                        </div>
                        <p className="mt-1 font-semibold text-fg">
                          {r.product.name} <span className="font-normal text-muted">{r.product.conc}</span>
                        </p>
                        <p className="text-caption text-muted">{r.product.lab || "Sin laboratorio"} · {r.product.category || "Sin tipo"}</p>
                        <p className="mt-1 text-caption tabular-nums text-muted">
                          Lote {r.lot?.lotCode || "—"} · vence {r.lot?.expiresOn ? dateShort(r.lot.expiresOn) : "—"} · {r.lot ? r.lot.units.toLocaleString("es-PE") : "—"} unid. · {soles(r.product.priceUnit)} u.
                        </p>
                        <div className="mt-2 border-t border-line-soft pt-2 text-xs">
                          <Review bad={bad} text={bad ? (blocked ? "Producto nuevo: solo el administrador puede crearlo" : r.errors.join(" · ")) : r.warnings.join(" · ") || "Lista"} />
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Qué se hará con la fila: tono + texto (nuevo, actualiza o ya existe). */
function ActionChip({ action }: { action: "Nuevo" | "Actualiza" | "Ya existe" }) {
  const tone: Tone = action === "Nuevo" ? "info" : action === "Actualiza" ? "warning" : "neutral";
  return <Chip tone={tone}>{action}</Chip>;
}

/** Resultado de revisar la fila: icono + texto, con el color del tono. */
function Review({ bad, text }: { bad: boolean; text: string }) {
  return bad ? (
    <span className="flex gap-1 text-danger-fg">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {text}
    </span>
  ) : (
    <span className="flex gap-1 text-muted">
      <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0 text-success-fg" aria-hidden /> {text}
    </span>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone?: "ok" | "bad" }) {
  return <span className={cn("rounded-full px-2.5 py-1 font-semibold", tone === "ok" ? "bg-success-bg text-success-fg" : tone === "bad" ? "bg-danger-bg text-danger-fg" : "bg-sunken text-fg-2")}>{children}</span>;
}
