export type ColumnPattern =
  | "CR_TAX_ID"
  | "CR_PHONE"
  | "CABYS"
  | "CLAVE_50"
  | "CLAVE_CANDIDATE"
  | "CURRENCY"
  | "CURRENCY_MIXED"
  | "DATE_ISO"
  | "DATE_DMY"
  | "DATE_MIXED"
  | "EMAIL"
  | "FREE_TEXT"
  | "CODE"
  | "UNKNOWN";

export type TabularSource = {
  readonly sourceId: string;
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, string>[];
};

export type ColumnProfile = {
  readonly sourceId: string;
  readonly column: string;
  readonly nullRate: number;
  readonly distinctCount: number;
  readonly minLength: number;
  readonly maxLength: number;
  readonly sampleSize: number;
  readonly rowCount: number;
  readonly patterns: readonly ColumnPattern[];
  readonly dominantPattern: ColumnPattern;
};

export type SourceProfile = {
  readonly sourceId: string;
  readonly rowCount: number;
  readonly sampled: boolean;
  readonly columns: readonly ColumnProfile[];
};

export type SchemaProfile = {
  readonly version: "1";
  readonly estimated: boolean;
  readonly sources: readonly SourceProfile[];
};

export type MappingStatus = "PROPOSED" | "NEEDS_REVIEW";

export type MappingColumn = {
  readonly sourceId: string;
  readonly column: string;
  readonly targetField: string | null;
  readonly confidence: number;
  readonly justification: string;
  readonly transform: string | null;
  readonly status: MappingStatus;
  readonly warning: string | null;
};

export type MappingProposal = {
  readonly target: string;
  readonly columns: readonly MappingColumn[];
  readonly unmappedRequired: readonly string[];
};
