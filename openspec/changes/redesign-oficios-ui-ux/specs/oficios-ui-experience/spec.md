## ADDED Requirements

### Requirement: El App Shell responsivo prioriza la operación de órdenes y adapta la navegación al dispositivo y rol

La interfaz web de `OficiOS` SHALL presentar un App Shell responsivo con navegación dedicada por secciones (`Órdenes`, `Clientes y equipos`, `Data Exodus`, `Administración`), SHALL abrir por defecto en la vista de `Órdenes` en lugar de apilar formularios administrativos encima, y SHALL adaptar la visibilidad de secciones y acciones de mutación al rol autenticado (`ADMIN`, `OPERATOR`, `AUDITOR_READONLY`) sin sustituir las verificaciones autoritativas del servidor.

#### Scenario: Técnico OPERATOR abre la aplicación en escritorio o móvil

- **WHEN** un usuario autenticado con rol `OPERATOR` abre la ruta raíz de `OficiOS`
- **THEN** la aplicación muestra directamente la bandeja y operación de `Órdenes`, oculta las vistas administrativas exclusivas de `ADMIN` y ofrece navegación lateral en escritorio o barra inferior fija en pantalla móvil

#### Scenario: Auditor de solo lectura visualiza información sin controles de escritura activos

- **WHEN** un usuario autenticado con rol `AUDITOR_READONLY` navega entre `Órdenes` y las vistas de auditoría o consumo
- **THEN** la interfaz muestra los datos autorizados en modo solo lectura con controles de mutación deshabilitados y el servidor continúa rechazando cualquier mutación directa con HTTP `403`

### Requirement: La bandeja de órdenes y el stepper visual guían las transiciones y compuertas de aprobación

La vista de `Órdenes` SHALL ofrecer una bandeja filtrable por estado y buscable por folio, cliente o número de serie, SHALL representar el progreso de la orden seleccionada mediante un stepper de 7 etapas (`Recibida` hasta `Cerrada`) con una acción primaria contextual para la siguiente transición válida, y SHALL integrar en línea la compuerta de aprobación del cliente cuando exista bloqueo HTTP `409`.

#### Scenario: Selección y avance guiado de una orden presupuestada sin aprobación

- **WHEN** el usuario selecciona una orden en estado presupuestado desde la bandeja e intenta iniciar la intervención sin aprobación previa del cliente
- **THEN** la interfaz muestra la compuerta de aprobación junto al stepper destacando el bloqueo sin perder el contexto de la orden y ofrece la acción directa para registrar la aprobación del cliente

#### Scenario: Filtrado de órdenes por estado evita copiar UUIDs manualmente

- **WHEN** el usuario aplica un filtro de estado o escribe el nombre del cliente en la bandeja de órdenes
- **THEN** la lista se acota a las órdenes coincidentes del tenant activo y al seleccionar una tarjeta se carga su detalle completo en el panel principal

### Requirement: El registro de materiales integra CAByS y presenta montos en colones con precisión entera

El formulario de materiales de una orden SHALL integrar la búsqueda del catálogo CAByS para poblar el código seleccionado con una acción directa, SHALL mostrar e ingresar montos en colones costarricenses (`₡`) con numerales tabulares y cálculo inmediato de subtotal e IVA 13 %, y SHALL enviar a la API cantidades exactas en unidades enteras menores sin errores de redondeo binario.

#### Scenario: Selección de repuesto CAByS calcula IVA 13 % y persiste unidades menores exactas

- **WHEN** el técnico busca un repuesto en el catálogo CAByS, selecciona un resultado e ingresa un precio unitario en colones con cantidad válida
- **THEN** el formulario rellena el código CAByS, muestra el subtotal e IVA 13 % formateados en `₡` con alineación tabular y persiste el monto exacto en unidades menores al guardar

### Requirement: La evidencia fotográfica de diagnóstico valida antes de subir y muestra previsualización

El control de evidencia del diagnóstico SHALL ofrecer zona de carga y soporte de captura móvil, SHALL validar en cliente los tipos permitidos (`JPEG`, `PNG`, `WEBP`, `PDF`) y el límite de 5 MiB antes de enviar al servidor, y SHALL mostrar previsualización o confirmación clara del adjunto persistido.

#### Scenario: Archivo con formato no permitido se rechaza con mensaje claro

