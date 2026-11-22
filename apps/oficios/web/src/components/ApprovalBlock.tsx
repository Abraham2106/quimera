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
      className="banner-warn mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70">
          <AlertTriangleIcon />
        </span>
        <div>
          <p className="text-sm font-medium">Aprobación del cliente</p>
          <p className="mt-0.5 break-words text-sm">
            {"No se puede iniciar ni cerrar esta orden todavía: falta registrar la aprobación del presupuesto por parte del cliente"}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="touch btn-warn shrink-0"
        disabled={busy}
        onClick={onRegisterApproval}
      >
        <CheckIcon width={16} height={16} />
        Registrar aprobación del cliente
      </button>
    </div>
  );
}
