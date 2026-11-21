import { useEffect, useMemo, useState } from "react";

import {
  ApiRequestError,
  closeWorkOrder,
  createWorkOrder,
  fetchCustomerProvenance,
  fetchCustomers,
  fetchEquipment,
  fetchWorkOrder,
  fetchWorkOrders,
  formatOrdenFolio,
  registerCustomerApproval,
  saveDiagnosis,
  saveMaterial,
  transitionWorkOrder,
  uploadWorkOrderAttachment,
} from "../api/client.js";
import type { CustomerListItem, ProvenanceEntry, SerializedWorkOrder } from "../api/types.js";
import type { DevApiConfig } from "../config.js";
import { colonesToMinor, formatColones, lineTotals } from "../money.js";
import { enqueueMutation, openOfflineDatabase } from "../offline/mutation-queue.js";
import { statusLabel } from "../status-labels.js";
import { ApprovalBlock } from "./ApprovalBlock.js";
import { CabysRepuestosSearch } from "./CabysRepuestosSearch.js";

const STEPS = ["RECEIVED", "DIAGNOSED", "QUOTED", "APPROVED", "IN_PROGRESS", "VERIFIED", "CLOSED"] as const;
const MAX_ATTACHMENT = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type Props = {
  readonly config: DevApiConfig;
  readonly readOnly: boolean;
};

