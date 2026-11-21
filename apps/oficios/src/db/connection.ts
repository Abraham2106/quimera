import postgres from "postgres";

export function createOficiosPostgresClient(
  databaseUrl = process.env.DATABASE_URL,
): postgres.Sql {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for OficiOS PostgreSQL access");
  }
  return postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}