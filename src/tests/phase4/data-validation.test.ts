import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const signupPayloadSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email(),
  operatorId: z.coerce.number().int().positive(),
  customerState: z.string().trim().length(2).transform((value) => value.toUpperCase()),
});

function sanitizeFreeText(input: string): string {
  return input.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

describe('Phase 4: Data validation', () => {
  it('validates and normalizes valid payloads with Zod', () => {
    const result = signupPayloadSchema.parse({
      customerName: '  Jane Doe  ',
      customerEmail: '  jane@example.com ',
      operatorId: '42',
      customerState: 'ny',
    });

    expect(result.customerName).toBe('Jane Doe');
    expect(result.customerEmail).toBe('jane@example.com');
    expect(result.operatorId).toBe(42);
    expect(result.customerState).toBe('NY');
  });

  it('rejects invalid payloads for required field, email, and operator id', () => {
    const invalid = signupPayloadSchema.safeParse({
      customerName: '',
      customerEmail: 'invalid-email',
      operatorId: 0,
      customerState: 'new-york',
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const fields = invalid.error.issues.map((issue) => issue.path.join('.'));
      expect(fields).toContain('customerName');
      expect(fields).toContain('customerEmail');
      expect(fields).toContain('operatorId');
      expect(fields).toContain('customerState');
    }
  });

  it('sanitizes free-text input to reduce unsafe markup and noisy whitespace', () => {
    const dirty = '  <script>alert("xss")</script> Promo   code   used ';
    expect(sanitizeFreeText(dirty)).toBe('alert("xss") Promo code used');
  });
});