export function OrdersWorkspace(props: Props) {
  const [orders, setOrders] = useState<readonly SerializedWorkOrder[]>([]);
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(props.config.workOrderId);
  const [workOrder, setWorkOrder] = useState<SerializedWorkOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("Presión de succión fuera de rango");
  const [cabysCode, setCabysCode] = useState("8415109010100");
  const [quantity, setQuantity] = useState("1");
  const [priceInput, setPriceInput] = useState("1.500,00");
  const [tab, setTab] = useState<"diag" | "mat" | "hist">("diag");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<readonly ProvenanceEntry[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [equipment, setEquipment] = useState<readonly { id: string; serialNumber: string | null }[]>([]);
  const [equipmentId, setEquipmentId] = useState("");

  async function reloadList() {
    const [rows, people] = await Promise.all([
      fetchWorkOrders(props.config),
      fetchCustomers(props.config),
    ]);
    setOrders(rows);
    setCustomers(people);
  }

  async function openOrder(id: string) {
    setBusy(true);
    setError(null);
    setApprovalRequired(false);
    try {
      const order = await fetchWorkOrder(props.config, id);
      setWorkOrder(order);
      setSelectedId(order.id);
      const prov = await fetchCustomerProvenance(props.config, order.customerId).catch(() => null);
      setProvenance(prov?.provenance?.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reloadList().then(() => {
      if (props.config.workOrderId) void openOrder(props.config.workOrderId);
    });
  }, []);

  useEffect(() => {
    if (!customerId) {
      setEquipment([]);
      setEquipmentId("");
      return;
    }
    void fetchEquipment(props.config, customerId).then((rows) => {
      setEquipment(rows);
      setEquipmentId(rows[0]?.id ?? "");
    });
  }, [customerId, props.config]);

  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.legalName])), [customers]);
  const visible = orders.filter((order) => {
    const label = `${formatOrdenFolio(order.id)} ${names.get(order.customerId) ?? ""} ${order.equipmentId}`.toLowerCase();
    if (query && !label.includes(query.toLowerCase()) && !order.id.includes(query)) return false;
    if (filter === "OPEN") return !["CLOSED", "CANCELLED"].includes(order.status);
    if (filter === "APPROVAL") return order.status === "QUOTED" && !order.customerAuthorized;
    if (filter === "READY") return order.status === "VERIFIED";
    if (filter === "CLOSED") return order.status === "CLOSED";
    return true;
  });

  const priceMinor = colonesToMinor(priceInput);
  const totals = priceMinor === null ? null : lineTotals(priceMinor, Number(quantity));
  const stepIndex = workOrder ? STEPS.indexOf(workOrder.status as (typeof STEPS)[number]) : -1;

  async function act(run: () => Promise<void>) {
    if (props.readOnly) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      if (workOrder) await openOrder(workOrder.id);
      await reloadList();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && err.code === "ERR_WORK_ORDER_APPROVAL_REQUIRED") {
        setApprovalRequired(true);
      } else {
        setError(err instanceof Error ? err.message : "La acción no se pudo completar.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="rounded border border-[var(--border-subtle)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Órdenes</h2>
          <button type="button" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={props.readOnly} onClick={() => setShowNew(true)}>
            + Nueva orden
          </button>
        </div>
        <input className="mb-2 w-full rounded border border-[var(--border-subtle)] px-3 py-2 text-sm" placeholder="Folio, cliente o serie" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mb-2 flex flex-wrap gap-1 text-xs">
          {[
            ["ALL", "Todas"],
            ["OPEN", "En curso"],
            ["APPROVAL", "Sin aprobación"],
            ["READY", "Listas para cerrar"],
            ["CLOSED", "Cerradas"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={`touch rounded border px-2 ${filter === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border-subtle)]"}`} onClick={() => { if (id) setFilter(id); }}>
              {label}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {visible.map((order) => (
            <li key={order.id}>
              <button type="button" className="touch w-full px-1 text-left text-sm" onClick={() => void openOrder(order.id)}>
                <span className="num font-medium">{formatOrdenFolio(order.id)}</span>
                <span className="ml-2 text-xs text-[var(--ink-muted)]">{statusLabel(order.status)}</span>
                <span className="block text-xs">{names.get(order.customerId) ?? "Cliente"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        {showNew ? (
          <form
            className="mb-4 rounded border border-[var(--border-subtle)] bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                const created = await createWorkOrder(props.config, customerId, equipmentId);
                setShowNew(false);
                setSelectedId(created.id);
              });
            }}
          >
            <h2 className="mb-2 text-sm font-semibold">Recibir orden</h2>
            <label className="mb-2 block text-sm">
              Cliente
              <select className="mt-1 w-full rounded border px-2 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Seleccione un cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.legalName}</option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-sm">
              Equipo
              <select className="mt-1 w-full rounded border px-2 py-2" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.serialNumber ?? item.id}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white" disabled={busy || !customerId || !equipmentId}>Recibir orden</button>
          </form>
        ) : null}

        {error ? <p className="mb-3 text-sm text-red-800" role="alert">{error}</p> : null}
        <ApprovalBlock
          visible={approvalRequired || workOrder?.status === "QUOTED"}
          busy={busy || props.readOnly}
          onRegisterApproval={() => {
            if (!workOrder) return;
            void act(async () => {
              await registerCustomerApproval(props.config, workOrder.id);
              setApprovalRequired(false);
            });
          }}
        />

        {workOrder ? (
          <article className="rounded border border-[var(--border-subtle)] bg-white p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Orden de servicio</h2>
              <span className="num text-sm">{formatOrdenFolio(workOrder.id)}</span>
            </header>
            <ol className="mb-4 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4 lg:grid-cols-7">
              {STEPS.map((step, index) => (
                <li key={step} className={`rounded px-2 py-2 ${index < stepIndex ? "bg-emerald-50 text-emerald-800" : index === stepIndex ? "bg-sky-50 text-[var(--accent)]" : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"}`}>
                  {statusLabel(step)}
                </li>
              ))}
            </ol>
            <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--ink-muted)]">Estado</dt><dd>{statusLabel(workOrder.status)}</dd></div>
              <div><dt className="text-[var(--ink-muted)]">Cliente</dt><dd>{names.get(workOrder.customerId) ?? workOrder.customerLegalName ?? workOrder.customerId}</dd></div>
              <div><dt className="text-[var(--ink-muted)]">Equipo</dt><dd className="num">{workOrder.equipmentSerial ?? workOrder.equipmentId}</dd></div>
              <div><dt className="text-[var(--ink-muted)]">Presupuesto</dt><dd>{workOrder.materials?.length ? formatColones(workOrder.materials.reduce((sum, line) => sum + Number(line.unitPriceMinor) * Number(line.quantity), 0)) : "Aún no generado"}</dd></div>
              <div><dt className="text-[var(--ink-muted)]">Aprobación del cliente</dt><dd>{workOrder.customerAuthorized ? "Registrada" : "Pendiente"}</dd></div>
              <div><dt className="text-[var(--ink-muted)]">Factura</dt><dd>{workOrder.fiscalIntentId ? `Intención fiscal ${workOrder.fiscalIntentId}` : "Pendiente al cierre"}</dd></div>
            </dl>
            <div className="mb-3 flex flex-wrap gap-2">
              {workOrder.status === "DIAGNOSED" ? <button type="button" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={busy || props.readOnly} onClick={() => void act(() => transitionWorkOrder(props.config, workOrder.id, "QUOTED", workOrder.version).then(() => undefined))}>Generar presupuesto</button> : null}
              {workOrder.status === "APPROVED" ? <button type="button" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={busy || props.readOnly} onClick={() => void act(() => transitionWorkOrder(props.config, workOrder.id, "IN_PROGRESS", workOrder.version).then(() => undefined))}>Iniciar intervención</button> : null}
              {workOrder.status === "IN_PROGRESS" ? <button type="button" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={busy || props.readOnly} onClick={() => void act(() => transitionWorkOrder(props.config, workOrder.id, "VERIFIED", workOrder.version).then(() => undefined))}>Verificar trabajo</button> : null}
              {workOrder.status === "VERIFIED" ? <button type="button" className="touch rounded bg-[var(--accent)] px-3 text-sm text-white disabled:opacity-50" disabled={busy || props.readOnly} onClick={() => void act(() => closeWorkOrder(props.config, workOrder.id, workOrder.version).then(() => undefined))}>Cerrar y encolar comprobante</button> : null}
            </div>
            <div className="mb-3 flex gap-2 text-sm">
              <button type="button" className="touch rounded border px-3" onClick={() => setTab("diag")}>Diagnóstico y evidencia</button>
              <button type="button" className="touch rounded border px-3" onClick={() => setTab("mat")}>Materiales y CAByS</button>
              <button type="button" className="touch rounded border px-3" onClick={() => setTab("hist")}>Historial y procedencia</button>
            </div>
            {tab === "diag" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    if (typeof navigator !== "undefined" && navigator.onLine === false) {
                      const db = await openOfflineDatabase(indexedDB);
                      await enqueueMutation(db, {
                        clientMutationId: crypto.randomUUID(),
                        workOrderId: workOrder.id,
                        expectedVersion: workOrder.version,
                        kind: "diagnosis",
                        payload: { notes, measurements: { succionPsi: 68 } },
                        enqueuedAt: new Date().toISOString(),
                      });
                      setError("Diagnóstico en cola. Se enviará al reconectar.");
                      return;
                    }
                    await saveDiagnosis(props.config, workOrder.id, notes, { succionPsi: 68 });
                    if (workOrder.status === "RECEIVED") {
                      await transitionWorkOrder(props.config, workOrder.id, "DIAGNOSED", workOrder.version);
                    }
                  });
                }}
              >
                <label className="block text-sm">Diagnóstico
                  <input className="mt-1 w-full rounded border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <button type="submit" className="touch mt-2 rounded border px-3 text-sm" disabled={busy || props.readOnly}>Guardar diagnóstico</button>
                <label className="mt-3 block text-sm">Evidencia (foto o PDF)
                  <input
                    className="mt-1 w-full"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setFileError(null);
                      setPreview(null);
                      if (!file) return;
                      if (!ALLOWED.has(file.type) || file.size > MAX_ATTACHMENT) {
                        setFileError("El archivo debe ser JPEG, PNG, WEBP o PDF de hasta 5 MiB.");
                        event.target.value = "";
                        return;
                      }
                      if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
                      void act(() => uploadWorkOrderAttachment(props.config, workOrder.id, file));
                    }}
                  />
                </label>
                {fileError ? <p className="text-sm text-amber-800" role="alert">{fileError}</p> : null}
                {preview ? <img alt="Vista previa del adjunto" className="mt-2 max-h-40 rounded border" src={preview} /> : null}
              </form>
            ) : null}
            {tab === "mat" ? (
              <div>
                <CabysRepuestosSearch config={props.config} onPick={setCabysCode} />
                <form
                  className="mt-3 grid gap-2 text-sm sm:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (priceMinor === null) {
                      setError("Escriba el precio en colones, por ejemplo 1.500,00.");
                      return;
                    }
                    void act(() => saveMaterial(props.config, workOrder.id, {
                      cabysCode,
                      quantity,
                      unitPriceMinor: priceMinor,
                      taxRate: "0.13",
                    }));
                  }}
                >
                  <label>CAByS<input className="num mt-1 w-full rounded border px-2 py-2" value={cabysCode} onChange={(e) => setCabysCode(e.target.value)} /></label>
                  <label>Cantidad<input className="num mt-1 w-full rounded border px-2 py-2" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
                  <label>Precio (₡)<input className="num mt-1 w-full rounded border px-2 py-2" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} /></label>
                  {totals ? <p className="num sm:col-span-3">Subtotal {formatColones(totals.subtotalMinor)} · IVA 13% {formatColones(totals.taxMinor)} · Total {formatColones(totals.totalMinor)}</p> : null}
                  <button type="submit" className="touch w-fit rounded border px-3" disabled={busy || props.readOnly}>Agregar material con IVA 13%</button>
                </form>
                <ul className="mt-2 text-sm">
                  {workOrder.materials?.map((material) => (
                    <li key={`${material.cabysCode}-${material.unitPriceMinor}`} className="num">
                      CAByS {material.cabysCode} · {material.quantity} · {formatColones(Number(material.unitPriceMinor))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tab === "hist" ? (
              <div className="text-sm">
                <button type="button" className="text-[var(--accent)] underline">¿De dónde viene este dato?</button>
                {provenance && provenance.length === 0 ? <p className="mt-2">Sin registros de migración para este cliente.</p> : null}
                <ul className="mt-2 list-disc pl-5">
                  {provenance?.map((entry) => (
                    <li key={entry.id}>{entry.fieldPath} — {entry.originKind}{entry.artifactName ? ` — archivo ${entry.artifactName}` : ""}{entry.sourceLocator ? ` — fila ${entry.sourceLocator}` : ""}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">{selectedId ? "Cargando la orden…" : "Seleccione una orden de la bandeja."}</p>
        )}
      </section>
    </div>
  );
}
