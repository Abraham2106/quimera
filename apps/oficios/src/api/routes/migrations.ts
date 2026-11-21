import { Hono } from "hono";

import { errorResponse } from "../errors.js";
import type { OficiosAppEnv } from "../middleware/request-context.js";
import {
  listMigrationConflicts,
  MigrationRejected,
  profileMigrationRun,
  recordMigrationDecision,
  resumeMigrationRun,
  uploadMigrationSource,
} from "../services/migration-workbench.js";

function rejected(error: MigrationRejected) {
  return errorResponse(error.status, error.code, error.status === 409 ? "CONFLICT" : "VALIDATION", error.message);
}

export function createMigrationRoutes() {
  const app = new Hono<OficiosAppEnv>();

  app.post("/uploads", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      const { status, body: errBody } = errorResponse(400, "ERR_VALIDATION", "VALIDATION", "Adjuntá un archivo en el campo file.");
      return c.json(errBody, status);
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadMigrationSource(c.get("sql"), c.get("tenantId"), c.get("actorId"), {
        name: file.name,
        mime: file.type,
        bytes,
      });
      return c.json({ ok: true, ...result }, 201);
    } catch (error) {
      if (error instanceof MigrationRejected) {
        const { status, body: errBody } = rejected(error);
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.post("/:runId/profile", async (c) => {
    try {
      const result = await profileMigrationRun(c.get("sql"), c.get("tenantId"), c.req.param("runId"));
      return c.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof MigrationRejected) {
        const { status, body: errBody } = rejected(error);
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.get("/:runId/conflicts", async (c) => {
    try {
      const conflicts = await listMigrationConflicts(c.get("sql"), c.get("tenantId"), c.req.param("runId"));
      return c.json({ ok: true, conflicts });
    } catch (error) {
      if (error instanceof MigrationRejected) {
        const { status, body: errBody } = rejected(error);
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.post("/:runId/decisions", async (c) => {
    const body = await c.req.json<{ conflictId?: string; action?: string; rationale?: string }>();
    try {
      const decision = await recordMigrationDecision(
        c.get("sql"),
        c.get("tenantId"),
        c.req.param("runId"),
        c.get("actorId"),
        {
          conflictId: body.conflictId ?? "",
          action: body.action ?? "",
          rationale: body.rationale ?? "",
        },
      );
      return c.json({ ok: true, decision }, 201);
    } catch (error) {
      if (error instanceof MigrationRejected) {
        const { status, body: errBody } = rejected(error);
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  app.post("/:runId/resume", async (c) => {
    try {
      const result = await resumeMigrationRun(c.get("sql"), c.get("tenantId"), c.req.param("runId"));
      return c.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof MigrationRejected) {
        const { status, body: errBody } = rejected(error);
        return c.json(errBody, status);
      }
      throw error;
    }
  });

  return app;
}
