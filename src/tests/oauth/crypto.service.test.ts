/**
 * WO-62: OAuth Crypto Service Tests
 * Tests for AES-256-GCM encryption/decryption of tokens
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the env config
vi.mock('../../config/env.js', () => ({
  env: {
    ENCRYPTION_SECRET: 'test-encryption-secret-32-chars!',
    DATABASE_URL: 'postgresql://test@localhost/test',
  },
}));

// Import after mocking
import { encrypt, decrypt, generateStateToken, hashValue, secureCompare } from '../../services/oauth/crypto.service.js';

describe('Crypto Service', () => {
  describe('AES-256-GCM Encryption', () => {
    it('should encrypt plaintext to non-readable format', () => {
      const plaintext = 'my-secret-access-token';
      const encrypted = encrypt(plaintext);
      
      // Encrypted should be in format: iv:authTag:encrypted
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);
      
      // Should not contain original plaintext
      expect(encrypted).not.toContain(plaintext);
      
      // IV should be 32 hex chars (16 bytes)
      expect(parts[0].length).toBe(32);
      
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1].length).toBe(32);
    });

    it('should decrypt to original plaintext', () => {
      const original = 'test-token-123456';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'same-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      // Random IV means different encrypted values each time
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle special characters in tokens', () => {
      const specialToken = 'token+with/special=chars&more!@#$%^';
      const encrypted = encrypt(specialToken);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(specialToken);
    });

    it('should handle unicode characters', () => {
      const unicodeToken = 'token-with-émojis-🔐-and-中文';
      const encrypted = encrypt(unicodeToken);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(unicodeToken);
    });

    it('should handle long tokens (1000+ chars)', () => {
      const longToken = 'a'.repeat(2000);
      const encrypted = encrypt(longToken);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(longToken);
      expect(decrypted.length).toBe(2000);
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('only:two')).toThrow('Invalid encrypted data format');
    });

    it('should throw on tampered ciphertext (auth tag validation)', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      
      // Tamper with the encrypted portion
      const tampered = `${parts[0]}:${parts[1]}:aaaa${parts[2].slice(4)}`;
      
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      
      // Tamper with auth tag
      const tampered = `${parts[0]}:0000${parts[1].slice(4)}:${parts[2]}`;
      
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('State Token Generation', () => {
    it('should generate 64-character hex string (32 bytes)', () => {
      const state = generateStateToken();
      
      expect(state.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(state)).toBe(true);
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        tokens.add(generateStateToken());
      }
      
      expect(tokens.size).toBe(100);
    });
  });

  describe('Hash Value', () => {
    it('should produce consistent SHA-256 hash', () => {
      const input = 'test-value';
      const hash1 = hashValue(input);
      const hash2 = hashValue(input);
      
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashValue('input1');
      const hash2 = hashValue('input2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Secure Compare', () => {
    it('should return true for equal strings', () => {
      expect(secureCompare('test', 'test')).toBe(true);
      expect(secureCompare('abc123', 'abc123')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(secureCompare('test', 'test!')).toBe(false);
      expect(secureCompare('abc', 'abd')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(secureCompare('short', 'longer-string')).toBe(false);
    });
  });
});
