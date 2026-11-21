# ADR-014: Estrategia de Extensibilidad y Plugins

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-010`, `QR-DATA-014`, `QR-PASS-001`, `QR-OFI-002`

## Contexto
QUIMERA aspira a crecer hacia nuevos formatos de entrada (SQLite, JSON, PDF), nuevos pasaportes de APIs (SNIT, Correos CR, países LATAM), nuevos oficios en OficiOS y extractores opcionales (Clairic) sin modificar el código central de cada motor.

## Problema
Diseñar un mecanismo de extensibilidad limpio y seguro que evite sobreingeniería (como carga dinámica insegura de código remoto o sistemas complejos de hooks en runtime) en el MVP.

## Alternativas evaluadas
1. **Extensibilidad basada en Ports & Adapters + Registros Tipados (`ImporterRegistry`, `PassportRegistry`, `StepRegistry`, `TradeContractRegistry`) con manifiestos declarativos YAML/JSON validados por Zod.**
2. **Sistema dinámico de carga de plugins arbitrarios desde red/npm en runtime.**
3. **Hardcodear cada formato, API y oficio mediante condicionales `switch`.**

## Criterios de decisión
Seguridad de supply chain, facilidad para contribuidores OSS, capacidad de descubrir capacidades (`capabilities discovery`) y simplicidad en MVP.

## Evidencia relevante
- Cargar y ejecutar scripts externos no auditados desde manifiestos crea vectores graves de ejecución remota de código (RCE).
- Los registros explícitos tipados permiten que un contribuidor agregue un nuevo pasaporte YAML o un nuevo `SourceImporterPort` con su propia suite de pruebas de contrato sin tocar el motor.

## Decisión
Adoptar **Ports & Adapters + Registros Declarativos Estáticos** con introspección de capacidades (`capabilities()`):
- Nuevos pasaportes de `CR API Passport` se agregan como manifiestos declarativos + fixtures + tests de contrato.
- Nuevos importadores de `Data Exodus` implementan `SourceImporterPort` y se registran explícitamente.
- Nuevos extractores IA implementan `StructuredExtractorPort`.
- Nuevos oficios en `OficiOS` se declaran mediante `TradeContract` (campos, mediciones, guardas de transición).
- Ningún manifiesto YAML/JSON puede ejecutar código arbitrario.

## Consecuencias
- **Positivas:** Extensibilidad segura, verificable en CI y sencilla para contribuidores OSS.
- **Negativas:** Agregar código ejecutable de un plugin externo requiere instalar el paquete npm y registrarlo explícitamente en la composición (comportamiento seguro deseado).

## Riesgos
- **Riesgo:** Rigidez si un tercero quiere transformar campos con expresiones personalizadas en `mapping.yaml`.
- **Mitigación:** Ofrecer una biblioteca acotada y segura de transformadores declarativos predefinidos (`trim`, `uppercase`, `normalize_cr_id`, `parse_cr_money`, `parse_date_dmy`) sin `eval()`.

## Condiciones de revisión
Si en fase de ecosistema de plugins (post-v1) se requieren transformaciones de terceros, evaluar sandbox WASM aislado con cuota estricta de CPU/memoria.
