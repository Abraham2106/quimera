import { AlertTriangleIcon, CheckIcon } from "./Icons.js";

type Props = {
  readonly visible: boolean;
  readonly busy: boolean;
  readonly onRegisterApproval: () => void;
};

export function ApprovalBlock({ visible, busy, onRegisterApproval }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-[var(--status-warn)] p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-200/80 text-amber-900">
          <AlertTriangleIcon />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-900">
            Compuerta de aprobación del cliente
          </p>
          <p className="mt-0.5 text-sm text-amber-950">
            {"No se puede iniciar ni cerrar esta orden todavía: falta registrar la aprobación del presupuesto por parte del cliente"}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="touch inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-amber-900 disabled:opacity-50"
        disabled={busy}
        onClick={onRegisterApproval}
      >
        <CheckIcon width={16} height={16} />
        Registrar aprobación del cliente
      </button>
    </div>
  );
}
