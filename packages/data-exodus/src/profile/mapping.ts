import type { ColumnProfile, MappingColumn, MappingProposal, SchemaProfile } from "./types.js";

export const OFICIOS_V1_TARGET = "oficios-v1@1.0.0";

export const OFICIOS_V1_REQUIRED = [
  "customer.tax_id",
  "customer.legal_name",
  "invoice.amount",
] as const;

const REVIEW_BELOW = 0.8;

type Rule = {
  field: string;
  names: RegExp;
  patterns: readonly string[];
  confidenceName: number;
  confidenceBoth: number;
  transform: string;
  justification: string;
};

const RULES: readonly Rule[] = [
  {
    field: "customer.tax_id",
    names: /^(cedula|ced|identificacion|identificacion_cliente|id_fiscal)$/,
    patterns: ["CR_TAX_ID"],
    confidenceName: 0.74,
    confidenceBoth: 0.97,
    transform: "normalize_cr_id",
    justification: "diccionario_cr_id",
  },
  {
    field: "customer.legal_name",
    names: /^(razon_social|nombre_legal|nombre)$/,
    patterns: ["FREE_TEXT", "CODE", "UNKNOWN"],
    confidenceName: 0.93,
    confidenceBoth: 0.93,
    transform: "preserve_legal_name",
    justification: "diccionario_razon_social",
  },
  {
    field: "customer.legal_name",
    names: /^(cliente|nombre_cliente)$/,
    patterns: ["FREE_TEXT", "CODE", "UNKNOWN"],
    confidenceName: 0.78,
    confidenceBoth: 0.78,
    transform: "preserve_legal_name",
    justification: "diccionario_cliente_ambiguo",
  },
  {
    field: "customer.phone",
    names: /^(tel|telefono|celular|phone)$/,
    patterns: ["CR_PHONE"],
    confidenceName: 0.7,
    confidenceBoth: 0.94,
    transform: "normalize_cr_phone",
    justification: "diccionario_telefono",
  },
  {
    field: "customer.email",
    names: /^(correo|email|e_mail)$/,
    patterns: ["EMAIL"],
    confidenceName: 0.7,
    confidenceBoth: 0.95,
    transform: "normalize_email",
    justification: "diccionario_correo",
  },
  {
    field: "invoice.number",
    names: /^(numero_factura|num_factura|factura)$/,
    patterns: ["CODE", "FREE_TEXT", "UNKNOWN"],
    confidenceName: 0.9,
    confidenceBoth: 0.9,
    transform: "trim",
    justification: "diccionario_numero_factura",
  },
  {
    field: "invoice.issued_on",
    names: /^(fecha|fecha_emision|fechaemision|ultimo_servicio)$/,
    patterns: ["DATE_ISO", "DATE_DMY", "DATE_MIXED"],
    confidenceName: 0.72,
    confidenceBoth: 0.96,
    transform: "parse_cr_date",
    justification: "diccionario_fecha",
  },
  {
    field: "invoice.amount",
    names: /^(monto|monto_crc|total_comprobante|totalcomprobante|saldo|costo_promedio_crc|precio)$/,
    patterns: ["CURRENCY", "CURRENCY_MIXED"],
    confidenceName: 0.76,
    confidenceBoth: 0.95,
    transform: "parse_cr_currency",
    justification: "diccionario_monto",
  },
  {
    field: "invoice.currency",
    names: /^(moneda|codigo_moneda|codigomoneda)$/,
    patterns: ["CODE", "UNKNOWN"],
    confidenceName: 0.92,
    confidenceBoth: 0.92,
    transform: "normalize_currency_code",
    justification: "diccionario_moneda",
  },
  {
    field: "invoice.cabys",
    names: /cabys/,
    patterns: ["CABYS"],
    confidenceName: 0.86,
    confidenceBoth: 0.98,
    transform: "normalize_cabys",
    justification: "diccionario_cabys",
  },
  {
    field: "invoice.clave",
    names: /clave/,
    patterns: ["CLAVE_50", "CLAVE_CANDIDATE"],
    confidenceName: 0.7,
    confidenceBoth: 0.96,
    transform: "normalize_clave",
    justification: "diccionario_clave",
  },
  {
    field: "payment.reference",
    names: /^(referencia|id_pago)$/,
    patterns: ["CODE", "UNKNOWN", "FREE_TEXT"],
    confidenceName: 0.77,
    confidenceBoth: 0.77,
    transform: "trim",
    justification: "diccionario_referencia",
  },
  {
    field: "equipment.tag",
    names: /^(tag_equipo|serie)$/,
    patterns: ["CODE", "UNKNOWN", "FREE_TEXT"],
    confidenceName: 0.88,
    confidenceBoth: 0.88,
    transform: "trim",
    justification: "diccionario_equipo",
  },
  {
    field: "note.comment",
    names: /^(comentario|nota|notas|descripcion)$/,
    patterns: ["FREE_TEXT", "CODE", "UNKNOWN"],
    confidenceName: 0.55,
    confidenceBoth: 0.55,
    transform: "trim",
    justification: "texto_libre_baja_confianza",
  },
];

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function matchRule(column: ColumnProfile): Rule | null {
  const name = normalizeName(column.column);
  const matches = RULES.filter((rule) => rule.names.test(name));
  if (matches.length === 0) return null;
  const patterned = matches.find((rule) => rule.patterns.includes(column.dominantPattern));
  return patterned ?? matches[0]!;
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function yamlScalar(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  if (/^[a-zA-Z0-9_.:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function proposeMapping(
  profile: SchemaProfile,
  target: string = OFICIOS_V1_TARGET,
): MappingProposal {
  const drafted: MappingColumn[] = [];
  for (const source of profile.sources) {
    for (const column of source.columns) {
      const rule = matchRule(column);
      if (!rule) {
        drafted.push({
          sourceId: source.sourceId,
          column: column.column,
          targetField: null,
          confidence: 0,
          justification: "sin_regla_determinista",
          transform: null,
          status: "NEEDS_REVIEW",
          warning: null,
        });
        continue;
      }
      const patternHit = rule.patterns.includes(column.dominantPattern);
      let confidence = patternHit ? rule.confidenceBoth : rule.confidenceName;
      let warning: string | null = null;
      if (column.dominantPattern === "CURRENCY_MIXED" || column.dominantPattern === "DATE_MIXED") {
        confidence = Math.min(confidence, 0.79);
        warning = column.dominantPattern === "CURRENCY_MIXED" ? "WARN_MIXED_CURRENCY" : "WARN_MIXED_DATE";
      }
      if (column.dominantPattern === "CLAVE_CANDIDATE") {
        confidence = Math.min(confidence, 0.79);
        warning = "WARN_CLAVE_LENGTH";
      }
      drafted.push({
        sourceId: source.sourceId,
        column: column.column,
        targetField: rule.field,
        confidence: roundConfidence(confidence),
        justification: patternHit ? `${rule.justification}+patron:${column.dominantPattern}` : rule.justification,
        transform: rule.transform,
        status: confidence < REVIEW_BELOW ? "NEEDS_REVIEW" : "PROPOSED",
        warning,
      });
    }
  }

  const groups = new Map<string, MappingColumn[]>();
  for (const column of drafted) {
    if (!column.targetField) continue;
    const key = `${column.sourceId}\0${column.targetField}`;
    const list = groups.get(key) ?? [];
    list.push(column);
    groups.set(key, list);
  }
  const contested = new Set<MappingColumn>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const column of list) contested.add(column);
  }

  const columns = drafted
    .map((column) => {
      if (!contested.has(column)) return column;
      return {
        ...column,
        confidence: Math.min(column.confidence, 0.79),
        status: "NEEDS_REVIEW" as const,
        warning: column.warning ?? "WARN_AMBIGUOUS_TARGET",
        justification: `${column.justification}+ambiguo`,
      };
    })
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.column.localeCompare(b.column));

  const proposedFields = new Set(
    columns.filter((column) => column.status === "PROPOSED" && column.targetField).map((column) => column.targetField),
  );
  const unmappedRequired = OFICIOS_V1_REQUIRED.filter((field) => !proposedFields.has(field));

  return { target, columns, unmappedRequired };
}

export function renderMappingYaml(proposal: MappingProposal): string {
  const lines: string[] = [
    `target: ${yamlScalar(proposal.target)}`,
    "columns:",
  ];
  for (const column of proposal.columns) {
    lines.push(`  - source_id: ${yamlScalar(column.sourceId)}`);
    lines.push(`    column: ${yamlScalar(column.column)}`);
    lines.push(`    target_field: ${yamlScalar(column.targetField)}`);
    lines.push(`    confidence: ${yamlScalar(column.confidence)}`);
    lines.push(`    status: ${yamlScalar(column.status)}`);
    lines.push(`    transform: ${yamlScalar(column.transform)}`);
    lines.push(`    justification: ${yamlScalar(column.justification)}`);
    lines.push(`    warning: ${yamlScalar(column.warning)}`);
  }
  lines.push("unmapped_required:");
  if (proposal.unmappedRequired.length === 0) {
    lines.push("  []");
  } else {
    for (const field of proposal.unmappedRequired) {
      lines.push(`  - ${yamlScalar(field)} # WARN_MAPPING_UNMAPPED_REQUIRED`);
    }
  }
  return `${lines.join("\n")}\n`;
}
