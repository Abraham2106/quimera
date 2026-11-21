# ADR-010: Estrategia de Pruebas Fiscales y Límites entre Hacienda SDK, Fiscal Outbox y Factura CI

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-FCI-001`..`008`, `QR-OUT-001`..`007`, `QR-SEC-012`

## Contexto
La inspección directa de `DojoCodingLabs/hacienda-cr@0.13.0` reveló que ya cuenta con validadores XML/XSD (`xmllint-wasm`), firma XAdES-EPES, `verifySignedDocumentXml`, el módulo `delivery` (`DocumentStore`, `FileDocumentStore`, `VALID_TRANSITIONS`, `classifySendResult`, `evaluateDeadline`) y un simulador interno de transporte (`packages/mock`, privado/no publicado en npm).

## Problema
Evitar duplicar la suite de pruebas y lógica interna de `hacienda-cr`, estableciendo una frontera precisa entre lo que hace el SDK, lo que añade `Fiscal Outbox` y lo que verifica `Factura CI`.

## Alternativas evaluadas
1. **Especialización complementaria:**
   - `@dojocoding/hacienda-sdk` = primitivos fiscales (XML 4.4, firma, clave, calendario, interfaz `DocumentStore`, reglas `VALID_TRANSITIONS` / `classifySendResult`).
   - `@quimera/fiscal-outbox` = capa transaccional multi-proceso en PostgreSQL (`PgDocumentStore`, tabla de intenciones por pedido, reserva atómica de consecutivos por `issuerId`, worker con `SKIP LOCKED` y lease).
   - `@quimera/factura-ci` = harness de pruebas de caja negra/conductuales contra la **aplicación del desarrollador (SUT)** con simulador loopback propio e inyección de fallos.
2. **Reescribir la máquina de estados y validadores XML dentro de QUIMERA.**
3. **Limitar Factura CI a pruebas unitarias de generación XML.**

## Criterios de decisión
Cero duplicación con `hacienda-cr`, máxima detección de bugs reales en apps producidas por humanos o agentes IA, reproducibilidad total en CI sin sandbox de Hacienda.

## Evidencia relevante
- `hacienda-cr/docs/production-integration.md` enumera explícitamente lo que el SDK **NO** provee: cola durable multi-proceso, idempotencia por pedido, contadores en BD compartidos por `issuerId` y coordinación multi-réplica.
- `hacienda-cr/packages/mock/README.md` indica explícitamente que es un paquete privado del workspace no publicado en npm y restringido a loopback sin redirecciones.

## Decisión
Adoptar la **frontera de especialización complementaria**:
- `Fiscal Outbox` implementa `PgDocumentStore` sobre `DocumentStore` del SDK y resuelve concurrencia, consecutivos por `issuerId`, idempotencia comercial y recuperación de workers.
- `Factura CI` implementa su propio simulador determinista HTTP loopback (`127.0.0.1` exclusivo, sin redirecciones, siguiendo la misma disciplina de seguridad que `hacienda-cr/packages/mock`) y prueba **invariantes de aplicación (SUT)** (`FC-001`..`FC-024`), delegando la validación estructural XML al SDK.
- Ninguna prueba de `Factura CI` utiliza credenciales reales ni afirma certificación oficial del Ministerio de Hacienda.

## Consecuencias
- **Positivas:** Cero código fiscal duplicado; valor inmediatamente demostrable al comparar `demo-pos-buggy` (falla) vs `demo-pos-outbox` (pasa).
- **Negativas:** Dependencia de evolución de `@dojocoding/hacienda-sdk` (acotada fijando rango `^0.13.0` y contrato adaptador).

## Riesgos
- **Riesgo:** Cambio incompatible en `hacienda-sdk` antes de v1.0.
- **Mitigación:** Encapsular llamadas al SDK detrás de un adaptador delgado y fijar versión en `pnpm-lock.yaml` con tests de contrato.

## Condiciones de revisión
Si `DojoCodingLabs/hacienda-cr` publica oficialmente `@dojocoding/hacienda-mock` en npm, evaluar reemplazar el servidor HTTP loopback interno de `Factura CI` por dicho paquete manteniendo los escenarios e inyector de fallos de `Factura CI`.
