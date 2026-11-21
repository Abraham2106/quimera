import { describe, expect, it } from "vitest";

import { resolveDemoHvacFixtureRoot } from "../../src/demo/resolve-repo-root.js";
import {
  loadDemoHvacTabularSources,
  profileTables,
  proposeMapping,
  renderMappingYaml,
} from "../../src/profile/index.js";
import type { TabularSource } from "../../src/profile/types.js";

const STANDARD_COLUMNS: ReadonlyArray<{
  sourceId: string;
  column: string;
  pattern: string;
}> = [
  { sourceId: "ventas_2025.csv", column: "identificacion_cliente", pattern: "CR_TAX_ID" },
  { sourceId: "ventas_2025.csv", column: "cabys", pattern: "CABYS" },
  { sourceId: "ventas_2025.csv", column: "monto_crc", pattern: "CURRENCY" },
  { sourceId: "ventas_2025.csv", column: "fecha", pattern: "DATE_ISO" },
  { sourceId: "pagos.csv", column: "identificacion_cliente", pattern: "CR_TAX_ID" },
  { sourceId: "pagos.csv", column: "monto_crc", pattern: "CURRENCY" },
  { sourceId: "pagos.csv", column: "fecha", pattern: "DATE_ISO" },
  { sourceId: "inventario.csv", column: "costo_promedio_crc", pattern: "CURRENCY" },
  { sourceId: "equipos_hvac.csv", column: "identificacion_cliente", pattern: "CR_TAX_ID" },
  { sourceId: "equipos_hvac.csv", column: "ultimo_servicio", pattern: "DATE_ISO" },
  { sourceId: "notas.csv", column: "identificacion_cliente", pattern: "CR_TAX_ID" },
  { sourceId: "notas.csv", column: "monto_crc", pattern: "CURRENCY" },
  { sourceId: "notas.csv", column: "fecha", pattern: "DATE_ISO" },
  { sourceId: "clientes.xlsx", column: "identificacion", pattern: "CR_TAX_ID" },
  { sourceId: "fe", column: "Clave", pattern: "CLAVE_CANDIDATE" },
];

describe("T-DATA-004 / AT-04 perfil estructural", () => {
  it("detecta ≥95% de columnas estándar CR en los 7 archivos sin IA", async () => {
    const root = resolveDemoHvacFixtureRoot(import.meta.url);
    const sources = await loadDemoHvacTabularSources(root);
    expect(sources).toHaveLength(7);
    expect(sources.every((source) => source.rows.length > 0)).toBe(true);

    const profile = profileTables(sources);
    expect(profile.estimated).toBe(false);

    let hits = 0;
    for (const expected of STANDARD_COLUMNS) {
      const column = profile.sources
        .find((source) => source.sourceId === expected.sourceId)
        ?.columns.find((entry) => entry.column === expected.column);
      if (column?.dominantPattern === expected.pattern) hits += 1;
    }
    expect(hits / STANDARD_COLUMNS.length).toBeGreaterThanOrEqual(0.95);

    const ventasMonto = profile.sources
      .find((source) => source.sourceId === "ventas_2025.csv")
      ?.columns.find((column) => column.column === "monto_crc");
    expect(ventasMonto?.nullRate).toBe(0);

    const mixed = profileTables([
      {
        sourceId: "mixto.csv",
        columns: ["monto", "fecha"],
        rows: [
          { monto: "₡1500.00", fecha: "2025-01-02" },
          { monto: "$20.00", fecha: "03/01/2025" },
          { monto: "CRC 10.00", fecha: "2025-01-04" },
          { monto: "USD 3.50", fecha: "05/01/2025" },
        ],
      },
    ]);
    expect(mixed.sources[0]?.columns[0]?.dominantPattern).toBe("CURRENCY_MIXED");
    expect(mixed.sources[0]?.columns[1]?.dominantPattern).toBe("DATE_MIXED");

    const clave = profileTables([
      {
        sourceId: "clave.csv",
        columns: ["clave"],
        rows: [{ clave: "1".repeat(50) }, { clave: "2".repeat(50) }],
      },
    ]);
    expect(clave.sources[0]?.columns[0]?.dominantPattern).toBe("CLAVE_50");
  });
});

describe("T-DATA-005 / AT-05 mapping.yaml", () => {
  it("emite YAML determinista con confianza y NEEDS_REVIEW en ambiguos", () => {
    const sources: TabularSource[] = [
      {
        sourceId: "clientes.csv",
        columns: ["cedula", "identificacion", "razon_social", "comentario"],
        rows: [
          {
            cedula: "9001000001",
            identificacion: "9001000001",
            razon_social: "Taller Sintetico Uno",
            comentario: "texto libre de diagnostico",
          },
          {
            cedula: "9001000002",
            identificacion: "9001000002",
            razon_social: "Taller Sintetico Dos",
            comentario: "otra nota larga de revision tecnica",
          },
        ],
      },
    ];
    const proposal = proposeMapping(profileTables(sources));
    const again = renderMappingYaml(proposeMapping(profileTables(sources)));
    const yaml = renderMappingYaml(proposal);
    expect(yaml).toBe(again);
    expect(yaml).toContain("target: oficios-v1@1.0.0");
    expect(yaml).toContain("confidence:");
    expect(yaml).toContain("justification:");

    const contested = proposal.columns.filter(
      (column) => column.column === "cedula" || column.column === "identificacion",
    );
    expect(contested).toHaveLength(2);
    expect(contested.every((column) => column.status === "NEEDS_REVIEW")).toBe(true);
    expect(contested.every((column) => column.targetField === "customer.tax_id")).toBe(true);

    const comment = proposal.columns.find((column) => column.column === "comentario");
    expect(comment?.status).toBe("NEEDS_REVIEW");
    expect(comment?.confidence).toBeLessThan(0.8);

    const legal = proposal.columns.find((column) => column.column === "razon_social");
    expect(legal?.status).toBe("PROPOSED");
    expect(legal?.confidence).toBeGreaterThanOrEqual(0.8);

    const unmapped = proposeMapping(
      profileTables([
        {
          sourceId: "solo.csv",
          columns: ["sku"],
          rows: [{ sku: "SKU-0001" }],
        },
      ]),
    );
    expect(unmapped.unmappedRequired).toEqual([
      "customer.tax_id",
      "customer.legal_name",
      "invoice.amount",
    ]);
    expect(renderMappingYaml(unmapped)).toContain("WARN_MAPPING_UNMAPPED_REQUIRED");
  });
});
