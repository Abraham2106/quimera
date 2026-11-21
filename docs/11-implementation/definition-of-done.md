# Definition of Done (DoD) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Normativo para cada historia del backlog, slice y release
- **Referencias:** [Quality Gates](../08-quality/quality-gates.md) | [Backlog](./implementation-backlog.md)

---

## 1. DoD a Nivel de Historia de Usuario (`US-xxx`)

Una historia del backlog se considera **TERMINADA** únicamente cuando cumple **todos** estos criterios:

1. **Código limpio y tipado:** Compila con `tsc --noEmit` en modo `strict`, pasa ESLint sin advertencias críticas y respeta las fronteras de módulo (ningún `packages/*` importa `apps/*` ni `@quimera/adapter-clairic`).
2. **Contratos sincronizados:** Si la historia crea o cambia un contrato Zod público, se regeneró el JSON Schema Draft 2020-12 y las pruebas de contrato pasan.
3. **Pruebas verificables en verde:** Existen y pasan las pruebas exactas listadas en la columna *Pruebas requeridas* del backlog (unitarias, integración PostgreSQL, propiedad o seguridad según aplique), 100% deterministas y sin depender de Internet.
4. **Cero secretos ni PII real:** Ningún secreto, archivo `.p12` ni cédula/dato personal real de ciudadanos costarricenses aparece en código, logs o fixtures.
5. **Diagnósticos claros:** Los errores devuelven `QuimeraError` tipado; las salidas CLI soportan `--json` limpio en `stdout` con logs únicamente en `stderr`.
6. **Documentación actualizada:** Si cambió una interfaz, comando CLI o decisión técnica relevante, se actualiza el documento correspondiente (o se crea un ADR).

---

## 2. DoD a Nivel de Vertical Slice (Slices 1–7)

Un slice está completo cuando:
1. Todas las historias `Must` del slice cumplen el DoD de historia.
2. Existe al menos una prueba de integración o aceptación (`AT-xx`) ejecutada de punta a punta sobre PostgreSQL real (cuando el slice usa BD).
3. El slice sigue funcionando al 100% con `QUIMERA_AI_ENABLED=false` y sin `@quimera/adapter-clairic`.
4. Los commits están limpios y el estado de `docs/IMPLEMENTATION_STATUS.md` está actualizado.

---

## 3. DoD del MVP (Listo para Demostración de Hackathon)

1. `QG-01`, `QG-03`, `QG-04` y `QG-06` en verde.
2. `pnpm demo:verify` completa los 4 actos en máquina limpia **sin conexión a Internet**.
3. `T-CORE-003` confirma que cada paquete `@quimera/*` puede instalarse independientemente sin `OficiOS` ni `Clairic`.
4. `Factura CI` detecta `FC-017` y `FC-031` sobre `demo-pos-buggy` y aprueba `25/25` sobre `demo-pos-outbox`.
5. No queda ningún requisito `Must` de `requirements-catalog.md` sin prueba ejecutable asociada.
