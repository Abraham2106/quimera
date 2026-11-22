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
import {
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  HistoryIcon,
  PackageIcon,
  SearchIcon,
  WrenchIcon,
} from "./Icons.js";
import { ProvenanceDisclosure } from "./ProvenanceDisclosure.js";

const STEPS = [
  { status: "RECEIVED", short: "Recibida" },
  { status: "DIAGNOSED", short: "Diagnóstico" },
  { status: "QUOTED", short: "Presupuesto" },
  { status: "APPROVED", short: "Aprobada" },
  { status: "IN_PROGRESS", short: "Intervención" },
  { status: "VERIFIED", short: "Verificada" },
  { status: "CLOSED", short: "Cerrada" },
] as const;

const MAX_ATTACHMENT = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type Props = {
  readonly config: DevApiConfig;
  readonly readOnly: boolean;
};

function statusPillClasses(status: string): string {
  if (status === "CLOSED" || status === "VERIFIED") {
    return "border-emerald-200 bg-[var(--status-done)] text-[var(--status-done-ink)]";
  }
  if (status === "QUOTED") {
    return "border-amber-300 bg-[var(--status-warn)] text-[var(--status-warn-ink)]";
  }
  if (status === "IN_PROGRESS" || status === "APPROVED") {
    return "border-sky-200 bg-[var(--status-now)] text-[var(--status-now-ink)]";
  }
  return "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink)]";
}

