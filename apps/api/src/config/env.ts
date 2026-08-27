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

export interface AppConfig {
  port: number;
  databaseUrl: string | undefined;
  databaseSsl: false | { rejectUnauthorized: boolean };
}

export function loadConfig(): AppConfig {
  loadEnvFile();

  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl === undefined || rawUrl.trim() === "" ? undefined : rawUrl;
  const strictSsl = process.env.DATABASE_SSL_STRICT === "true";

  return {
    port: resolvePort(process.env.PORT),
    databaseUrl,
    databaseSsl:
      databaseUrl !== undefined && isLocalHost(databaseUrl)
        ? false
        : { rejectUnauthorized: strictSsl },
  };
}
