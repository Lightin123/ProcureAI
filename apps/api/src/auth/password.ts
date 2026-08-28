import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

const ALGORITHM = "scrypt";
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Hashes are stored as `scrypt$N$r$p$salt$key`, so the parameters travel with
 * the hash and can be raised later without invalidating existing passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6) {
    return false;
  }

  const [algorithm, costRaw, blockSizeRaw, parallelismRaw, saltRaw, keyRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (algorithm !== ALGORITHM) {
    return false;
  }

  const cost = Number.parseInt(costRaw, 10);
  const blockSize = Number.parseInt(blockSizeRaw, 10);
  const parallelism = Number.parseInt(parallelismRaw, 10);
  if (Number.isNaN(cost) || Number.isNaN(blockSize) || Number.isNaN(parallelism)) {
    return false;
  }

  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(keyRaw, "base64");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let actual: Buffer;
  try {
    actual = await deriveKey(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Verified against when no user matches the submitted email, so that an unknown
 * address costs the same work as a wrong password and cannot be distinguished
 * by response timing.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "Ci2G7Mn0MW1KX5nJ8lVIYzKz3z0v6yqhH0P4h0aQ0mE=";

export async function verifyAgainstDummyHash(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}
