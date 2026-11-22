import type { ReactNode } from "react";

import { sectionLabel, visibleSections, type AppSection } from "../navigation.js";
import { ClipboardIcon, ShieldIcon, UploadCloudIcon, UsersIcon } from "./Icons.js";

export type { AppSection };
export { visibleSections };

type Props = {
  readonly role: string;
  readonly section: AppSection;
  readonly onSection: (section: AppSection) => void;
  readonly online: boolean;
  readonly pendingCount: number;
  readonly onOpenQueue: () => void;
  readonly children: ReactNode;
};

function NavIcon({ id }: { readonly id: AppSection }) {
  if (id === "ordenes") return <ClipboardIcon className="shrink-0" />;
  if (id === "clientes") return <UsersIcon className="shrink-0" />;
  if (id === "exodus") return <UploadCloudIcon className="shrink-0" />;
  return <ShieldIcon className="shrink-0" />;
}

export function AppShell(props: Props) {
  const items = visibleSections(props.role).map((id) => ({ id, label: sectionLabel(id) }));
  const currentLabel = items.find((item) => item.id === props.section)?.label ?? "Órdenes";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="hidden bg-[var(--surface-rail)] text-[var(--on-rail)] lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white shadow-sm">
              OF
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-white">OficiOS</p>
              <p className="truncate text-xs text-[var(--on-rail-muted)]">Taller HVAC · CR</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-[var(--surface-rail-elevated)] px-3 py-2">
            <span className="text-xs font-medium text-[var(--on-rail-muted)]">Rol activo</span>
            <span className="num rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {props.role}
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Secciones">
          {items.map((item) => {
            const active = props.section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`touch flex items-center gap-3 rounded-xl px-3.5 text-left text-sm transition-[background-color,color] duration-150 ease-[var(--ease-out)] ${
                  active
                    ? "bg-[var(--accent)] font-semibold text-white shadow-sm"
                    : "text-[var(--on-rail-muted)] hover:bg-white/6 hover:text-white"
                }`}
                onClick={() => props.onSection(item.id)}
              >
                <NavIcon id={item.id} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-[var(--on-rail-muted)]">
          <p className="font-medium text-white/90">QUIMERA Local-First</p>
          <p className="mt-0.5 text-xs text-[var(--on-rail-muted)]">Operación en campo y sincronización segura</p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-rail)] text-xs font-bold text-white lg:hidden">
              OF
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-[var(--ink)]">{currentLabel}</h1>
              <p className="hidden text-xs text-[var(--ink-muted)] sm:block">
                Gestión operativa de órdenes, evidencia técnica y facturación electrónica
              </p>
            </div>
          </div>

          <button
            type="button"
            className={`touch inline-flex items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
              props.online && props.pendingCount === 0 ? "pill-done" : "pill-warn"
            }`}
            onClick={props.onOpenQueue}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                props.online && props.pendingCount === 0 ? "bg-[var(--status-done-ink)]" : "bg-[var(--status-warn-ink)]"
              }`}
              aria-hidden="true"
            />
            <span>
              {props.online ? "En línea" : "Sin conexión"}
              {props.pendingCount > 0 ? ` · ${props.pendingCount} pendientes` : ""}
            </span>
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-7">
          {props.children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--border-subtle)] bg-[var(--surface-card)] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_16px_rgba(10,10,10,0.08)] lg:hidden"
          aria-label="Secciones móviles"
        >
          {items.map((item) => {
            const active = props.section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`touch flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs ${
                  active ? "font-semibold text-[var(--accent)]" : "text-[var(--ink-muted)]"
                }`}
                onClick={() => props.onSection(item.id)}
              >
                <NavIcon id={item.id} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
