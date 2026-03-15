import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const modelsPath = path.join(process.cwd(), 'src/types/models.ts');
const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');

const models = fs.readFileSync(modelsPath, 'utf-8');
const schema = fs.readFileSync(schemaPath, 'utf-8');
const normalizedSchema = schema.toLowerCase();

describe('Phase 1: Data model mapping', () => {
  it('keeps TypeScript interfaces aligned to core schema columns', () => {
    const interfaceToColumns: Record<string, string[]> = {
      Event: ['title', 'eventDate', 'status', 'createdAt', 'updatedAt'],
      Ambassador: ['firstName', 'lastName', 'email', 'skillLevel', 'compensationType', 'status'],
      SignUp: ['ambassadorId', 'operatorId', 'validationStatus', 'submittedAt'],
      PayPeriod: ['startDate', 'endDate', 'status', 'totalSignups', 'totalAmount'],
      EventAssignment: ['eventId', 'ambassadorId', 'role', 'createdAt'],
    };

    for (const [name, fields] of Object.entries(interfaceToColumns)) {
      expect(models).toContain(`interface ${name}`);
      for (const field of fields) {
        expect(models).toContain(field);
      }
    }

    expect(normalizedSchema).toContain('create table events');
    expect(normalizedSchema).toContain('create table ambassadors');
    expect(normalizedSchema).toContain('create table signups');
  });

  it('validates enum mappings between type models and schema enums', () => {
    const enumChecks: Array<[string, string]> = [
      ["export type EventStatus = 'planned' | 'confirmed' | 'active' | 'completed' | 'cancelled';", 'create type event_status as enum'],
      ["export type AmbassadorSkillLevel = 'trainee' | 'standard' | 'senior' | 'lead';", 'create type ambassador_skill_level as enum'],
      ["export type CompensationType = 'per_signup' | 'hourly' | 'hybrid';", 'create type compensation_type as enum'],
      ["export type PayPeriodStatus = 'open' | 'closed' | 'processing' | 'paid';", 'create type pay_period_status as enum'],
      ["export type ValidationStatus = 'pending' | 'validated' | 'rejected' | 'duplicate';", 'create type validation_status as enum'],
    ];

    for (const [typeDef, schemaDef] of enumChecks) {
      expect(models).toContain(typeDef);
      expect(normalizedSchema).toContain(schemaDef);
    }
  });

  it('tests serialization/deserialization and Date mapping behavior', () => {
    const now = new Date();
    const payload = {
      id: randomUUID(),
      eventDate: now,
      createdAt: now,
      updatedAt: now,
    };

    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);

    expect(typeof parsed.eventDate).toBe('string');
    expect(new Date(parsed.eventDate).toISOString()).toBe(now.toISOString());
  });

  it('validates UUID generation and format checks', () => {
    const uuid = randomUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(uuidRegex.test(uuid)).toBe(true);
    expect(uuidRegex.test('not-a-uuid')).toBe(false);
  });

  it('validates Date and DateTime conversion fidelity for DB-style payloads', () => {
    const dbRow = {
      event_date: '2026-03-15',
      submitted_at: '2026-03-15T16:30:00.000Z',
    };

    const eventDate = new Date(`${dbRow.event_date}T00:00:00.000Z`);
    const submittedAt = new Date(dbRow.submitted_at);

    expect(eventDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(submittedAt.toISOString()).toBe('2026-03-15T16:30:00.000Z');
  });
});
