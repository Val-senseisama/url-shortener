import { Client } from "@neondatabase/serverless";
import { encodeToBase62 } from "./base62";

export interface DatabaseEnv {
  DATABASE_URL: string;
}

export interface UrlMapping {
  id: string;
  short_key: string;
  original_url: string;
  custom_alias: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

/**
 * Creates and connects a new PostgreSQL client.
 */
export async function getDbClient(env: DatabaseEnv): Promise<Client> {
  const client = new Client(env.DATABASE_URL);
  await client.connect();
  return client;
}

/**
 * Fetch a URL mapping by its short key.
 */
export async function getUrlByKey(client: Client, shortKey: string): Promise<UrlMapping | null> {
  const res = await client.query(
    "SELECT id, short_key, original_url, custom_alias, created_at, expires_at, is_active FROM urls WHERE short_key = $1 LIMIT 1",
    [shortKey]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0] as UrlMapping;
}

/**
 * Create a new short URL.
 * If customAlias is provided, it attempts to insert it directly.
 * Otherwise, it uses a transaction to reserve an ID and encode it to Base62.
 */
export async function createShortUrl(
  client: Client,
  originalUrl: string,
  customAlias?: string,
  expiresAt?: Date | null
): Promise<string> {
  if (customAlias) {
    // Attempt inserting with the custom alias. PostgreSQL UNIQUE constraint will fail if it exists.
    const res = await client.query(
      "INSERT INTO urls (short_key, original_url, expires_at, custom_alias) VALUES ($1, $2, $3, $4) RETURNING short_key",
      [customAlias, originalUrl, expiresAt || null, customAlias]
    );
    return res.rows[0].short_key;
  }

  // Two-step transaction: reserve auto-incrementing ID, then update with Base62 translation.
  await client.query("BEGIN");
  try {
    const insertRes = await client.query(
      "INSERT INTO urls (short_key, original_url, expires_at) VALUES ($1, $2, $3) RETURNING id",
      ["PENDING", originalUrl, expiresAt || null]
    );
    const id = insertRes.rows[0].id;
    const shortKey = encodeToBase62(id);

    await client.query(
      "UPDATE urls SET short_key = $1 WHERE id = $2",
      [shortKey, id]
    );

    await client.query("COMMIT");
    return shortKey;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * Log a click redirection event asynchronously to PostgreSQL.
 */
export async function logRedirectClick(
  client: Client,
  shortKey: string,
  countryCode: string | null,
  userAgent: string | null,
  referrer: string | null
): Promise<void> {
  await client.query(
    "INSERT INTO analytics (short_key, clicked_at, country_code, user_agent, referrer) VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4)",
    [shortKey, countryCode, userAgent, referrer]
  );
}
