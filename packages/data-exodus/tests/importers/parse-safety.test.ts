import { describe, expect, it } from "vitest";

import { parseCsvRows } from "../../src/importers/csv-parse-rows.js";
import { parseJsonRows } from "../../src/importers/json.js";

describe("parseo seguro de CSV y JSON", () => {
  it("un campo entre comillas con saltos de línea es un solo registro", () => {
    const text = 'id,nota\r\n1,"línea uno\r\nlínea dos"\r\n2,ok\n';
    const { rows, counts } = parseCsvRows(text, {
      delimiter: ",",
      hasHeader: true,
      encoding: "utf-8",
    });

    expect(counts.totalRowsSeen).toBe(2);
    expect(counts.parsedOk).toBe(2);
    const first = rows[0]!;
    expect(first.lineNumber).toBe(2);
    expect(first.sourceLocator).toBe("csv:line:2");
    expect((first.rawPayload.fields as Record<string, string>).nota).toBe(
      "línea uno\r\nlínea dos",
    );
    expect(rows[1]!.lineNumber).toBe(4);
  });

  it("una comilla sin cerrar no fagocita las filas posteriores", () => {
    const text = 'id,valor\n1,ok\n2,"roto\n3,también-ok\n';
    const { rows, counts } = parseCsvRows(text, {
      delimiter: ",",
      hasHeader: true,
      encoding: "utf-8",
    });

    expect(counts.parseErrors).toBe(1);
    expect(rows.map((r) => r.parseStatus)).toEqual(["OK", "ERROR", "OK"]);
    expect(rows[2]!.sourceLocator).toBe("csv:line:4");
  });

  it("rechaza claves __proto__ en encabezados CSV y campos JSON", () => {
    expect(() =>
      parseCsvRows("__proto__,nombre\nx,Ana\n", {
        delimiter: ",",
        hasHeader: true,
        encoding: "utf-8",
      }),
    ).toThrow(/__proto__/);

    const json = parseJsonRows([
      JSON.parse('{"__proto__":{"polluted":true},"nombre":"Ana"}'),
      { nombre: "Beto" },
    ]);
    expect(json.counts.parseErrors).toBe(1);
    expect(json.rows[0]!.parseError).toContain("__proto__");
    expect(json.rows[1]!.parseStatus).toBe("OK");
    expect(Object.getPrototypeOf(json.rows[1]!.rawPayload.fields)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
