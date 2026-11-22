# Product

<!-- impeccable:product-schema 1 -->

Hechos tomados de `apps/oficios/README.md` y del README del monorepo. No hubo ronda de confirmación: cada frase de abajo está en esos documentos o marcada como abierta.

## Platform

web

## Users

Talleres técnicos en Costa Rica. El perfil inicial es HVAC y refrigeración (`hvac-refrigeration-v1`). Quien opera la app recibe órdenes, diagnostica en campo y cierra hacia facturación sin depender de conexión permanente.

## Product Purpose

OficiOS es la aplicación de referencia local-first de QUIMERA para el ciclo de un taller: recepción, diagnóstico con materiales y CAByS, presupuesto, aprobación del cliente, intervención, verificación y cierre con un único `FiscalIntent`. El éxito es no ejecutar ni cerrar una orden sin la aprobación del cliente, y conservar la procedencia de cada cliente y equipo migrado.

## Positioning

El bloqueo es de negocio, no de interfaz: sin aprobación del cliente la API responde HTTP 409 y no se inicia ni se cierra la orden. La procedencia de Data Exodus (archivo y fila) viaja con el cliente y el equipo.

## Operating Context

Español profesional (`es-CR`). API Hono en `127.0.0.1:8787`, PostgreSQL 16, UI React 19 + Vite + Tailwind en `web/`. El técnico puede guardar diagnóstico sin red; la cola local se sincroniza al volver la conexión.

## Capabilities and Constraints

- Flujo: recepción → diagnóstico → presupuesto → aprobación → intervención → verificación → cierre.
- Materiales en colones con IVA 13% y códigos CAByS.
- Evidencia foto o PDF, tope 5 MiB.
- Autenticación del MVP: cabeceras de prueba (`x-tenant-id`, `x-test-role`, `x-actor-id`). OIDC/JWT/MFA queda abierto antes de salir de loopback.
- RLS propio de tablas `ofi_*` en producción multi-tenant: abierto.
- WhatsApp desactivado salvo `QUIMERA_WHATSAPP_ENABLED=true`. Nunca aprueba ni cierra órdenes.
- La UI de referencia no carga fuentes ni iconos desde una CDN.

## Brand Commitments

Nombre OficiOS, dentro de QUIMERA. Voz en español de taller, sin anglicismos de interfaz. Folios, montos y CAByS en cifras tabulares.

## Evidence on Hand

- Código y pruebas en `apps/oficios/`.
- Flujos: `docs/10-experience/oficios-user-flows.md`.
- No hay testimonios, precios de planes ni capturas de clientes reales en el repositorio. No inventarlos.

## Product Principles

- La aprobación del cliente es una compuerta, no un aviso.
- Lo que se muestra en colones y en folios tiene que poder leerse dígito a dígito.
- Sin red, el diagnóstico no se pierde.
- La procedencia de un dato migrado se puede preguntar.
- Nada de la interfaz depende de un recurso externo para arrancar.

## Accessibility & Inclusion

La interfaz de referencia apunta a contraste WCAG AA y objetivos táctiles de al menos 44×44 px, con `prefers-reduced-motion`.
