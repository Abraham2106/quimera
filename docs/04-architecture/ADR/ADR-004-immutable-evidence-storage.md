# ADR-004: Almacenamiento Inmutable de Evidencia (`ArtifactStorePort` CAS SHA-256)

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-DATA-002`, `QR-OUT-006`, `QR-SEC-005`, `QR-SEC-006`, `QR-SEC-010`

## Contexto
Data Exodus ingesta archivos originales (CSV, XLSX, XML), OficiOS captura fotografías de diagnóstico y Fiscal Outbox genera XML firmados y respuestas XML de Hacienda que en Costa Rica deben retenerse por 5 años (1.825 días).

## Problema
Definir dónde y cómo almacenar los binarios originales de evidencia garantizando inmutabilidad, deduplicación, portabilidad local-a-nube y sin degradar el rendimiento de PostgreSQL.

## Alternativas evaluadas
1. **Puerto `ArtifactStorePort` con almacenamiento direccionado por contenido (CAS por SHA-256):** disco local en MVP (`./.quimera-store/sha256/<aa>/<hash>`) y S3/Cloudflare R2 en producción.
2. **Almacenar binarios directamente en columnas `BYTEA` de PostgreSQL.**
3. **Referenciar rutas originales del usuario en disco sin copiarlas.**

## Criterios de decisión
Inmutabilidad comprobable, rendimiento de backups PostgreSQL, funcionamiento 100% offline en MVP, compatibilidad con retención WORM de 5 años en producción.

## Evidencia relevante
- Guardar archivos Excel/fotos/XML en `BYTEA` infla el WAL y los backups de PostgreSQL.
- Referenciar rutas en el disco del usuario falla si el archivo es movido, editado o borrado antes de una auditoría o reanudación.
- CAS por `SHA-256` deduplica archivos idénticos automáticamente y detecta corrupción de bits al leer.

## Decisión
Adoptar **`ArtifactStorePort` direccionado por contenido (`SHA-256`)**, particionado por `tenantId` en el prefijo lógico de acceso, con adaptador local en sistema de archivos (`LocalCasArtifactStore`) para MVP/CI y adaptador S3/Cloudflare R2 (con Object Lock opcional) para producción. PostgreSQL guarda únicamente los metadatos (`source_artifacts`: `id`, `tenant_id`, `sha256`, `storage_uri`, `size_bytes`, `mime_type`).

## Consecuencias
- **Positivas:** Inmutabilidad verificable al leer, 0 duplicación de archivos repetidos, backups rápidos de PostgreSQL y migración transparente a R2/S3.
- **Negativas:** Requiere respaldar dos recursos en producción (PostgreSQL + bucket R2/S3) y asegurar recolección de basura controlada solo para artefactos huérfanos no referenciados tras ventana legal.

## Riesgos
- **Riesgo:** Manipulación externa de un archivo en el disco local en modo desarrollo.
- **Mitigación:** Verificación obligatoria de `SHA-256` en lecturas críticas y reanudaciones (`QR-SEC-006`).

## Condiciones de revisión
Ninguna prevista; el puerto abstrae cualquier backend de objetos futuro.
