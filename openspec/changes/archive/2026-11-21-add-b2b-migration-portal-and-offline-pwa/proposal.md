# Portal web de migración B2B (Data Exodus) y modo offline PWA en OficiOS

## Why

En el MVP la migración con `Data Exodus` y la resolución de conflictos (`decisions-demo.yaml`) se operan únicamente desde la CLI, y la interfaz web de `OficiOS` asume conectividad continua sin soporte de carga real de fotografías de diagnóstico. Para que talleres técnicos y agencias implementadoras usen QUIMERA como SaaS B2B real, necesitan: (1) una consola web de onboarding/migración con cola visual de conflictos, (2) carga real de evidencia fotográfica en diagnósticos y (3) operación offline-resiliente en móvil (PWA + IndexedDB) para técnicos en campo sin señal.

## What changes

1. Definir la capacidad `saas-web-workbench-pwa` para la consola web de `Data Exodus` (subida segura de CSV/XLSX/XML FE, inspección interactiva de `mapping.yaml` y `NEEDS_REVIEW`, bandeja de resolución de conflictos con registro inmutable y disparo/reanudación de pipelines) y la cola offline PWA de técnicos de campo.
2. Extender `oficios-workshop-flow` para adjuntar archivos/fotografías de diagnóstico respaldados por `ArtifactStorePort` con límites de tamaño/MIME.

## Impact

- App y paquetes afectados: `apps/oficios` (nuevas rutas API de carga/migración/adjuntos, UI React/Vite para workbench de Data Exodus y service worker + IndexedDB sync queue) y consumo de los puertos existentes de `@quimera/data-exodus` y `@quimera/pipeline`.
- No introduce ninguna dependencia inversa desde `@quimera/*` hacia `apps/oficios` (`pnpm test:isolation` sin cambios).

## Fuera de alcance

- Extracción automática por visión artificial obligatoria (permanece como mejora opcional en `@quimera/adapter-clairic` bajo `QUIMERA_AI_ENABLED`).
- Aplicaciones nativas iOS/Android en tiendas (PWA instalable cubre el primer despliegue B2B).
