export interface SemVerParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseSemVer(version: string): SemVerParts {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function cmpSemVer(a: SemVerParts, b: SemVerParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Verifica compatibilidad de contrato entre productor y consumidor.
 * - `consumer` puede ser versión fija (`1.2.0`) o rango caret (`^1.0.0`).
 * - Acepta mismo MAJOR con productor ≥ consumidor cuando el consumidor declara `^1.0.0`.
 * - Rechaza saltos de MAJOR (ej. productor `2.0.0` con consumidor `^1.0.0`).
 */
export function isContractCompatible(
  producerVersion: string,
  consumerVersionOrRange: string,
): boolean {
  const producer = parseSemVer(producerVersion);
  const range = consumerVersionOrRange.trim();
  if (range.startsWith("^")) {
    const base = parseSemVer(range.slice(1));
    if (producer.major !== base.major) {
      return false;
    }
    if (producer.major < base.major) {
      return false;
    }
    if (producer.major > base.major) {
      return false;
    }
    return cmpSemVer(producer, base) >= 0;
  }
  const consumer = parseSemVer(range);
  if (producer.major !== consumer.major) {
    return false;
  }
  return cmpSemVer(producer, consumer) >= 0;
}

export const CORE_CONTRACT_VERSION = "1.0.0" as const;