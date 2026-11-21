## Fase 1 — Sistema de diseño y App Shell responsivo

- [ ] Definir tokens de diseño («Taller Precisión») en `apps/oficios/web/src/index.css`: paleta neutra cálida, acento azul petróleo, colores semánticos, numerales tabulares (`tabular-nums`), objetivos táctiles `>= 44×44 px`, foco visible y `prefers-reduced-motion` sin dependencias externas de red.
- [ ] Crear componentes base accesibles e iconografía SVG inline en `apps/oficios/web/src/components/ui/` (botones con jerarquía primaria/secundaria/peligro, badges semánticos, tarjetas, estados vacíos, skeletons y sistema de notificaciones `aria-live`).
- [ ] Implementar el App Shell responsivo (barra lateral colapsable en escritorio `>= 1024px`, barra superior con contexto de organización/rol y navegación inferior fija en móvil `< 1024px`) con vistas `Órdenes`, `Clientes y equipos`, `Data Exodus` y `Administración`.
- [ ] Aplicar visibilidad condicional por rol (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`) en navegación y controles de mutación, manteniendo la aplicación autoritativa de RBAC en el servidor.

## Fase 2 — Bandeja de órdenes, stepper de 7 estados y flujo técnico

- [ ] Verificar o ampliar `GET /api/v1/work-orders` bajo `FORCE RLS` para devolver datos resumidos suficientes para la bandeja (folio/id, estado, versión, cliente, serie de equipo, monto presupuestado y estado de autorización).
- [ ] Implementar la vista maestro-detalle de `Órdenes` con filtros por estado, búsqueda por folio/cliente/serie, acceso secundario por UUID y modal/panel `+ Nueva orden`.
- [ ] Implementar el stepper visual de 7 etapas (`Recibida` a `Cerrada`) con acción primaria contextual para la siguiente transición válida y compuerta integrada de aprobación del cliente (`HTTP 409` / `ERR_WORK_ORDER_APPROVAL_REQUIRED`).
- [ ] Reorganizar el detalle de orden en pestañas (`Diagnóstico y evidencia`, `Materiales y CAByS`, `Historial y procedencia`).
- [ ] Integrar la búsqueda CAByS directamente en el formulario de materiales (selección con un clic), entrada/visualización monetaria en colones (`₡`) convertida con exactitud entera a unidades menores y resumen en vivo de subtotal + IVA 13 % + total.
- [ ] Mejorar el componente de adjuntos de diagnóstico con dropzone, `capture="environment"` en móvil, previsualización local, validación previa de MIME/tamaño (`<= 5 MiB`) y lista de adjuntos cargados.

## Fase 3 — Centro PWA offline, Clientes y Data Exodus guiado

- [ ] Implementar el indicador persistente de conectividad/cola en cabecera y el cajón `OfflineSyncDrawer` conectado a IndexedDB con reintento manual y resolución explícita de conflictos `HTTP 409` sin sobrescribir cambios remotos.
- [ ] Implementar la vista `Clientes y equipos` con búsqueda, listado de equipos por cliente y popover/panel de procedencia trazable (`¿De dónde viene este dato?`).
- [ ] Rediseñar `Data Exodus` como wizard guiado de 4 pasos (`Subir → Perfilar → Resolver conflictos → Reanudar`) con dropzone, tabla de columnas `NEEDS_REVIEW`, tarjetas de decisión con justificación obligatoria y enlace al resultado importado.

## Fase 4 — Administración consolidada y bóveda fiscal

- [ ] Consolidar `Administración` en sub-pestañas: `Organización y equipo`, `Configuración fiscal (Hacienda)`, `Plan y consumo` y `Auditoría`.
- [ ] Construir la vista `Configuración fiscal (Hacienda)` para `ADMIN` conectada a carga de `.p12`/PIN/IDP y promoción `sandbox → production` (`QG-07`), asegurando campos enmascarados, limpieza tras envío y cero exposición de secretos.
- [ ] Actualizar `Plan y consumo` con carga automática al abrir la vista, barras visuales de consumo por límite y aviso preventivo ante `HTTP 402`.
- [ ] Construir la tabla filtrable de `Auditoría` sobre `saas_audit_logs` en hora local (`America/Costa_Rica`) para `ADMIN` y `AUDITOR_READONLY`.
- [ ] Unificar todo el texto de la interfaz en español profesional `es-CR` consistente.

## Fase 5 — Pruebas de regresión, accesibilidad y puertas de calidad

- [ ] Añadir pruebas unitarias/de componente para formateo monetario entero en colones (`₡`), stepper contextual de estados, visibilidad por rol y manejo de conflictos `HTTP 409` en el cajón offline.
- [ ] Actualizar `apps/oficios/tests/e2e/served-staging.spec.ts` para verificar el recorrido completo en el nuevo App Shell (escritorio y viewport móvil): navegación por secciones, Data Exodus wizard, bandeja y stepper de órdenes, materiales CAByS, subida de foto, cola offline y administración.
- [ ] Verificar build estático de `apps/oficios/web/dist` sin peticiones a CDNs externos ni errores de consola.
- [ ] Ejecutar puertas completas en verde: `pnpm verify`, `pnpm spec:validate`, `pnpm test:isolation`, `pnpm test:security` y `pnpm audit --audit-level=high`.
