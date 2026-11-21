import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDistDir = path.join(packageRoot, "web", "dist");

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export async function resolveStaticAssetDir(): Promise<string | null> {
  const envDir = process.env.OFICIOS_STATIC_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  try {
    await access(path.join(defaultDistDir, "index.html"));
    return defaultDistDir;
  } catch {
    return null;
  }
}

export function isReservedHttpPath(pathname: string): boolean {
  return pathname === "/healthz" || pathname === "/readyz" || pathname.startsWith("/api/") || pathname === "/api";
}

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function resolveSafeFile(staticDir: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const candidate = path.resolve(staticDir, relative);
  const root = path.resolve(staticDir);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return candidate;
}

export async function serveStaticAsset(
  staticDir: string,
  urlPath: string,
  method: string,
  res: ServerResponse,
): Promise<boolean> {
  const primary = resolveSafeFile(staticDir, urlPath);
  if (!primary) return false;
  const tryPaths = [primary];
  const base = path.basename(primary);
  if (!path.extname(base) && primary !== path.join(staticDir, "index.html")) {
    tryPaths.push(path.join(staticDir, "index.html"));
  }
  for (const filePath of tryPaths) {
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      res.statusCode = 200;
      res.setHeader("content-type", contentTypeFor(filePath));
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "no-referrer");
      if (method === "HEAD") {
        res.end();
        return true;
      }
      res.end(await readFile(filePath));
      return true;
    } catch {
      // next candidate
    }
  }
  return false;
}
