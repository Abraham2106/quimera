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
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p className="break-words text-sm text-[var(--ink)]">
        {"No se puede iniciar ni cerrar esta orden todavía: falta registrar la aprobación del presupuesto por parte del cliente"}
      </p>
      <button
        type="button"
        className="touch btn-primary shrink-0"
        disabled={busy}
        onClick={onRegisterApproval}
      >
        Registrar aprobación del cliente
      </button>
    </div>
  );
}
