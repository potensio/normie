/**
 * Seed Normie API key from .env to database
 * 
 * Run: node scripts/seed-normie-key.js
 */

const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(key, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function main() {
  const bedrockApiKey = process.env.BEDROCK_API_KEY;
  const bedrockBaseUrl = process.env.BEDROCK_BASE_URL;

  if (!bedrockApiKey || !bedrockBaseUrl) {
    console.error('❌ BEDROCK_API_KEY and BEDROCK_BASE_URL must be set in .env');
    process.exit(1);
  }

  console.log('Seeding Normie API key to database...');
  console.log(`  Base URL: ${bedrockBaseUrl}`);

  const encrypted = encrypt(bedrockApiKey);
  const preview = '...' + bedrockApiKey.slice(-4);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  // Upsert
  await client.query(`
    INSERT INTO system_api_keys (provider, key_encrypted, key_preview, base_url)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (provider) DO UPDATE SET
      key_encrypted = EXCLUDED.key_encrypted,
      key_preview = EXCLUDED.key_preview,
      base_url = EXCLUDED.base_url,
      updated_at = NOW()
  `, ['normie', encrypted, preview, bedrockBaseUrl]);

  console.log('✓ Normie API key seeded successfully');
  console.log(`  Preview: ${preview}`);

  await client.end();
}

main().catch(console.error);