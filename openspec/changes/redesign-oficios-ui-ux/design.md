# Diseño de UI/UX y arquitectura frontend: OficiOS «Taller Precisión»

## 1. Dirección estética y tokens de diseño

La interfaz adopta una estética **industrial sobria y de alta legibilidad para servicio técnico en campo** (talleres HVAC, refrigeración y oficios en Costa Rica), evitando adornos genéricos o gradientes decorativos:

- **Superficies y jerarquía:**
  - Lienzo base cálido neutro: `#F7F7F5` (`--surface-canvas`).
  - Superficie de tarjeta/panel: `#FFFFFF` (`--surface-card`) con borde estructural sutil `#E5E5E0` (`--border-subtle`) y sombra mínima solo en drawers/popovers.
  - Superficie secundaria / barra lateral: `#F0F0EC` (`--surface-muted`).
- **Color de marca y semántica operativa:**
  - Primario técnico (Azul Petróleo / Acero): `#0F4C81` (`--accent-primary`), hover `#0C3B66`, foco `#0284C7`.
  - Aprobación / Verificado / Fiscal aceptado (Esmeralda): `#047857` sobre fondo `#ECFDF5` y borde `#A7F3D0`.
  - Compuerta humana / `NEEDS_REVIEW` / Modo sin conexión (Ámbar Industrial): `#B45309` sobre `#FEF3C7` y borde `#FCD34D`.
  - Error bloqueante / Rechazo / Cuota excedida (Carmesí): `#B91C1C` sobre `#FEF2F2` y borde `#FECACA`.
  - Texto principal `#111827` y secundario `#52525B`, garantizando contraste WCAG AA (`>= 4.5:1` en texto, `>= 3:1` en bordes activos e iconos).
- **Tipografía y numerales:**
  - Pila sans del sistema (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`) sin descargas a CDNs externos para cumplir operación 100 % offline y PWA instantánea.
  - Pila monoespaciada (`ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`) con `font-variant-numeric: tabular-nums` obligatoria para folios (`OS-2026-5551`), montos en colones (`₡185.000,00`), códigos CAByS de 13 dígitos, cédulas normalizadas, hashes SHA-256 y referencias de procedencia.
- **Ergonomía de campo y accesibilidad:**
  - Todos los botones operativos, chips de filtro, controles de stepper y entradas de formulario mantienen área táctil mínima de `44×44 px`.
  - Navegación completa por teclado con anillos `focus-visible`, etiquetas `<label>` explícitas, regiones `aria-live="polite"` para confirmaciones y `role="alert"` para bloqueos de negocio (`HTTP 409` / `402`).
  - Respeto estricto a `@media (prefers-reduced-motion: reduce)`.
  - Tono lingüístico uniforme en español profesional de Costa Rica (`es-CR`, trato consistente en «usted» o imperativo neutro técnico, eliminando la mezcla actual entre voseo y formal).
  - Iconografía mediante componentes SVG inline livianos sin fuentes de iconos externas ni peticiones de red.

## 2. Arquitectura de navegación (App Shell responsivo)

Se reemplaza el contenedor plano `max-w-3xl` por un **App Shell de ancho completo (`max-w-[1440px]`)** con rutas de vista gestionadas en cliente (hash o History API compatible con el fallback SPA de `apps/oficios/src/static-assets.ts` sin interceptar `/api`, `/healthz` ni `/readyz`):

- **Escritorio (`>= 1024px`):**
  - Barra lateral izquierda fija (`240px`, colapsable a `68px`) con identidad de `OficiOS`, nombre comercial de la organización activa, navegación principal e insignia del rol activo (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`).
  - Barra superior compacta (`56px`) con título de sección, buscador rápido de folio/cliente, pill persistente de estado de red/cola offline (`En línea` / `Sin conexión · N pendientes`) y botón primario `+ Nueva orden` (habilitado para roles con permiso de mutación).
- **Móvil y tablet (`< 1024px`):**
  - Cabecera compacta con título, estado de conectividad/cola y acceso rápido a `+ Nueva orden`.
  - Barra de navegación inferior fija con los destinos autorizados para el rol, diseñada para uso con el pulgar.
