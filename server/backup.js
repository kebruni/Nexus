/**
 * Backup / Restore for the persisted store.
 *
 * Exports the in-memory snapshot (events, alerts, scripts, webhooks,
 * schedules, chat, groups, plus the agents map for reference) as a
 * gzipped JSON blob. Optionally encrypts the JSON payload with
 * AES-256-GCM under a key derived from a user-supplied password via
 * scrypt — the resulting envelope is still gzipped JSON so it's
 * trivial to inspect with `gunzip < file | jq`.
 *
 * Secrets (JWT_SECRET, AGENT_SECRET, bcrypt password hashes, TOTP
 * secrets, recovery codes) are NOT included. They live in
 * `.data/secrets.json` and are intentionally left behind so a backup
 * can't be used to impersonate users.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const scrypt = promisify(crypto.scrypt);

const MAGIC = 'nexus-backup';
const VERSION = 1;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

/**
 * Build a backup envelope for the given snapshot.
 *
 * @param {object} snapshot   from store._snapshot()
 * @param {object} extras     extra non-store data (e.g. agents list)
 * @param {string=} password  if set, encrypt the payload
 * @returns {Promise<Buffer>}
 */
async function createBackup(snapshot, extras = {}, password = null) {
  const data = { ...snapshot, ...extras };
  const payload = Buffer.from(JSON.stringify(data), 'utf8');

  let envelope;
  if (password) {
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = await scrypt(password, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    envelope = {
      magic: MAGIC,
      version: VERSION,
      createdAt: new Date().toISOString(),
      encrypted: true,
      cipher: 'aes-256-gcm',
      kdf: { name: 'scrypt', N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, keyLen: KEY_LEN },
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  } else {
    envelope = {
      magic: MAGIC,
      version: VERSION,
      createdAt: new Date().toISOString(),
      encrypted: false,
      data,
    };
  }

  return await gzip(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

/**
 * Parse a backup blob and return the embedded snapshot. If the
 * envelope is encrypted, `password` must be provided.
 *
 * @param {Buffer} blob
 * @param {string=} password
 * @returns {Promise<{ snapshot: object, meta: object }>}
 */
async function readBackup(blob, password = null) {
  let json;
  try {
    const buf = await gunzip(blob);
    json = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`Not a valid backup file (gunzip/parse failed: ${e.message})`);
  }

  if (json.magic !== MAGIC) {
    throw new Error(`Not a Nexus backup (got magic="${json.magic}")`);
  }
  if (json.version !== VERSION) {
    throw new Error(`Unsupported backup version: ${json.version}`);
  }

  let data;
  if (json.encrypted) {
    if (!password) throw new Error('This backup is encrypted — a password is required');
    if (json.cipher !== 'aes-256-gcm') {
      throw new Error(`Unsupported cipher: ${json.cipher}`);
    }
    const salt = Buffer.from(json.salt, 'base64');
    const iv = Buffer.from(json.iv, 'base64');
    const tag = Buffer.from(json.tag, 'base64');
    const ciphertext = Buffer.from(json.ciphertext, 'base64');
    const kdf = json.kdf || { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, keyLen: KEY_LEN };
    let key;
    try {
      key = await scrypt(password, salt, kdf.keyLen, { N: kdf.N, r: kdf.r, p: kdf.p });
    } catch (e) {
      throw new Error(`Key derivation failed: ${e.message}`);
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let plain;
    try {
      plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error('Wrong password or corrupted backup');
    }
    data = JSON.parse(plain.toString('utf8'));
  } else {
    data = json.data;
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Backup payload is empty or malformed');
  }

  return {
    snapshot: data,
    meta: {
      createdAt: json.createdAt,
      version: json.version,
      encrypted: !!json.encrypted,
    },
  };
}

/**
 * Inspect a backup without applying it. Returns counts so the UI can
 * show a "this backup contains N events, M scripts, …" preview.
 */
function summarizeSnapshot(snap) {
  const arrayCount = (a) => (Array.isArray(a) ? a.length : 0);
  const objCount = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
  return {
    events: arrayCount(snap.eventLog),
    alerts: arrayCount(snap.alerts),
    alertRules: arrayCount(snap.alertRules),
    scripts: arrayCount(snap.scripts),
    webhooks: arrayCount(snap.webhooks),
    schedules: arrayCount(snap.schedules),
    groups: objCount(snap.groups),
    chatThreads: objCount(snap.chatMessages),
  };
}

module.exports = { createBackup, readBackup, summarizeSnapshot, MAGIC, VERSION };