export function OrdersWorkspace(props: Props) {
  const [orders, setOrders] = useState<readonly SerializedWorkOrder[]>([]);
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(props.config.workOrderId);
  const [workOrder, setWorkOrder] = useState<SerializedWorkOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    return rows;
  }

  async function openOrder(id: string) {
    setBusy(true);
    setError(null);
    setApprovalRequired(false);
    try {
      const order = await fetchWorkOrder(props.config, id);
      setWorkOrder(order);
      setSelectedId(order.id);
      const latestNotes = order.diagnoses?.[0]?.notes;
      if (latestNotes) setNotes(latestNotes);
      const prov = await fetchCustomerProvenance(props.config, order.customerId).catch(() => null);
      setProvenance(prov?.provenance?.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reloadList().then((rows) => {
      const initialId = props.config.workOrderId || rows[0]?.id || "";
      if (initialId) void openOrder(initialId);
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

  const counts = useMemo(
    () => ({
      ALL: orders.length,
      OPEN: orders.filter((order) => !["CLOSED", "CANCELLED"].includes(order.status)).length,
      APPROVAL: orders.filter((order) => order.status === "QUOTED" && !order.customerAuthorized).length,
      READY: orders.filter((order) => order.status === "VERIFIED").length,
      CLOSED: orders.filter((order) => order.status === "CLOSED").length,
    }),
    [orders],
  );

  const visible = orders.filter((order) => {
    const label = `${formatOrdenFolio(order.id)} ${names.get(order.customerId) ?? ""} ${order.equipmentSerial ?? order.equipmentId}`.toLowerCase();
    if (query && !label.includes(query.toLowerCase()) && !order.id.includes(query)) return false;
    if (filter === "OPEN") return !["CLOSED", "CANCELLED"].includes(order.status);
    if (filter === "APPROVAL") return order.status === "QUOTED" && !order.customerAuthorized;
    if (filter === "READY") return order.status === "VERIFIED";
    if (filter === "CLOSED") return order.status === "CLOSED";
    return true;
  });

  const priceMinor = colonesToMinor(priceInput);
  const totals = priceMinor === null ? null : lineTotals(priceMinor, Number(quantity));
  const stepIndex = workOrder ? STEPS.findIndex((s) => s.status === workOrder.status) : -1;
  const budgetMinor =
    workOrder?.materials?.reduce((sum, line) => sum + Number(line.unitPriceMinor) * Number(line.quantity), 0) ?? 0;

  async function act(run: () => Promise<void>, successMessage?: string) {
    if (props.readOnly) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      if (workOrder) await openOrder(workOrder.id);
      await reloadList();
      if (successMessage) setNotice(successMessage);
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
    <div className="space-y-6">
      <p className="num text-sm text-[var(--ink-muted)]">
        {counts.OPEN} en curso · {counts.APPROVAL} sin aprobación · {counts.READY} listas para cerrar · {counts.CLOSED} cerradas
      </p>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        {/* Left inbox column */}
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]/75 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">Órdenes</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  {visible.length} {visible.length === 1 ? "orden visible" : "órdenes visibles"}
                </p>
              </div>
              <button
                type="button"
                className="touch btn-primary text-xs"
                disabled={props.readOnly}
                onClick={() => setShowNew((open) => !open)}
              >
                + Nueva orden
              </button>
            </div>

            <div className="relative mt-3">
              <SearchIcon
                width={16}
                height={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
              />
              <input
                className="field pl-9"
                placeholder="Folio, cliente o serie"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["ALL", "Todas", counts.ALL],
                  ["OPEN", "En curso", counts.OPEN],
                  ["APPROVAL", "Sin aprobación", counts.APPROVAL],
                  ["READY", "Listas para cerrar", counts.READY],
                  ["CLOSED", "Cerradas", counts.CLOSED],
                ] as const
              ).map(([id, label, count]) => {
                const active = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`touch inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                      active
                        ? "border-[var(--surface-rail)] bg-[var(--surface-rail)] text-white"
                        : "border-[var(--border-subtle)] bg-white text-[var(--ink-muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setFilter(id)}
                  >
                    <span>{label}</span>
                    <span
                      className={`num rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-white/20 text-white" : "bg-[var(--surface-muted)] text-[var(--ink)]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="divide-y divide-[var(--border-subtle)]">
            {visible.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                No hay órdenes para este filtro.
              </li>
            ) : (
              visible.map((order) => {
                const selected = selectedId === order.id;
                const customerName = names.get(order.customerId) ?? order.customerLegalName ?? "Cliente";
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className={`touch relative flex w-full flex-col gap-1.5 px-4 py-3.5 text-left transition-colors ${
                        selected
                          ? "bg-[var(--accent-tint)]/75"
                          : "bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
                      }`}
                      onClick={() => void openOrder(order.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-sm font-bold text-[var(--ink)]">
                          {formatOrdenFolio(order.id)}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusPillClasses(order.status)}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </div>
                      <span className="truncate text-sm font-medium text-[var(--ink)]">{customerName}</span>
                      <span className="num truncate text-xs text-[var(--ink-muted)]">
                        {order.equipmentSerial ? `Serie ${order.equipmentSerial}` : `Equipo ${order.equipmentId.slice(0, 8)}`}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* Right detail workspace */}
        <section className="space-y-4">
          {showNew ? (
            <form
              className="card p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  const created = await createWorkOrder(props.config, customerId, equipmentId);
                  setShowNew(false);
                  await openOrder(created.id);
                }, "Orden recibida correctamente.");
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">Recibir orden</h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Seleccione cliente y equipo para abrir una nueva orden de servicio.
                  </p>
                </div>
                <button
                  type="button"
                  className="touch btn-secondary text-xs"
                  onClick={() => setShowNew(false)}
                >
                  Cancelar
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-[var(--ink)]">
                  Cliente
                  <select
                    className="field mt-1"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Seleccione un cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.legalName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[var(--ink)]">
                  Equipo
                  <select
                    className="field mt-1"
                    value={equipmentId}
                    onChange={(e) => setEquipmentId(e.target.value)}
                  >
                    {equipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.serialNumber ?? item.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  className="touch btn-primary"
                  disabled={busy || !customerId || !equipmentId}
                >
                  Recibir orden
                </button>
              </div>
            </form>
          ) : null}

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              className="rounded-xl border border-emerald-200 bg-[var(--status-done)] px-4 py-3 text-sm font-medium text-[var(--status-done-ink)]"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          <ApprovalBlock
            visible={approvalRequired || workOrder?.status === "QUOTED"}
            busy={busy || props.readOnly}
            onRegisterApproval={() => {
              if (!workOrder) return;
              void act(async () => {
                await registerCustomerApproval(props.config, workOrder.id);
                setApprovalRequired(false);
              }, "Aprobación del cliente registrada.");
            }}
          />

          {workOrder ? (
            <article className="card overflow-hidden">
              {/* Top work order header + primary action */}
              <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]/55 px-5 py-4 sm:px-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[var(--ink-muted)]">Orden de servicio</p>
                    <h2 className="display num mt-1 text-4xl text-[var(--ink)]">
                      {formatOrdenFolio(workOrder.id)}
                    </h2>
                    <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClasses(workOrder.status)}`}>
                      {statusLabel(workOrder.status)}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                      {names.get(workOrder.customerId) ?? workOrder.customerLegalName ?? workOrder.customerId}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {workOrder.status === "DIAGNOSED" ? (
                      <button
                        type="button"
                        className="touch btn-primary"
                        disabled={busy || props.readOnly}
                        onClick={() =>
                          void act(
                            () =>
                              transitionWorkOrder(
                                props.config,
                                workOrder.id,
                                "QUOTED",
                                workOrder.version,
                              ).then(() => undefined),
                            "Presupuesto generado.",
                          )
                        }
                      >
                        <span>Generar presupuesto</span>
                        <ArrowRightIcon width={16} height={16} />
                      </button>
                    ) : null}
                    {workOrder.status === "APPROVED" ? (
                      <button
                        type="button"
                        className="touch btn-primary"
                        disabled={busy || props.readOnly}
                        onClick={() =>
                          void act(
                            () =>
                              transitionWorkOrder(
                                props.config,
                                workOrder.id,
                                "IN_PROGRESS",
                                workOrder.version,
                              ).then(() => undefined),
                            "Intervención iniciada.",
                          )
                        }
                      >
                        <span>Iniciar intervención</span>
                        <ArrowRightIcon width={16} height={16} />
                      </button>
                    ) : null}
                    {workOrder.status === "IN_PROGRESS" ? (
                      <button
                        type="button"
                        className="touch btn-primary"
                        disabled={busy || props.readOnly}
                        onClick={() =>
                          void act(
                            () =>
                              transitionWorkOrder(
                                props.config,
                                workOrder.id,
                                "VERIFIED",
                                workOrder.version,
                              ).then(() => undefined),
                            "Trabajo verificado.",
                          )
                        }
                      >
                        <span>Verificar trabajo</span>
                        <ArrowRightIcon width={16} height={16} />
                      </button>
                    ) : null}
                    {workOrder.status === "VERIFIED" ? (
                      <button
                        type="button"
                        className="touch btn-primary"
                        disabled={busy || props.readOnly}
                        onClick={() =>
                          void act(
                            () =>
                              closeWorkOrder(props.config, workOrder.id, workOrder.version).then(
                                () => undefined,
                              ),
                            "Orden cerrada y comprobante encolado.",
                          )
                        }
                      >
                        <span>Cerrar y encolar comprobante</span>
                        <ArrowRightIcon width={16} height={16} />
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="mt-6">
                  <div
                    className="stage-rail"
                    aria-hidden="true"
                  >
                    <span
                      style={{
                        width: `${Math.min(100, ((Math.max(stepIndex, 0) + 0.08) / (STEPS.length - 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <ol className="mt-3 grid grid-cols-4 gap-x-2 gap-y-2 sm:grid-cols-7">
                    {STEPS.map((step, index) => {
                      const done = index < stepIndex;
                      const current = index === stepIndex;
                      return (
                        <li
                          key={step.status}
                          className={`text-[11px] leading-tight ${
                            current
                              ? "font-medium text-[var(--accent)]"
                              : done
                                ? "text-[var(--ink)]"
                                : "text-[var(--ink-muted)]"
                          }`}
                          title={statusLabel(step.status)}
                        >
                          {done ? <CheckIcon width={12} height={12} className="mr-1 inline" /> : null}
                          {step.short}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {/* Summary metadata tiles */}
                <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Estado
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {statusLabel(workOrder.status)}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Cliente
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {names.get(workOrder.customerId) ?? workOrder.customerLegalName ?? workOrder.customerId}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Equipo
                    </dt>
                    <dd className="num mt-1 break-all text-sm font-semibold text-[var(--ink)]">
                      {workOrder.equipmentSerial ?? workOrder.equipmentId}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Presupuesto
                    </dt>
                    <dd className="num mt-1 text-sm font-semibold text-[var(--ink)]">
                      {workOrder.materials?.length ? formatColones(budgetMinor) : "Aún no generado"}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Aprobación del cliente
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {workOrder.customerAuthorized ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--status-done-ink)]">
                          <CheckIcon width={14} height={14} />
                          Registrada
                        </span>
                      ) : (
                        <span className="text-[var(--ink-muted)]">Pendiente</span>
                      )}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <dt className="text-xs font-medium text-[var(--ink-muted)]">
                      Factura
                    </dt>
                    <dd className="num mt-1 text-sm font-semibold text-[var(--ink)]">
                      {workOrder.fiscalIntentId
                        ? `Intención fiscal ${workOrder.fiscalIntentId.slice(0, 8)}`
                        : "Pendiente al cierre"}
                    </dd>
                  </div>
                </dl>

                {/* Active underline tab bar */}
                <div className="mb-5 flex flex-wrap gap-1 border-b border-[var(--border-subtle)]">
                  <button
                    type="button"
                    className={`touch relative inline-flex items-center gap-2 px-4 text-sm transition-colors ${
                      tab === "diag"
                        ? "font-semibold text-[var(--accent)]"
                        : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setTab("diag")}
                  >
                    <WrenchIcon width={16} height={16} />
                    <span>Diagnóstico y evidencia</span>
                    {tab === "diag" ? (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </button>

                  <button
                    type="button"
                    className={`touch relative inline-flex items-center gap-2 px-4 text-sm transition-colors ${
                      tab === "mat"
                        ? "font-semibold text-[var(--accent)]"
                        : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setTab("mat")}
                  >
                    <PackageIcon width={16} height={16} />
                    <span>Materiales y CAByS</span>
                    {workOrder.materials?.length ? (
                      <span className="num rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink)]">
                        {workOrder.materials.length}
                      </span>
                    ) : null}
                    {tab === "mat" ? (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </button>

                  <button
                    type="button"
                    className={`touch relative inline-flex items-center gap-2 px-4 text-sm transition-colors ${
                      tab === "hist"
                        ? "font-semibold text-[var(--accent)]"
                        : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setTab("hist")}
                  >
                    <HistoryIcon width={16} height={16} />
                    <span>Historial y procedencia</span>
                    {tab === "hist" ? (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </button>
                </div>

                {/* Tab 1: Diagnosis & Evidence */}
                {tab === "diag" ? (
                  <div className="grid gap-5 xl:grid-cols-2">
                    <form
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-4"
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
                            await transitionWorkOrder(
                              props.config,
                              workOrder.id,
                              "DIAGNOSED",
                              workOrder.version,
                            );
                          }
                        }, "Diagnóstico guardado.");
                      }}
                    >
                      <label className="block text-sm font-semibold text-[var(--ink)]">
                        Diagnóstico
                        <textarea
                          className="field mt-2 min-h-[116px] resize-y"
                          rows={4}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          disabled={props.readOnly}
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[var(--ink-muted)]">
                          Sin señal se guarda automáticamente en la cola local.
                        </span>
                        <button
                          type="submit"
                          className="touch btn-primary"
                          disabled={busy || props.readOnly}
                        >
                          Guardar diagnóstico
                        </button>
                      </div>
                    </form>

                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-4">
                      <p className="text-sm font-semibold text-[var(--ink)]">Evidencia (foto o PDF)</p>
                      <label className="mt-2.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-white px-4 py-6 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-tint)]/30">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-tint)] text-[var(--accent)]">
                          <CameraIcon width={20} height={20} />
                        </span>
                        <span className="mt-2.5 text-sm font-semibold text-[var(--ink)]">
                          Tomar foto o adjuntar archivo
                        </span>
                        <span className="mt-0.5 text-xs text-[var(--ink-muted)]">
                          Formatos JPEG, PNG, WEBP o PDF
                        </span>
                        <input
                          className="sr-only"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          capture="environment"
                          disabled={props.readOnly || busy}
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
                            void act(
                              () => uploadWorkOrderAttachment(props.config, workOrder.id, file),
                              `Evidencia ${file.name} cargada.`,
                            );
                          }}
                        />
                      </label>
                      {fileError ? (
                        <p className="mt-2.5 text-sm text-amber-800" role="alert">
                          {fileError}
                        </p>
                      ) : null}
                      {preview ? (
                        <img
                          alt="Vista previa del adjunto"
                          className="mt-3 max-h-40 rounded-xl border border-[var(--border-subtle)] shadow-xs"
                          src={preview}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Tab 2: Materials & CAByS */}
                {tab === "mat" ? (
                  <div className="space-y-4">
                    <CabysRepuestosSearch config={props.config} onPick={setCabysCode} />

                    <form
                      className="rounded-xl border border-[var(--border-subtle)] bg-white p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (priceMinor === null) {
                          setError("Escriba el precio en colones, por ejemplo 1.500,00.");
                          return;
                        }
                        void act(
                          () =>
                            saveMaterial(props.config, workOrder.id, {
                              cabysCode,
                              quantity,
                              unitPriceMinor: priceMinor,
                              taxRate: "0.13",
                            }),
                          "Material agregado con IVA 13%.",
                        );
                      }}
                    >
                      <h3 className="text-sm font-semibold text-[var(--ink)]">Agregar línea al presupuesto</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-medium text-[var(--ink)]">
                          CAByS
                          <input
                            className="field num mt-1"
                            value={cabysCode}
                            onChange={(e) => setCabysCode(e.target.value)}
                          />
                        </label>
                        <label className="text-xs font-medium text-[var(--ink)]">
                          Cantidad
                          <input
                            className="field num mt-1"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                          />
                        </label>
                        <label className="text-xs font-medium text-[var(--ink)]">
                          Precio (₡)
                          <input
                            className="field num mt-1"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-subtle)] px-4 py-3">
                        {totals ? (
                          <p className="num text-xs font-medium text-[var(--ink)]">
                            {`Subtotal ${formatColones(totals.subtotalMinor)} · IVA 13% ${formatColones(totals.taxMinor)} · Total ${formatColones(totals.totalMinor)}`}
                          </p>
                        ) : (
                          <span className="text-xs text-[var(--ink-muted)]">Ingrese un precio válido en colones.</span>
                        )}
                        <button
                          type="submit"
                          className="touch btn-primary"
                          disabled={busy || props.readOnly}
                        >
                          Agregar material con IVA 13%
                        </button>
                      </div>
                    </form>

                    {workOrder.materials?.length ? (
                      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-[var(--border-subtle)] text-xs font-medium text-[var(--ink-muted)]">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Código CAByS</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Cant.</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Precio unitario</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Total c/ IVA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {workOrder.materials.map((material) => {
                              const rowTotals = lineTotals(
                                Number(material.unitPriceMinor),
                                Number(material.quantity),
                              );
                              return (
                                <tr
                                  key={`${material.cabysCode}-${material.unitPriceMinor}-${material.quantity}`}
                                  className="hover:bg-[var(--surface-subtle)]/50"
                                >
                                  <td className="num px-4 py-2.5 font-medium text-[var(--ink)]">
                                    CAByS {material.cabysCode}
                                  </td>
                                  <td className="num px-4 py-2.5 text-right text-[var(--ink)]">
                                    {material.quantity}
                                  </td>
                                  <td className="num px-4 py-2.5 text-right text-[var(--ink-muted)]">
                                    {`c/u ${formatColones(Number(material.unitPriceMinor))}`}
                                  </td>
                                  <td className="num px-4 py-2.5 text-right font-semibold text-[var(--ink)]">
                                    {formatColones(rowTotals.totalMinor)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Tab 3: History & Provenance */}
                {tab === "hist" ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-4">
                    <ProvenanceDisclosure entries={provenance} loading={false} error={null} />
                  </div>
                ) : null}
              </div>
            </article>
          ) : (
            <div className="card flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--ink-muted)]">
                <WrenchIcon width={22} height={22} />
              </span>
              <p className="mt-3 text-sm font-semibold text-[var(--ink)]">
                {selectedId ? "Cargando la orden…" : "Seleccione una orden de la bandeja."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
