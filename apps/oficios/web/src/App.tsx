import { useCallback, useEffect, useState } from "react";

import {
  ApiRequestError,
  closeWorkOrder,
  createWorkOrder,
  fetchCustomerProvenance,
  fetchCustomers,
  fetchEquipment,
  fetchWorkOrder,
  formatOrdenFolio,
  registerCustomerApproval,
  postOfflineSync,
  saveDiagnosis,
  saveMaterial,
  transitionWorkOrder,
} from "./api/client.js";
import type { CustomerListItem } from "./api/types.js";
import type { ProvenanceEntry, SerializedWorkOrder } from "./api/types.js";
import { BillingUsagePanel } from "./components/BillingUsagePanel.js";
import { MigrationWorkbench } from "./components/MigrationWorkbench.js";
import { OrgOnboardingPanel } from "./components/OrgOnboardingPanel.js";
import { TeamManagementPanel } from "./components/TeamManagementPanel.js";
import { ApprovalBlock } from "./components/ApprovalBlock.js";
import { CabysRepuestosSearch } from "./components/CabysRepuestosSearch.js";
import { DiagnosisAttachmentUpload } from "./components/DiagnosisAttachmentUpload.js";
import { ProvenanceDisclosure } from "./components/ProvenanceDisclosure.js";
import { loadDevApiConfig } from "./config.js";
import { enqueueMutation, flushMutationQueue, openOfflineDatabase } from "./offline/mutation-queue.js";
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [equipment, setEquipment] = useState<readonly { id: string; serialNumber: string | null }[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [customers, setCustomers] = useState<readonly CustomerListItem[]>([]);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [diagnosisNotes, setDiagnosisNotes] = useState("Presión de succión fuera de rango");
  const [cabysCode, setCabysCode] = useState("8415109010100");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceMinor, setUnitPriceMinor] = useState("150000");

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

  useEffect(() => {
    const syncQueued = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      void (async () => {
        const db = await openOfflineDatabase(indexedDB);
        await flushMutationQueue(db, async (item) =>
          postOfflineSync(config, item.workOrderId, {
            clientMutationId: item.clientMutationId,
            expectedVersion: item.expectedVersion,
            kind: item.kind,
            ...item.payload,
          }),
        );
      })();
    };
    window.addEventListener("online", syncQueued);
    let lastOnline = typeof navigator !== "undefined" && navigator.onLine;
    const pollOnline = window.setInterval(() => {
      const online = typeof navigator !== "undefined" && navigator.onLine;
      if (online && !lastOnline) {
        syncQueued();
      }
      lastOnline = online;
    }, 400);
    if (lastOnline) {
      syncQueued();
    }
    return () => {
      window.removeEventListener("online", syncQueued);
      window.clearInterval(pollOnline);
    };
  }, [config]);

  useEffect(() => {
    void fetchCustomers(config)
      .then((rows) => {
        setCustomers(rows);
        setCustomersError(null);
      })
      .catch((err: unknown) => {
        setCustomersError(err instanceof Error ? err.message : "No se pudieron cargar los clientes.");
      });
  }, [config]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setEquipment([]);
      setSelectedEquipmentId("");
      return;
    }
    void fetchEquipment(config, selectedCustomerId)
      .then((rows) => {
        setEquipment(rows);
        setSelectedEquipmentId(rows[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        setEquipment([]);
        setActionError(err instanceof Error ? err.message : "No se pudo cargar el equipo.");
      });
  }, [config, selectedCustomerId]);

  async function tryTransition(targetStatus: string) {
    if (!workOrder) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setApprovalRequired(false);
    try {
      await transitionWorkOrder(
        config,
        workOrder.id,
        targetStatus,
        workOrder.version,
      );
      await loadOrder(workOrder.id);
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
      await registerCustomerApproval(config, workOrder.id);
      setApprovalRequired(false);
      await loadOrder(workOrder.id);
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

      <BillingUsagePanel config={config} />
      <MigrationWorkbench config={config} />
      <OrgOnboardingPanel config={config} />
      <TeamManagementPanel config={config} />

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

      <form
        className="mb-4 grid gap-2 text-sm sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setBusy(true);
            setActionError(null);
            try {
              const created = await createWorkOrder(config, selectedCustomerId, selectedEquipmentId);
              setWorkOrderIdInput(created.id);
              await loadOrder(created.id);
            } catch (err) {
              setActionError(err instanceof Error ? err.message : "No se pudo recibir la orden.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="flex flex-col">
          <span className="mb-1 text-slate-600">Cliente migrado</span>
          <select
            className="rounded border border-slate-300 px-3 py-2"
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
          >
            <option value="">Seleccione un cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.legalName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-slate-600">Equipo</span>
          <select
            className="rounded border border-slate-300 px-3 py-2"
            value={selectedEquipmentId}
            onChange={(event) => setSelectedEquipmentId(event.target.value)}
          >
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.serialNumber ?? item.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="w-fit rounded bg-sky-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !selectedCustomerId || !selectedEquipmentId}
        >
          Recibir orden
        </button>
      </form>

      {customersError ? (
        <p className="mb-2 text-sm text-amber-800">{customersError}</p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          Clientes en base de datos: {customers.length === 0 ? "ninguno cargado todavía" : customers.map((customer) => customer.legalName).join(", ")}
        </p>
      )}

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
                  {workOrder.customerLegalName ?? workOrder.customerId}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Equipo</dt>
                <dd className="font-medium text-slate-900">
                  {workOrder.equipmentSerial ?? workOrder.equipmentId}
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
                    ? `Intención fiscal ${workOrder.fiscalIntentId}`
                    : "Pendiente al cierre"}
                </dd>
              </div>
            </dl>

            <form
              className="mt-4 grid gap-2 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setBusy(true);
                  setActionError(null);
                  try {
                    if (typeof navigator !== "undefined" && navigator.onLine === false) {
                      const db = await openOfflineDatabase(indexedDB);
                      await enqueueMutation(db, {
                        clientMutationId: crypto.randomUUID(),
                        workOrderId: workOrder.id,
                        expectedVersion: workOrder.version,
                        kind: "diagnosis",
                        payload: { notes: diagnosisNotes, measurements: { succionPsi: 68 } },
                        enqueuedAt: new Date().toISOString(),
                      });
                      setActionError("Diagnóstico en cola. Se enviará al reconectar.");
                      return;
                    }
                    await saveDiagnosis(config, workOrder.id, diagnosisNotes, { succionPsi: 68 });
                    if (workOrder.status === "RECEIVED") {
                      await transitionWorkOrder(config, workOrder.id, "DIAGNOSED", workOrder.version);
                    }
                    await loadOrder(workOrder.id);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "No se pudo guardar el diagnóstico.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <label className="flex flex-col">
                <span className="text-slate-600">Diagnóstico</span>
                <input className="rounded border border-slate-300 px-3 py-2" value={diagnosisNotes} onChange={(e) => setDiagnosisNotes(e.target.value)} />
              </label>
              <button type="submit" className="w-fit rounded border border-slate-300 px-3 py-2" disabled={busy}>
                Guardar diagnóstico
              </button>
            </form>
            <DiagnosisAttachmentUpload config={config} workOrderId={workOrder.id} />
            <form
              className="mt-3 grid gap-2 text-sm sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setBusy(true);
                  setActionError(null);
                  try {
                    await saveMaterial(config, workOrder.id, {
                      cabysCode,
                      quantity,
                      unitPriceMinor: Number(unitPriceMinor),
                      taxRate: "0.13",
                    });
                    await loadOrder(workOrder.id);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "No se pudo guardar el material.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <label className="flex flex-col">
                <span className="text-slate-600">CAByS</span>
                <input className="rounded border border-slate-300 px-3 py-2" value={cabysCode} onChange={(e) => setCabysCode(e.target.value)} />
              </label>
              <label className="flex flex-col">
                <span className="text-slate-600">Cantidad</span>
                <input className="rounded border border-slate-300 px-3 py-2" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              <label className="flex flex-col">
                <span className="text-slate-600">Precio (céntimos)</span>
                <input className="rounded border border-slate-300 px-3 py-2" value={unitPriceMinor} onChange={(e) => setUnitPriceMinor(e.target.value)} />
              </label>
              <button type="submit" className="w-fit rounded border border-slate-300 px-3 py-2" disabled={busy}>
                Agregar material con IVA 13%
              </button>
            </form>
            {workOrder.materials && workOrder.materials.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {workOrder.materials.map((material) => (
                  <li key={`${material.cabysCode}-${material.unitPriceMinor}`}>
                    CAByS {material.cabysCode} · cantidad {material.quantity} · {material.unitPriceMinor} céntimos · IVA {material.taxRateBps} bps
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "DIAGNOSED"}
                onClick={() => void tryTransition("QUOTED")}
              >
                Generar presupuesto
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "QUOTED"}
                onClick={() => void tryTransition("CLOSED")}
              >
                Cerrar orden
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "APPROVED"}
                onClick={() => void tryTransition("IN_PROGRESS")}
              >
                Iniciar intervención
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "IN_PROGRESS"}
                onClick={() => void tryTransition("VERIFIED")}
              >
                Verificar trabajo
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || workOrder.status !== "VERIFIED"}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      await closeWorkOrder(config, workOrder.id, workOrder.version);
                      await loadOrder(workOrder.id);
                    } catch (err) {
                      if (err instanceof ApiRequestError && err.status === 409 && err.code === ERR_WORK_ORDER_APPROVAL_REQUIRED) {
                        setApprovalRequired(true);
                      } else {
                        setActionError(err instanceof Error ? err.message : "No se pudo cerrar la orden.");
                      }
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Cerrar y encolar comprobante
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