- **Cuatro secciones principales y visibilidad por rol:**
  1. **`Órdenes` (pantalla inicial por defecto para todos los roles):** operación diaria del taller.
  2. **`Clientes y equipos` (todos los roles):** directorio buscable, equipos asociados por serie y procedencia trazable.
  3. **`Data Exodus` (solo `ADMIN`):** migración asistida en 4 pasos sin CLI.
  4. **`Administración` (`ADMIN` completo; `AUDITOR_READONLY` solo lectura en auditoría y consumo; oculta para `OPERATOR`):** sub-pestañas `Organización y equipo`, `Fiscal (Hacienda)`, `Plan y consumo` y `Auditoría`.

La restricción visual por rol complementa el RBAC del servidor pero nunca lo sustituye: cualquier intento directo a un endpoint no autorizado sigue devolviendo `HTTP 403`.

## 3. Diseño detallado por vista

### 3.1 Vista `Órdenes` (Maestro-Detalle + Stepper de 7 estados)
- **Panel izquierdo (Bandeja de órdenes, `340px` en desktop / pantalla completa en móvil antes de abrir detalle):**
  - Chips de filtro con conteo: `Todas`, `En curso`, `Sin aprobación`, `Listas para cerrar`, `Cerradas`.
  - Búsqueda instantánea por folio, nombre legal del cliente o número de serie del equipo, manteniendo un acceso secundario por UUID directo para soporte/técnicos.
  - Tarjetas compactas con folio monoespaciado, badge de estado semántico, cliente, serie del equipo, monto presupuestado formateado en `₡` e indicador si tiene cambios pendientes offline.
  - Modal o panel deslizable `+ Nueva orden` para seleccionar cliente y equipo (con filtro rápido) y crear la orden sin ensuciar la cabecera principal.
- **Panel derecho (Detalle de la orden activa):**
  - **Encabezado de orden:** folio `OS-2026-XXXX`, badge de estado, cliente + equipo con botón compacto `Procedencia` (abre popover/panel con archivo y fila origen de `Data Exodus`), versión de concurrencia y estado fiscal (`Pendiente al cierre` o referencia de `FiscalIntent`).
  - **Stepper horizontal/compacto de 7 etapas:** `Recibida → Diagnosticada → Presupuestada → Aprobada → En intervención → Verificada → Cerrada`. Cada etapa distingue visualmente completada, actual y pendiente.
  - **Barra de siguiente acción contextual:** muestra un **único botón primario** correspondiente a la transición válida del estado actual (por ejemplo `Generar presupuesto` cuando está `DIAGNOSED`, `Iniciar intervención` cuando está `APPROVED`, `Verificar trabajo` cuando está `IN_PROGRESS`, `Cerrar y encolar comprobante` cuando está `VERIFIED`).
  - **Compuerta de aprobación del cliente integrada:** cuando la orden está `QUOTED` sin aprobación (o la API responde `HTTP 409` con `ERR_WORK_ORDER_APPROVAL_REQUIRED`), se muestra una tarjeta de compuerta ámbar prominente junto al stepper con el resumen del presupuesto en `₡` y el botón directo `Registrar aprobación del cliente`.
  - **Pestañas internas del detalle (evitando formularios interminables):**
    - `Diagnóstico y evidencia`: notas técnicas, lecturas estructuradas (p. ej. presión de succión PSI), guardado online u offline en IndexedDB, y dropzone de adjuntos (`JPEG/PNG/WEBP/PDF <= 5 MiB`) con `capture="environment"` en móvil, previsualización de miniatura y listado de archivos subidos.
    - `Materiales y CAByS`: buscador CAByS acoplado lateralmente o en desplegable de selección rápida; al pulsar un código CAByS se autocompleta en la línea del material. Entrada de precio en colones (p. ej. `1500.00`, convertido a entero `unitPriceMinor` sin errores de punto flotante), cantidad, cálculo inmediato de subtotal + IVA 13 % + total en `₡` y tabla clara de líneas agregadas.
    - `Historial y procedencia`: línea de tiempo de eventos de la orden, metadatos de `FiscalIntent` y panel de trazabilidad de migración del cliente/equipo.

### 3.2 Centro de sincronización offline (PWA)
- **Pill persistente en la barra superior:**
  - Verde sutil `En línea` cuando no hay cola pendiente.
  - Ámbar `Sin conexión` o `Sincronizando · N` cuando existen mutaciones en IndexedDB.
