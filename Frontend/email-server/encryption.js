/**
 * Backend Encryption Utility for Email Server
 * Handles secure encryption/decryption of email passwords
 * Uses crypto module (Node.js native) for AES-256 encryption
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a stable encryption key from the master key
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!masterKey) {
    // SECURITY: Fail strictly in production if encryption master key is missing
    if (nodeEnv === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: ENCRYPTION_MASTER_KEY is not set in production. ' +
        'This is a required environment variable. Generate one using crypto.randomBytes(32).toString(\'hex\') ' +
        'and set it in your production environment variables before deploying.'
      );
    }

    // Development-only fallback with warning
    console.warn(
      '⚠️  ENCRYPTION_MASTER_KEY not set. Using development key. ' +
      'MUST set this in .env for production.'
    );
    return crypto.pbkdf2Sync('loster-email-server-dev-key-change-in-prod', 'loster-email-server', 100000, KEY_LENGTH, 'sha256');
  }

  // Use PBKDF2 to derive a stable key from the master key
  return crypto.pbkdf2Sync(masterKey, 'loster-email-server', 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} plainText - The data to encrypt (password, credentials)
 * @returns {string} Encrypted data in format: iv:encryptedData:authTag (all hex-encoded)
 */
export function encryptPassword(plainText) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return format: iv:encryptedData:authTag (all hex-encoded)
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt password');
  }
}

/**
 * Decrypt sensitive data using AES-256-GCM
 * @param {string} encryptedData - The encrypted data in format: iv:encryptedData:authTag
 * @returns {string} Decrypted plain text
 */
export function decryptPassword(encryptedData) {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt password. Master key may be incorrect.');
  }
}

/**
 * Check if a string is encrypted (contains colons separating iv:data:tag)
 * @param {string} text - The text to check
 * @returns {boolean} true if text appears to be encrypted
 */
export function isEncrypted(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  // Check if it matches the encryption format: hex:hex:hex
  const parts = text.split(':');
  if (parts.length !== 3) {
    return false;
  }
  return parts.every((part) => /^[0-9a-f]*$/.test(part) && part.length > 0);
}

/**
 * Generate a new encryption master key for production setup
 * Store this in ENCRYPTION_MASTER_KEY environment variable
 * @returns {string} A random 64-character hex string suitable as encryption key
 */
export function generateMasterKey() {
  return crypto.randomBytes(32).toString('hex');
}
