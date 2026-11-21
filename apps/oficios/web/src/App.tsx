import { useCallback, useEffect, useState } from "react";

import {
  ApiRequestError,
  fetchCustomerProvenance,
  fetchWorkOrder,
  formatOrdenFolio,
  registerCustomerApproval,
  transitionWorkOrder,
} from "./api/client.js";
import type { ProvenanceEntry, SerializedWorkOrder } from "./api/types.js";
import { ApprovalBlock } from "./components/ApprovalBlock.js";
import { CabysRepuestosSearch } from "./components/CabysRepuestosSearch.js";
import { ProvenanceDisclosure } from "./components/ProvenanceDisclosure.js";
import { loadDevApiConfig } from "./config.js";
import { statusLabel } from "./status-labels.js";

const ERR_WORK_ORDER_APPROVAL_REQUIRED = "ERR_WORK_ORDER_APPROVAL_REQUIRED";

export function App() {
  const [config] = useState(loadDevApiConfig);
  const [workOrderIdInput, setWorkOrderIdInput] = useState(config.workOrderId);
  const [workOrder, setWorkOrder] = useState<SerializedWorkOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  const [provenanceEntries, setProvenanceEntries] = useState<
    readonly ProvenanceEntry[] | null
  >(null);

  const loadOrder = useCallback(
    async (id: string) => {
      if (!id.trim()) {
        setLoadError("Indique el identificador de la orden de servicio.");
        return;
      }
      setBusy(true);
      setLoadError(null);
      setActionError(null);
      setApprovalRequired(false);
      try {
        const order = await fetchWorkOrder(config, id.trim());
        setWorkOrder(order);
        setProvenanceLoading(true);
        setProvenanceError(null);
        try {
          const prov = await fetchCustomerProvenance(config, order.customerId);
          setProvenanceEntries(prov.provenance?.entries ?? []);
        } catch (err) {
          setProvenanceEntries(null);
          setProvenanceError(
            err instanceof Error
              ? err.message
              : "No se pudo consultar la procedencia.",
          );
        } finally {
          setProvenanceLoading(false);
        }
      } catch (err) {
        setWorkOrder(null);
        setLoadError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la orden de servicio.",
        );
      } finally {
        setBusy(false);
      }
    },
    [config],
  );

  useEffect(() => {
    if (config.workOrderId) {
      void loadOrder(config.workOrderId);
    }
  }, [config.workOrderId, loadOrder]);

  async function tryTransition(targetStatus: "IN_PROGRESS" | "CLOSED") {
    if (!workOrder) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setApprovalRequired(false);
    try {
      const updated = await transitionWorkOrder(
        config,
        workOrder.id,
        targetStatus,
        workOrder.version,
      );
      setWorkOrder(updated);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.status === 409 &&
        err.code === ERR_WORK_ORDER_APPROVAL_REQUIRED
      ) {
        setApprovalRequired(true);
      } else {
        setActionError(
          err instanceof Error
            ? err.message
            : "La acción no se pudo completar.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterApproval() {
    if (!workOrder) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const updated = await registerCustomerApproval(config, workOrder.id);
      setWorkOrder(updated);
      setApprovalRequired(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la aprobación del cliente.",
      );
    } finally {
      setBusy(false);
    }
  }

  const folio = workOrder ? formatOrdenFolio(workOrder.id) : null;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">
          OficiOS — Taller HVAC
        </h1>
        <p className="text-sm text-slate-600">
          Pantalla operativa para técnico y recepción
        </p>
      </header>

      <form
        className="mb-6 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void loadOrder(workOrderIdInput);
        }}
      >
        <LoadOrderField
          label="Cargar orden"
          value={workOrderIdInput}
          onChange={setWorkOrderIdInput}
        />
        <button
          type="submit"
          className="rounded bg-sky-800 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          disabled={busy}
        >
          Cargar
        </button>
      </form>

      {loadError ? (
        <p className="mb-4 text-sm text-amber-800">{loadError}</p>
      ) : null}
      {actionError ? (
        <p className="mb-4 text-sm text-amber-800">{actionError}</p>
      ) : null}

      <ApprovalBlock
        visible={approvalRequired}
        busy={busy}
        onRegisterApproval={() => void onRegisterApproval()}
      />

      {workOrder ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              Orden de servicio
            </h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Folio</dt>
                <dd className="font-medium text-slate-900">{folio}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Estado</dt>
                <dd className="font-medium text-slate-900">
                  {statusLabel(workOrder.status)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cliente</dt>
                <dd className="font-medium text-slate-900">
                  {config.displayLabels.cliente}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Equipo</dt>
                <dd className="font-medium text-slate-900">
                  {config.displayLabels.equipo}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Presupuesto</dt>
                <dd className="font-medium text-slate-900">
                  {workOrder.status === "QUOTED" ||
                  workOrder.status === "APPROVED" ||
                  workOrder.customerAuthorized
                    ? "Registrado — pendiente o aprobado según estado"
                    : "Aún no generado"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Aprobación del cliente</dt>
                <dd className="font-medium text-slate-900">
                  {workOrder.customerAuthorized ? "Registrada" : "Pendiente"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Factura</dt>
                <dd className="font-medium text-slate-900">
                  {workOrder.fiscalIntentId
                    ? "Comprobante fiscal en preparación"
                    : "Pendiente al cierre"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "QUOTED"}
                onClick={() => void tryTransition("IN_PROGRESS")}
              >
                Iniciar intervención
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "QUOTED"}
                onClick={() => void tryTransition("CLOSED")}
              >
                Cerrar orden
              </button>
            </div>
          </section>

          <ProvenanceDisclosure
            entries={provenanceEntries}
            loading={provenanceLoading}
            error={provenanceError}
          />

          <CabysRepuestosSearch config={config} />
        </div>
      ) : null}
    </div>
  );
}

function LoadOrderField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col text-sm">
      <span className="mb-1 text-slate-600">{props.label}</span>
      <input
        className="rounded border border-slate-300 px-3 py-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}