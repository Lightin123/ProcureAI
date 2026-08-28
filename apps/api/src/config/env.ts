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

export interface AppConfig {
  port: number;
  databaseUrl: string | undefined;
  databaseSsl: false | { rejectUnauthorized: boolean };
  aiServiceUrl: string;
  aiServiceTimeoutMs: number;
  sessionCookieSecure: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  allowedOrigins: string[];
}

export function loadConfig(): AppConfig {
  loadEnvFile();

  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl === undefined || rawUrl.trim() === "" ? undefined : rawUrl;
  const strictSsl = process.env.DATABASE_SSL_STRICT === "true";
  const port = resolvePort(process.env.PORT);
  const isProduction = process.env.NODE_ENV === "production";

  return {
    port,
    databaseUrl,
    databaseSsl:
      databaseUrl !== undefined && isLocalHost(databaseUrl)
        ? false
        : { rejectUnauthorized: strictSsl },
    aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000",
    aiServiceTimeoutMs: Number.parseInt(process.env.AI_SERVICE_TIMEOUT_MS ?? "60000", 10),
    sessionCookieSecure:
      process.env.SESSION_COOKIE_SECURE === undefined
        ? isProduction
        : process.env.SESSION_COOKIE_SECURE === "true",
    sessionIdleMinutes: resolvePositiveInt(process.env.SESSION_IDLE_MINUTES, 60),
    sessionAbsoluteHours: resolvePositiveInt(process.env.SESSION_ABSOLUTE_HOURS, 12),
    allowedOrigins: resolveAllowedOrigins(port),
  };
}
