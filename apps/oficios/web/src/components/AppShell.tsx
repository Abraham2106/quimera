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
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="hidden flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] lg:flex">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">
            OF
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-[var(--ink)]">OficiOS</p>
            <p className="truncate text-[11px] text-[var(--ink-muted)]">{props.role}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-4" aria-label="Secciones">
          {items.map((item) => {
            const active = props.section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`touch relative flex items-center gap-3 rounded-md px-3 text-left text-sm ${
                  active
                    ? "bg-[var(--surface-subtle)] font-semibold text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"
                }`}
                onClick={() => props.onSection(item.id)}
              >
                {active ? (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#2563eb]" aria-hidden="true" />
                ) : null}
                <NavIcon id={item.id} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <p className="text-xs font-semibold text-[var(--ink)]">Taller HVAC</p>
          <p className="text-[11px] text-[var(--ink-muted)]">QUIMERA · es-CR</p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-white lg:hidden">
              OF
            </span>
            <h1 className="text-sm font-semibold text-[var(--ink)]">{currentLabel}</h1>
          </div>

          <button
            type="button"
            className="touch px-1 text-xs font-medium text-[var(--ink-muted)] transition-colors duration-150 hover:text-[var(--ink)]"
            onClick={props.onOpenQueue}
          >
            <span>
              {props.online ? "En línea" : "Sin conexión"}
              {props.pendingCount > 0 ? ` · ${props.pendingCount} pendientes` : ""}
            </span>
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 lg:px-7">
          {props.children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--border-subtle)] bg-[var(--surface-card)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
          aria-label="Secciones móviles"
        >
          {items.map((item) => {
            const active = props.section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`touch flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] ${
                  active
                    ? "font-semibold border-t-2 border-[#2563eb] text-[#2563eb]"
                    : "text-[var(--ink-muted)]"
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
