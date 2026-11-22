# Rediseño integral de UI/UX para OficiOS (Taller Precisión)

## Why

La interfaz web actual de `OficiOS` (`apps/oficios/web`) cumple funcionalmente los flujos de las cuatro oleadas y staging, pero presenta toda la aplicación apilada en una única columna vertical de 768 px donde los paneles administrativos (`Plan y consumo`, `Data Exodus`, `Alta de organización B2B`, `Equipo y roles`) ocupan la pantalla inicial por encima de la operación diaria del taller. Además:

- Abrir una orden exige conocer y pegar un UUID manual en lugar de navegar una bandeja filtrable de órdenes.
- La máquina de estados de 7 pasos se expone como cinco botones horizontales grises casi siempre deshabilitados, sin jerarquía visual ni guía sobre la siguiente transición válida o la compuerta de aprobación del cliente (`HTTP 409`).
- Los precios de materiales se capturan y muestran en céntimos crudos (`150000`) en lugar de formato monetario costarricense (`₡1.500,00`) con numerales tabulares y cálculo inmediato de subtotal e IVA 13 %.
- El catálogo CAByS y el formulario de materiales están desconectados entre sí; la carga de fotos de diagnóstico carece de vista previa y soporte táctil de cámara móvil; y la cola offline en IndexedDB no ofrece visibilidad de estado ni resolución guiada de conflictos `HTTP 409`.
- Los endpoints administrativos de bóveda fiscal y promoción `sandbox → production` (`QG-07`) y la bitácora de auditoría no cuentan todavía con vistas dedicadas integradas en el panel de administración.
- La experiencia visual mezcla voseo informal con trato formal y no cumple criterios ergonómicos de trabajo en campo (objetivos táctiles `>= 44×44 px`, contraste optimizado para luz exterior y navegación con una sola mano en móvil).

## What changes

Definir la nueva capacidad `oficios-ui-experience` para rediseñar `apps/oficios/web` como una interfaz SaaS B2B de precisión industrial y lista para campo (`Taller Precisión`), organizada en:

1. **App Shell responsivo orientado por rol:** navegación lateral colapsable en escritorio y barra inferior fija en móvil con cuatro destinos claros (`Órdenes`, `Clientes y equipos`, `Data Exodus`, `Administración`), aterrizando por defecto en `Órdenes` y ocultando o restringiendo secciones administrativas según el rol (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`) como defensa en profundidad sobre el RBAC del backend.
2. **Sistema de diseño offline-first:** paleta neutra cálida de alto contraste con acento azul petróleo técnico y estados semánticos claros (ámbar industrial para compuertas/offline/`NEEDS_REVIEW`, esmeralda para verificado/aprobado, carmesí solo para errores críticos), tipografía con numerales tabulares (`tabular-nums`) para folios, montos `₡` y códigos CAByS, objetivos táctiles `>= 44×44 px`, cumplimiento WCAG AA y cero dependencias de fuentes o iconos en CDNs externos.
3. **Bandeja y detalle de órdenes con stepper de 7 estados:** maestro-detalle con filtros por estado y búsqueda por folio/cliente/serie, stepper visual `Recibida → Diagnosticada → Presupuestada → Aprobada → En intervención → Verificada → Cerrada`, acción primaria contextual para la siguiente transición válida y compuerta integrada de aprobación del cliente ante `HTTP 409`.
4. **Diagnóstico, evidencia fotográfica y materiales con CAByS integrado:** selección directa desde la búsqueda CAByS hacia el formulario de materiales, entrada y despliegue en colones (`₡`) con precisión entera en unidades menores hacia la API, subtotal/IVA 13 % en vivo y zona de carga de evidencia con vista previa, soporte de cámara móvil y validación previa de formato/tamaño.
5. **Centro de conectividad y sincronización offline (PWA):** indicador persistente en cabecera (`En línea` / `Sin conexión · N pendientes`) con cajón de cola IndexedDB, reintento manual y resolución explícita de conflictos concurrentes `HTTP 409`.
6. **Wizard de 4 pasos para Data Exodus y panel unificado de Administración:** flujo guiado (`Subir → Perfilar → Resolver conflictos → Reanudar`) con dropzone y tabla de confianza `NEEDS_REVIEW`, más sub-vistas de `Organización y equipo`, `Configuración fiscal (Hacienda)`, `Plan y consumo` (carga automática con barras de cuota y aviso previo a `HTTP 402`) y `Bitácora de auditoría`.

## Impact

- **App afectada:** exclusivamente `apps/oficios` (principalmente `apps/oficios/web` y, solo si falta listado resumido de órdenes, consulta de lectura acotada en `apps/oficios/src/api/routes/work-orders.ts` bajo `FORCE RLS`).
- **Paquetes del núcleo (`@quimera/core`, `@quimera/data-exodus`, `@quimera/fiscal-outbox`, `@quimera/cr-api-passport`, `@quimera/factura-ci`, `@quimera/pipeline`):** sin cambios ni dependencias nuevas; `pnpm test:isolation` permanece intacto.
- **Contratos públicos preservados:** todos los endpoints HTTP existentes, códigos de error (`ERR_WORK_ORDER_APPROVAL_REQUIRED`, `401`, `402`, `403`, `409`), idempotencia de `FiscalIntent`, `FORCE RLS` y el baseline 100 % offline (`pnpm verify`) permanecen intactos.
- **Pruebas afectadas:** `apps/oficios/tests/e2e/served-staging.spec.ts` y pruebas de componentes web se actualizarán para cubrir la nueva navegación por secciones y verificar todos los flujos sin regresiones.

## Fuera de alcance

- Reescritura de lógica de dominio, máquina de estados backend, esquema SQL base o adaptadores S3/KMS/Hacienda ya cerrados.
- Librerías pesadas de componentes con dependencias de red o telemetría externa.
- Certificación oficial o transmisión en vivo al Ministerio de Hacienda desde pruebas locales (la emisión fiscal en CI permanece estrictamente loopback-only).
