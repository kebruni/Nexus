/**
 * Tiny RFC-6238 TOTP / RFC-4226 HOTP implementation using only Node's
 * built-in `crypto`. Avoids pulling in extra deps (`otplib`, `speakeasy`).
 *
 * Defaults match Google Authenticator / Authy:
 *   step = 30s, digits = 6, algorithm = SHA1
 *
 * Verification has a ±1 step window to tolerate clock skew.
 */

const crypto = require('crypto');

const STEP_SECONDS = 30;
const DIGITS = 6;

// Base32 (RFC 4648) — alphabet excludes 0/1/8 to avoid look-alikes.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateSecret(byteLength = 20) {
  const buf = crypto.randomBytes(byteLength);
  return base32Encode(buf);
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  const cleaned = String(str).replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** DIGITS;
  return String(code % mod).padStart(DIGITS, '0');
}

function totp(secretBase32, when = Date.now()) {
  const counter = Math.floor(when / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verify a token against the secret with ±window steps of skew tolerance.
 * Default window=1 → accepts current step ±30 s.
 */
function verifyTotp(secretBase32, token, { window = 1, when = Date.now() } = {}) {
  if (!token || typeof token !== 'string') return false;
  const cleaned = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(when / 1000 / STEP_SECONDS);
  const secretBuf = base32Decode(secretBase32);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBuf, counter + w) === cleaned) return true;
  }
  return false;
}

/**
 * Build an otpauth:// URI for QR code consumption by Google Authenticator,
 * Authy, 1Password, etc.
 */
function buildOtpAuthUrl({ secret, issuer = 'Nexus', label }) {
  const safeLabel = encodeURIComponent(label || 'admin');
  const safeIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${safeIssuer}:${safeLabel}?secret=${secret}&issuer=${safeIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/**
 * Generate one-time recovery codes (8 codes × 10 hex chars by default).
 * Returned in plaintext for display; persist hashed copies so a leaked
 * secrets file doesn't reveal them.
 */
function generateRecoveryCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const buf = crypto.randomBytes(5);
    const hex = buf.toString('hex'); // 10 chars
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codes;
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code.toLowerCase().replace(/-/g, '')).digest('hex');
}

module.exports = {
  generateSecret,
  totp,
  verifyTotp,
  buildOtpAuthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  base32Encode,
  base32Decode,
};