- **Cajón deslizable (`OfflineSyncDrawer`):**
  - Lista cada mutación pendiente en IndexedDB (`diagnóstico`, `material`, etc.) con folio de orden, hora local (`America/Costa_Rica`) y estado (`En cola`, `Sincronizando`, `Conflicto 409`).
  - Botón `Sincronizar ahora` cuando vuelve la conexión.
  - Ante `HTTP 409` (versión optimista desactualizada), muestra una tarjeta de conflicto explícita indicando la versión local frente a la versión actual en servidor con acciones claras (`Recargar orden del servidor` o `Descartar borrador local`), sin sobrescribir jamás cambios remotos silenciosamente.

### 3.3 Vista `Data Exodus` (Wizard de 4 pasos para `ADMIN`)
- Indicador de pasos superior: `1. Cargar archivo → 2. Perfilar columnas → 3. Resolver conflictos → 4. Reanudar carga`.
- **Paso 1:** Dropzone drag-and-drop para `.csv`, `.xlsx`, `.xml` con explicación clara de validaciones de seguridad (anti-XXE y límites de compresión) y mensajes de error accionables en rojo/ámbar si el archivo es rechazado.
- **Paso 2:** Tabla estructurada de columnas perfiladas con barra/badge de confianza y filtro rápido para destacar `NEEDS_REVIEW`.
- **Paso 3:** Tarjetas de conflicto con contexto de filas enfrentadas, selector de acción de resolución, campo obligatorio de justificación (`rationale`) y contador de conflictos resueltos vs. pendientes antes de habilitar el paso 4.
- **Paso 4:** Confirmación de `Reanudar carga` con resumen de clientes/equipos importados y enlace directo para abrirlos en `Clientes y equipos`.

### 3.4 Vista `Administración` (Sub-pestañas consolidadas)
- **Organización y equipo:** tarjeta de datos fiscales CR (nombre comercial, razón social, cédula normalizada, actividad económica) + formulario de alta de nueva organización cuando el usuario está en onboarding; lista de miembros con selector de rol, protección visible sobre el último `ADMIN`, formulario de invitación y aceptación por token.
- **Configuración fiscal (Hacienda):** estado actual del emisor (`sandbox` / `production`), formulario seguro `ADMIN` para cargar certificado `.p12`, PIN y credenciales IDP (campos enmascarados tipo `password` que se limpian tras el envío y nunca muestran secretos en pantalla ni logs), más tarjeta de compuerta `QG-07` con el botón `Promover a producción` mostrando requisitos verificados. Se aclara explícitamente que las pruebas locales loopback no equivalen a aceptación real ante Hacienda.
- **Plan y consumo:** carga automática al abrir la pestaña (manteniendo botón `Actualizar`), mostrando plan activo, estado de suscripción, barras de progreso por medidor (`asientos`, `órdenes/mes`, etc.) y banner preventivo al superar el 80 % o al recibir `HTTP 402`, aclarando siempre que los comprobantes fiscales ya encolados nunca se interrumpen.
- **Auditoría:** tabla paginada/filtrable sobre `GET /api/v1/audit-logs` (actor, acción, recurso y fecha en hora local de Costa Rica) para `ADMIN` y `AUDITOR_READONLY`.

## 4. Impacto en migraciones SQL, RLS y aislamiento de paquetes

- **Migraciones SQL (`qum_*`, `fob_*`, `ofi_*`, `saas_*`):** no se requieren nuevas tablas ni cambios de esquema SQL.
- **Políticas RLS:** todas las consultas nuevas o ampliadas (por ejemplo listado de órdenes para la bandeja `GET /api/v1/work-orders` si se requiere enriquecer con `customerLegalName` y `equipmentSerial`) se ejecutan estrictamente dentro de `withOfiTenantTransaction` respetando `FORCE ROW LEVEL SECURITY` y `NOSUPERUSER NOBYPASSRLS`.
- **Aislamiento de paquetes (`pnpm test:isolation`):** cero cambios en `packages/*`. Toda la lógica de UI, tokens CSS, formateo monetario visual y componentes vive dentro de `apps/oficios/web`.
- **Compatibilidad offline y CI:** sin fuentes externas, sin CDNs, sin servicios externos. El bundle estático sigue compilándose con Vite hacia `apps/oficios/web/dist` y sirviéndose desde `apps/oficios/src/server.ts`.
