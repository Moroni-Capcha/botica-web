"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import type { Branch, MarkType, Worker, WorkerInput } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { DOW, MARK_LABEL, scheduleError } from "@/lib/domain/attendance";
import { useManualMark, useSaveWorker } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Marca manual para olvidos o fallas del equipo. Queda identificada, con el motivo y quién la registró. */
export function ManualMarkDialog({ workers, branchName, initialWorkerId, onClose }: { workers: Worker[]; branchName: (id: string) => string; initialWorkerId?: string; onClose: () => void }) {
  const [workerId, setWorkerId] = useState(initialWorkerId ?? workers[0]?.id ?? "");
  const [type, setType] = useState<MarkType>("entrada");
  const [date, setDate] = useState(isoDay());
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const save = useManualMark();
  const w = workers.find((x) => x.id === workerId);
  const at = date && time ? new Date(`${date}T${time}:00`) : null;
  const future = at ? at.getTime() > Date.now() : false;
  const ok = !!w && !!at && !future && note.trim().length >= 5;

  const submit = () => {
    if (!ok || !at) return;
    save.mutate(
      { workerId, type, at: at.toISOString(), note: note.trim() },
      {
        onSuccess: () => {
          notify(`${MARK_LABEL[type]} manual registrada para ${w!.name}`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title="Registrar marca manual"
      description="Para olvidos o fallas del equipo. Queda marcada como manual, con el motivo y tu nombre."
      onClose={onClose}
      footer={
        <>
          {save.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(save.error)}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!ok} loading={save.isPending} onClick={submit}>
            <Save className="h-4 w-4" /> Registrar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Trabajador" className="sm:col-span-2">
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            {workers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {branchName(x.branchId)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de marca" className="sm:col-span-2">
          <Select value={type} onChange={(e) => setType(e.target.value as MarkType)}>
            {(Object.keys(MARK_LABEL) as MarkType[]).map((k) => (
              <option key={k} value={k}>{MARK_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora" error={future ? "No puede ser en el futuro" : undefined}>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Motivo" className="sm:col-span-2" hint="Mínimo 5 caracteres">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: olvidó marcar la salida; confirmado por cámaras" maxLength={160} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

const EMPTY: WorkerInput = { name: "", role: "Técnico en farmacia", branchId: "principal", schedule: { start: "08:00", end: "16:00", days: [1, 2, 3, 4, 5, 6] }, active: true, pin: "" };

/** Alta y edición de trabajadores: datos, local, horario y PIN de marcación. */
export function WorkerDialog({ worker, branches, onClose }: { worker: Worker | null; branches: Branch[]; onClose: () => void }) {
  const [f, setF] = useState<WorkerInput>(() => (worker ? { ...worker, schedule: { ...worker.schedule, days: [...worker.schedule.days] }, pin: "" } : { ...EMPTY, branchId: branches[0]?.id ?? "principal" }));
  const [tried, setTried] = useState(false);
  const save = useSaveWorker();
  const set = <K extends keyof WorkerInput>(k: K, v: WorkerInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const setSchedule = (patch: Partial<WorkerInput["schedule"]>) => setF((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }));

  const errors = {
    name: f.name.trim().length < 3 ? "Escribe el nombre completo" : undefined,
    role: !f.role.trim() ? "Escribe el cargo" : undefined,
    schedule: scheduleError(f.schedule) ?? undefined,
    pin: worker ? (f.pin && !/^\d{4}$/.test(f.pin) ? "4 dígitos" : undefined) : !/^\d{4}$/.test(f.pin) ? "4 dígitos" : undefined,
  };
  const ok = !Object.values(errors).some(Boolean);

  const submit = () => {
    setTried(true);
    if (!ok) return;
    save.mutate(
      { id: worker?.id, input: { ...f, name: f.name.trim(), role: f.role.trim() } },
      {
        onSuccess: () => {
          notify(worker ? "Trabajador actualizado" : "Trabajador registrado. Ya puede marcar con su PIN.");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      title={worker ? `Editar ${worker.name}` : "Nuevo trabajador"}
      onClose={onClose}
      footer={
        <>
          {save.error && <p className="mr-auto text-sm text-rose-600" role="alert">{errorMessage(save.error)}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nombre completo" error={tried ? errors.name : undefined} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={tried && !!errors.name} />
        </Field>
        <Field label="Cargo" error={tried ? errors.role : undefined}>
          <Input list="worker-roles" value={f.role} onChange={(e) => set("role", e.target.value)} />
          <datalist id="worker-roles">
            {["Químico farmacéutico", "Técnico en farmacia", "Técnica en farmacia", "Cajera", "Cajero", "Almacenero", "Limpieza"].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Local">
          <Select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Hora de entrada">
          <Input type="time" value={f.schedule.start} onChange={(e) => setSchedule({ start: e.target.value })} />
        </Field>
        <Field label="Hora de salida" error={tried ? errors.schedule : undefined}>
          <Input type="time" value={f.schedule.end} onChange={(e) => setSchedule({ end: e.target.value })} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-medium text-zinc-600">Días que trabaja</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = f.schedule.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSchedule({ days: on ? f.schedule.days.filter((x) => x !== d) : [...f.schedule.days, d] })}
                  className={cn("h-9 w-12 rounded-lg text-xs font-semibold transition", on ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}
                >
                  {DOW[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label={worker ? "Nuevo PIN (vacío = no cambia)" : "PIN de marcación"} error={tried ? errors.pin : undefined} hint="4 dígitos, distinto al PIN de la cuenta del local">
          <Input inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="tabular-nums tracking-[0.3em]" autoComplete="off" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Activo (puede marcar)
        </label>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
