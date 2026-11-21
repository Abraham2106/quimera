import { useCallback, useEffect, useState } from "react";

import type { DevApiConfig } from "../config.js";
import {
  acceptInvitation,
  createInvitation,
  fetchMembers,
  updateMemberRole,
  type MemberSummary,
} from "../api/org-client.js";

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
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Equipo y roles</h2>
      <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
        {members.map((member) => (
          <li key={member.userSub} className="flex flex-wrap items-center gap-2">
            <span>
              {member.userSub} — {member.role}
            </span>
            {props.config.testRole === "ADMIN" ? (
              <select
                className="rounded border border-slate-300 px-2 py-1 text-xs"
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
        ))}
      </ul>

      <form
        className="mt-4 grid gap-2 text-sm sm:grid-cols-2"
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
        <label className="flex flex-col sm:col-span-2">
          <span className="text-slate-600">Correo del invitado (ADMIN)</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="w-fit rounded border border-slate-300 px-3 py-2"
          disabled={busy || props.config.testRole !== "ADMIN"}
        >
          Crear invitación OPERATOR
        </button>
      </form>

      {lastToken ? (
        <p className="mt-2 break-all text-xs text-slate-600">Token (solo demo local): {lastToken}</p>
      ) : null}

      <form
        className="mt-4 grid gap-2 text-sm"
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
        <label className="flex flex-col">
          <span className="text-slate-600">Aceptar invitación (token)</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)}
          />
        </label>
        <button type="submit" className="w-fit rounded border border-slate-300 px-3 py-2" disabled={busy}>
          Aceptar invitación
        </button>
      </form>

      {error ? <p className="mt-2 text-sm text-amber-800">{error}</p> : null}
    </section>
  );
}