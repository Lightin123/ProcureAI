const DEFAULT_PORT = 4000;

function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present; rely on the ambient environment instead.
  }
}

function resolvePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function isLocalHost(connectionString: string): boolean {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function resolvePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function resolveAllowedOrigins(port: number): string[] {
  const configured = process.env.ALLOWED_ORIGINS;
  if (configured !== undefined && configured.trim() !== "") {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== "");
  }

  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];
}

/**
 * How many reverse proxies sit in front of this process.
 *
 * `request.ip` keys the login and registration rate limiters, so this is not
 * cosmetic: behind an untrusted proxy every caller shares one address and the
 * registration limiter would lock out the whole internet after five attempts.
 * The default is the local-development value, which trusts nothing external.
 * A deployment behind Render (and behind Netlify's proxy in front of it) sets
 * the hop count explicitly — see docs/engineering/deployment.md.
 */
function resolveTrustProxy(): string | number | boolean {
  const configured = process.env.TRUST_PROXY;
  if (configured === undefined || configured.trim() === "") {
    return "loopback";
  }

  const trimmed = configured.trim();
  const hops = Number.parseInt(trimmed, 10);
  return Number.isNaN(hops) ? trimmed : hops;
}

export type StorageDriver = "local";

const STORAGE_DRIVERS: readonly StorageDriver[] = ["local"];

function resolveStorageDriver(): StorageDriver {
  const configured = process.env.STORAGE_DRIVER;
  if (configured === undefined || configured.trim() === "") {
    return "local";
  }

  const trimmed = configured.trim() as StorageDriver;
  if (!STORAGE_DRIVERS.includes(trimmed)) {
    throw new Error(
      `Invalid STORAGE_DRIVER value: ${configured}. Supported drivers: ${STORAGE_DRIVERS.join(", ")}.`,
    );
  }

  return trimmed;
}

function resolveUploadDir(): string | undefined {
  const configured = process.env.UPLOAD_DIR;
  return configured === undefined || configured.trim() === "" ? undefined : configured.trim();
}

export interface AppConfig {
  port: number;
  databaseUrl: string | undefined;
  databaseSsl: false | { rejectUnauthorized: boolean };
  aiServiceUrl: string;
  aiServiceToken: string | undefined;
  aiServiceTimeoutMs: number;
  sessionCookieSecure: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  allowedOrigins: string[];
  trustProxy: string | number | boolean;
  storageDriver: StorageDriver;
  uploadDir: string | undefined;
  isProduction: boolean;
}

export function loadConfig(): AppConfig {
  loadEnvFile();

  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl === undefined || rawUrl.trim() === "" ? undefined : rawUrl;
  const strictSsl = process.env.DATABASE_SSL_STRICT === "true";
  const port = resolvePort(process.env.PORT);
  const isProduction = process.env.NODE_ENV === "production";
  const aiServiceToken = process.env.AI_SERVICE_TOKEN;

  return {
    port,
    databaseUrl,
    databaseSsl:
      databaseUrl !== undefined && isLocalHost(databaseUrl)
        ? false
        : { rejectUnauthorized: strictSsl },
    aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000",
    aiServiceToken:
      aiServiceToken === undefined || aiServiceToken.trim() === "" ? undefined : aiServiceToken,
    aiServiceTimeoutMs: Number.parseInt(process.env.AI_SERVICE_TIMEOUT_MS ?? "60000", 10),
    sessionCookieSecure:
      process.env.SESSION_COOKIE_SECURE === undefined
        ? isProduction
        : process.env.SESSION_COOKIE_SECURE === "true",
    sessionIdleMinutes: resolvePositiveInt(process.env.SESSION_IDLE_MINUTES, 60),
    sessionAbsoluteHours: resolvePositiveInt(process.env.SESSION_ABSOLUTE_HOURS, 12),
    allowedOrigins: resolveAllowedOrigins(port),
    trustProxy: resolveTrustProxy(),
    storageDriver: resolveStorageDriver(),
    uploadDir: resolveUploadDir(),
    isProduction,
  };
}

/**
 * Refuses to start a production process whose configuration would lose data or
 * leave a boundary open. Called once from the entry point rather than from
 * `loadConfig`, so a misconfiguration fails the deploy loudly instead of
 * failing one request at a time.
 *
 * Every check here is production-only: local development is unaffected.
 */
export function assertProductionConfig(config: AppConfig): void {
  if (!config.isProduction) {
    return;
  }

  const problems: string[] = [];

  if (config.databaseUrl === undefined) {
    problems.push("DATABASE_URL is not set.");
  }

  if (process.env.ALLOWED_ORIGINS === undefined || process.env.ALLOWED_ORIGINS.trim() === "") {
    problems.push(
      "ALLOWED_ORIGINS is not set. It must list the browser origin the portal is served from, " +
        "or every state-changing request will be rejected as a foreign origin.",
    );
  }

  if (!config.sessionCookieSecure) {
    problems.push("SESSION_COOKIE_SECURE is false in production; the session cookie needs Secure.");
  }

  // The local driver on a platform with an ephemeral filesystem loses every
  // uploaded document on each deploy while the rows referencing them survive.
  // Pointing UPLOAD_DIR at a mounted persistent disk is the explicit
  // acknowledgement that the path outlives the container.
  if (config.storageDriver === "local" && config.uploadDir === undefined) {
    problems.push(
      "STORAGE_DRIVER=local requires UPLOAD_DIR to point at a persistent, mounted path in " +
        "production. The default directory lives inside the deployment and is erased on every " +
        "restart, taking vendor compliance documents and response attachments with it.",
    );
  }

  if (config.aiServiceToken === undefined) {
    problems.push(
      "AI_SERVICE_TOKEN is not set. The AI service would then be called unauthenticated, and " +
        "must itself be reachable without a token for that to work.",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with an unsafe production configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
