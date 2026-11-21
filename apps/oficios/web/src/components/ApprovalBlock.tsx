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
      className="rounded-lg border border-amber-300 bg-amber-50 p-4"
      role="alert"
    >
      <p className="text-sm text-amber-950">
        {"No se puede iniciar ni cerrar esta orden todavía: falta registrar la aprobación del presupuesto por parte del cliente"}
      </p>
      <button
        type="button"
        className="mt-3 rounded bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        disabled={busy}
        onClick={onRegisterApproval}
      >
        Registrar aprobación del cliente
      </button>
    </div>
  );
}