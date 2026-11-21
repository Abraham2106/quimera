import { getPassportById, PassportClient } from "@quimera/cr-api-passport";

export type CabysSearchResponse = {
  readonly ok: true;
  readonly query: string;
  readonly data: unknown;
  readonly meta: {
    readonly fromCache: boolean;
    readonly source: "fixture" | "passport-fixture";
  };
};

const LOCAL_STUB = {
  total: 1,
  cantidad: 1,
  cabys: [
    {
      codigo: "8415109010100",
      descripcion: "Equipo de refrigeracion comercial (stub local)",
      impuesto: 13,
      categorias: ["maquinaria"],
    },
  ],
};

export async function searchCabysCatalog(query: string): Promise<CabysSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      ok: true,
      query: trimmed,
      data: { total: 0, cantidad: 0, cabys: [] },
      meta: { fromCache: true, source: "fixture" },
    };
  }

  try {
    const passport = await getPassportById("cr.hacienda.cabys");
    if (passport) {
      const client = new PassportClient({ mode: "fixture" });
      const result = await client.query(passport, "searchByText", { q: trimmed });
      if (result.ok) {
        return {
          ok: true,
          query: trimmed,
          data: result.data,
          meta: {
            fromCache: result.meta.fromCache,
            source: "passport-fixture",
          },
        };
      }
    }
  } catch {
    // fixture offline — usar stub local
  }

  return {
    ok: true,
    query: trimmed,
    data: LOCAL_STUB,
    meta: { fromCache: true, source: "fixture" },
  };
}