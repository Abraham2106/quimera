import postgres from "postgres";

const LOCAL_DATABASE_URL = "postgres://quimera:quimera@127.0.0.1:5432/quimera";

export function createOficiosPostgresClient(
  databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
): postgres.Sql {
  return postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}