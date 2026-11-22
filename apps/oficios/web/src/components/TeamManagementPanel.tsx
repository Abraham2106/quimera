import { useCallback, useEffect, useState } from "react";

import {
  acceptInvitation,
  createInvitation,
  fetchMembers,
  updateMemberRole,
  type MemberSummary,
} from "../api/org-client.js";
import type { DevApiConfig } from "../config.js";

type Props = {
  readonly config: DevApiConfig;
};

export function TeamManagementPanel(props: Props) {
  const [members, setMembers] = useState<readonly MemberSummary[]>([]);
  const [email, setEmail] = useState("tecnico@taller.cr");
  const [inviteToken, setInviteToken] = useState("");
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchMembers(props.config);
      setMembers(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el equipo.");
    }
  }, [props.config]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-[var(--ink)]">Equipo y roles</h2>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        Administre permisos RBAC y emita invitaciones de un solo uso.
      </p>

      <ul className="mt-4 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/50">
        {members.length === 0 ? (
          <li className="px-3.5 py-3 text-xs text-[var(--ink-muted)]">Sin miembros registrados en esta sesión.</li>
        ) : (
          members.map((member) => (
            <li
              key={member.userSub}
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
            >
              <span className="num min-w-0 truncate text-xs font-medium text-[var(--ink)]" title={member.userSub}>
                {member.userSub} — <strong>{member.role}</strong>
              </span>
              {props.config.testRole === "ADMIN" ? (
                <select
                  className="rounded-lg border border-[var(--border-strong)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)]"
                  value={member.role}
                  onChange={(event) => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await updateMemberRole(
                          props.config,
                          member.userSub,
                          event.target.value as MemberSummary["role"],
                        );
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "No se pudo actualizar el rol.");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  disabled={busy}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="AUDITOR_READONLY">AUDITOR_READONLY</option>
                </select>
              ) : null}
            </li>
          ))
        )}
      </ul>

      <form
        className="mt-4 min-w-0 space-y-2.5 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const created = await createInvitation(props.config, email, "OPERATOR");
              setLastToken(created.token);
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo crear la invitación.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="block text-xs font-medium text-[var(--ink)]">
          Correo del invitado (ADMIN)
          <input className="field mt-1 min-w-0" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button
          type="submit"
          className="touch btn-secondary text-xs"
          disabled={busy || props.config.testRole !== "ADMIN"}
        >
          Crear invitación OPERATOR
        </button>
      </form>

      {lastToken ? (
        <p className="num mt-2 break-all rounded-lg bg-[var(--surface-subtle)] p-2 text-xs text-[var(--ink-muted)]">
          Token (solo demo local): {lastToken}
        </p>
      ) : null}

      <form
        className="mt-4 space-y-2.5 border-t border-[var(--border-subtle)] pt-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await acceptInvitation(props.config, inviteToken);
              setInviteToken("");
              await reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="block text-xs font-medium text-[var(--ink)]">
          Aceptar invitación (token)
          <input
            className="field num mt-1"
            value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)}
          />
        </label>
        <button type="submit" className="touch btn-secondary text-xs" disabled={busy}>
          Aceptar invitación
        </button>
      </form>

      {error ? <p className="mt-2 text-sm text-amber-800">{error}</p> : null}
    </section>
  );
}
