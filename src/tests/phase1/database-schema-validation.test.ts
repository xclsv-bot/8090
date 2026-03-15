import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
const normalized = schemaSql.toLowerCase();

describe('Phase 1: Database schema validation', () => {
  it('contains all required Phase 1 core tables', () => {
    const requiredTables = ['events', 'ambassadors', 'signups', 'pay_periods', 'event_assignments'];

    for (const table of requiredTables) {
      expect(normalized).toContain(`create table ${table}`);
    }
  });

  it('defines core column types, defaults, and not-null constraints', () => {
    expect(normalized).toContain('id uuid primary key default gen_random_uuid()');
    expect(normalized).toContain('title varchar(255) not null');
    expect(normalized).toContain("status event_status not null default 'planned'");

    expect(normalized).toContain('first_name varchar(100) not null');
    expect(normalized).toContain('email varchar(255) unique not null');

    expect(normalized).toContain('ambassador_id uuid not null references ambassadors(id) on delete cascade');
    expect(normalized).toContain("validation_status validation_status not null default 'pending'");

    expect(normalized).toContain('start_date date not null');
    expect(normalized).toContain('end_date date not null');
    expect(normalized).toContain("status pay_period_status not null default 'open'");
  });

  it('includes foreign-key relationships and unique assignment guard', () => {
    expect(normalized).toContain('event_id uuid references events(id) on delete set null');
    expect(normalized).toContain('pay_period_id uuid references pay_periods(id) on delete set null');
    expect(normalized).toContain('event_id uuid not null references events(id) on delete cascade');
    expect(normalized).toContain('unique(event_id, ambassador_id)');
  });

  it('declares indexes for high-traffic query paths', () => {
    const indexes = [
      'idx_events_date',
      'idx_events_status',
      'idx_ambassadors_email',
      'idx_signups_event',
      'idx_signups_ambassador',
      'idx_pay_periods_status',
      'idx_assignments_event',
      'idx_assignments_ambassador',
    ];

    for (const indexName of indexes) {
      expect(normalized).toContain(`create index ${indexName}`);
    }
  });

  it('defines required enum types used by Phase 1 models', () => {
    const enums = [
      'create type event_status as enum',
      'create type ambassador_skill_level as enum',
      'create type compensation_type as enum',
      'create type ambassador_status as enum',
      'create type validation_status as enum',
      'create type pay_period_status as enum',
      'create type bonus_scope as enum',
    ];

    for (const enumDef of enums) {
      expect(normalized).toContain(enumDef);
    }
  });
});
