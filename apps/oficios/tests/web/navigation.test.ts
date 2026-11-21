import { describe, expect, it } from "vitest";

import { visibleSections } from "../../web/src/navigation.js";

describe("navegación por rol", () => {
  it("el operador no ve Data Exodus ni Administración", () => {
    expect(visibleSections("OPERATOR")).toEqual(["ordenes", "clientes"]);
  });

  it("el administrador ve las cuatro secciones", () => {
    expect(visibleSections("ADMIN")).toEqual(["ordenes", "clientes", "exodus", "admin"]);
  });

  it("el auditor ve administración y no la migración", () => {
    expect(visibleSections("AUDITOR_READONLY")).toEqual(["ordenes", "clientes", "admin"]);
  });
});
