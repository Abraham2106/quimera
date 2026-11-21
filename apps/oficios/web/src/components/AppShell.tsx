import type { ReactNode } from "react";

import { sectionLabel, visibleSections, type AppSection } from "../navigation.js";

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

export function AppShell(props: Props) {
  const items = visibleSections(props.role).map((id) => ({ id, label: sectionLabel(id) }));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] lg:flex lg:flex-col">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold">OficiOS</p>
          <p className="text-xs text-[var(--ink-muted)]">Taller HVAC</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">{props.role}</p>
        </div>
        <nav className="flex flex-col gap-1 px-2" aria-label="Secciones">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`touch rounded px-3 text-left text-sm ${props.section === item.id ? "bg-white font-medium text-[var(--accent)]" : "text-[var(--ink)]"}`}
              onClick={() => props.onSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-screen flex-col pb-20 lg:pb-0">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-white px-4 py-3">
          <h1 className="text-base font-semibold">
            {items.find((item) => item.id === props.section)?.label ?? "Órdenes"}
          </h1>
          <button type="button" className="touch rounded-full border border-[var(--border-subtle)] px-3 text-sm" onClick={props.onOpenQueue}>
            {props.online ? "En línea" : "Sin conexión"}
            {props.pendingCount > 0 ? ` · ${props.pendingCount} pendientes` : ""}
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-4">{props.children}</main>
        <nav className="fixed inset-x-0 bottom-0 flex border-t border-[var(--border-subtle)] bg-white lg:hidden" aria-label="Secciones móviles">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`touch flex-1 text-xs ${props.section === item.id ? "font-semibold text-[var(--accent)]" : ""}`}
              onClick={() => props.onSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