- **WHEN** el usuario selecciona un archivo fuera de los formatos permitidos o superior a 5 MiB en el panel de evidencia
- **THEN** la interfaz informa el motivo del rechazo de forma accesible sin emitir una carga inválida ni perder las notas del diagnóstico

### Requirement: El centro PWA hace visible la cola offline y resuelve conflictos 409 de forma explícita

La cabecera de `OficiOS` SHALL mostrar de forma persistente el estado de conectividad y el conteo de mutaciones pendientes en IndexedDB, SHALL proporcionar un cajón de sincronización con detalle de operaciones en cola y reintento manual, y SHALL presentar una resolución explícita cuando el servidor devuelva HTTP `409` por conflicto de versión optimista sin sobrescribir silenciosamente los cambios remotos.

#### Scenario: Técnico registra diagnóstico sin conexión y sincroniza al reconectar

- **WHEN** el navegador pierde conectividad y el técnico guarda una nota de diagnóstico
- **THEN** el indicador de cabecera cambia a estado sin conexión con el contador de operaciones pendientes y, al recuperar red, vacía la cola actualizando el indicador a sincronizado

#### Scenario: Conflicto optimista HTTP 409 al sincronizar se expone en el cajón offline

- **WHEN** una mutación en cola falla al reconectar con HTTP `409` porque la orden cambió en el servidor
- **THEN** el cajón de sincronización marca la operación en conflicto y ofrece recargar el estado remoto o descartar el borrador local sin sobrescribir datos del servidor

### Requirement: Data Exodus guía la migración asistida en cuatro pasos desde la web

La vista de `Data Exodus` SHALL presentar un asistente guiado de cuatro pasos (`Subir`, `Perfilar`, `Resolver conflictos`, `Reanudar`) para roles `ADMIN`, SHALL destacar en formato tabular las columnas marcadas `NEEDS_REVIEW` y SHALL exigir justificación explícita por conflicto antes de habilitar la reanudación de la carga.

#### Scenario: Asistente guiado conduce desde la carga hasta la reanudación

- **WHEN** un `ADMIN` sube un archivo válido, ejecuta el perfilado, registra una decisión con justificación sobre cada conflicto abierto y pulsa `Reanudar carga`
- **THEN** el asistente refleja el avance por paso, confirma los registros importados y ofrece acceso directo a los clientes cargados

### Requirement: Administración consolida organización, consumo, auditoría y bóveda fiscal sin exponer secretos

La vista de `Administración` SHALL unificar en sub-pestañas el perfil de organización y equipo, el consumo de plan con carga automática, la bitácora de auditoría y la configuración fiscal `ADMIN` (`.p12`, PIN, IDP y promoción `sandbox → production`), SHALL limpiar y ocultar secretos en pantalla y logs, y SHALL distinguir explícitamente la verificación loopback de la aceptación real ante Hacienda.

#### Scenario: Carga de credenciales fiscales desde Administración protege el material sensible

- **WHEN** un `ADMIN` envía un certificado `.p12`, PIN y credenciales desde la sub-pestaña fiscal
- **THEN** la interfaz limpia los campos sensibles tras la respuesta, muestra únicamente metadatos no secretos y el estado de promoción `sandbox` o `production`

#### Scenario: Plan y consumo se carga automáticamente y advierte antes de HTTP 402

- **WHEN** un `ADMIN` abre la sub-pestaña de plan y consumo
- **THEN** la interfaz muestra automáticamente el plan vigente, el uso frente a los límites configurados y una advertencia visible cuando el consumo se aproxima o alcanza el límite sin sugerir interrupción de comprobantes fiscales ya encolados

### Requirement: El sistema visual cumple ergonomía de campo, accesibilidad WCAG AA y operación 100 % offline

La interfaz web SHALL operar sin depender de hojas de estilo, fuentes ni iconos alojados en CDNs externos, SHALL mantener contraste mínimo WCAG AA y objetivos táctiles de al menos `44×44 px` en controles operativos principales, y SHALL utilizar un registro lingüístico uniforme en español `es-CR` respetando `prefers-reduced-motion` y navegación por teclado.

#### Scenario: Renderizado del bundle estático sin acceso a Internet

- **WHEN** el navegador carga la aplicación compilada en un entorno sin acceso a Internet
- **THEN** todos los estilos, iconos y controles se renderizan completos sin peticiones fallidas a terceros ni degradación funcional
