import { useEffect, useState } from "react";

import { postOfflineSync } from "./api/client.js";
import { AdminView } from "./components/AdminView.js";
import { AppShell } from "./components/AppShell.js";
import { visibleSections, type AppSection } from "./navigation.js";
import { CustomersView } from "./components/CustomersView.js";
import { ExodusWizard } from "./components/ExodusWizard.js";
import { OfflineSyncDrawer } from "./components/OfflineSyncDrawer.js";
import { OrdersWorkspace } from "./components/OrdersWorkspace.js";
import { loadDevApiConfig } from "./config.js";
import { flushMutationQueue, openOfflineDatabase } from "./offline/mutation-queue.js";

function readSection(role: string): AppSection {
  const raw = window.location.hash.replace("#/", "") as AppSection;
  const allowed = visibleSections(role);
  return allowed.includes(raw) ? raw : "ordenes";
}

export function App() {
  const [config] = useState(loadDevApiConfig);
  const readOnly = config.testRole === "AUDITOR_READONLY";
  const [section, setSection] = useState<AppSection>(() => readSection(config.testRole));
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setSection(readSection(config.testRole));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [config.testRole]);

  useEffect(() => {
    const syncQueued = () => {
      if (!navigator.onLine) return;
      void (async () => {
        const db = await openOfflineDatabase(indexedDB);
        await flushMutationQueue(db, (item) =>
          postOfflineSync(config, item.workOrderId, {
            clientMutationId: item.clientMutationId,
            expectedVersion: item.expectedVersion,
            kind: item.kind,
            ...item.payload,
          }),
        );
      })();
    };
    const onOnline = () => {
      setOnline(true);
      syncQueued();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (navigator.onLine) syncQueued();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [config]);

  function go(next: AppSection) {
    window.location.hash = `/${next}`;
    setSection(next);
  }

  return (
    <AppShell
      role={config.testRole}
      section={section}
      onSection={go}
      online={online}
      pendingCount={pending}
      onOpenQueue={() => setQueueOpen(true)}
    >
      {section === "ordenes" ? <OrdersWorkspace config={config} readOnly={readOnly} /> : null}
      {section === "clientes" ? <CustomersView config={config} /> : null}
      {section === "exodus" && config.testRole === "ADMIN" ? <ExodusWizard config={config} /> : null}
      {section === "admin" ? <AdminView config={config} readOnly={readOnly} /> : null}
      <OfflineSyncDrawer config={config} open={queueOpen} onClose={() => setQueueOpen(false)} onCount={setPending} />
    </AppShell>
  );
}
