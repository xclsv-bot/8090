-- WO-133: Core Platform Schema Updates
-- 005_create_payroll_tables.sql
-- UP

DO $$ BEGIN
  CREATE TYPE pay_statement_status AS ENUM ('draft', 'pending', 'approved', 'processing', 'paid', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE line_item_type AS ENUM ('earning', 'deduction', 'bonus');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payroll_source_type AS ENUM ('signup', 'event_assignment', 'bonus_rule', 'manual_adjustment', 'correction', 'expense_reimbursement');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pay_rate_type AS ENUM ('per_signup', 'hourly', 'daily', 'flat', 'bonus_tier');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('direct_deposit', 'check', 'paypal', 'venmo', 'wire', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ambassador_pay_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  status pay_statement_status NOT NULL DEFAULT 'draft',
  gross_pay DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12, 2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ambassador_period UNIQUE (ambassador_id, pay_period_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ambassador_pay_statements' AND column_name = 'status'
  ) THEN
    ALTER TABLE ambassador_pay_statements
      ALTER COLUMN status TYPE pay_statement_status
      USING (
        CASE
          WHEN status::text IN ('disputed') THEN 'failed'
          WHEN status::text IN ('approved') THEN 'approved'
          WHEN status::text IN ('paid') THEN 'paid'
          ELSE 'draft'
        END
      )::pay_statement_status,
      ALTER COLUMN status SET DEFAULT 'draft';
  END IF;

  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS gross_pay DECIMAL(12, 2) DEFAULT 0;
  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS deductions DECIMAL(12, 2) DEFAULT 0;
  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS net_pay DECIMAL(12, 2) DEFAULT 0;
  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE ambassador_pay_statements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
END $$;

CREATE TABLE IF NOT EXISTS pay_statement_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES ambassador_pay_statements(id) ON DELETE CASCADE,
  type line_item_type NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  source_type payroll_source_type,
  source_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_statement_line_items' AND column_name = 'line_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_statement_line_items' AND column_name = 'type'
  ) THEN
    ALTER TABLE pay_statement_line_items RENAME COLUMN line_type TO type;
  END IF;

  ALTER TABLE pay_statement_line_items ADD COLUMN IF NOT EXISTS source_type payroll_source_type;
  ALTER TABLE pay_statement_line_items ADD COLUMN IF NOT EXISTS source_id UUID;
  ALTER TABLE pay_statement_line_items ADD COLUMN IF NOT EXISTS metadata JSONB;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_statement_line_items' AND column_name = 'type'
  ) THEN
    ALTER TABLE pay_statement_line_items
      ALTER COLUMN type TYPE line_item_type
      USING (
        CASE
          WHEN type::text IN ('signup', 'hourly', 'adjustment') THEN 'earning'
          WHEN type::text IN ('deduction') THEN 'deduction'
          WHEN type::text IN ('bonus') THEN 'bonus'
          ELSE 'earning'
        END
      )::line_item_type;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pay_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  rate_type pay_rate_type NOT NULL,
  rate_amount DECIMAL(12, 2) NOT NULL,
  effective_date DATE NOT NULL,
  end_date DATE,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_rate_history' AND column_name = 'new_rate'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_rate_history' AND column_name = 'rate_amount'
  ) THEN
    ALTER TABLE pay_rate_history RENAME COLUMN new_rate TO rate_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_rate_history' AND column_name = 'change_reason'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_rate_history' AND column_name = 'reason'
  ) THEN
    ALTER TABLE pay_rate_history RENAME COLUMN change_reason TO reason;
  END IF;

  ALTER TABLE pay_rate_history ADD COLUMN IF NOT EXISTS end_date DATE;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_rate_history' AND column_name = 'rate_type'
  ) THEN
    ALTER TABLE pay_rate_history
      ALTER COLUMN rate_type TYPE pay_rate_type
      USING (
        CASE
          WHEN rate_type::text IN ('per_signup', 'hourly', 'daily', 'flat', 'bonus_tier') THEN rate_type::text
          ELSE 'hourly'
        END
      )::pay_rate_type;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS statement_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES ambassador_pay_statements(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  external_reference VARCHAR(255),
  failure_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aps_ambassador ON ambassador_pay_statements(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_aps_pay_period ON ambassador_pay_statements(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_aps_status ON ambassador_pay_statements(status);
CREATE INDEX IF NOT EXISTS idx_aps_line_items_statement ON pay_statement_line_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_aps_line_items_type ON pay_statement_line_items(type);
CREATE INDEX IF NOT EXISTS idx_pay_rate_history_ambassador_rate_type ON pay_rate_history(ambassador_id, rate_type);
CREATE INDEX IF NOT EXISTS idx_statement_payment_history_statement ON statement_payment_history(statement_id);

-- DOWN

DROP INDEX IF EXISTS idx_statement_payment_history_statement;
DROP INDEX IF EXISTS idx_pay_rate_history_ambassador_rate_type;
DROP INDEX IF EXISTS idx_aps_line_items_type;
DROP INDEX IF EXISTS idx_aps_line_items_statement;
DROP INDEX IF EXISTS idx_aps_status;
DROP INDEX IF EXISTS idx_aps_pay_period;
DROP INDEX IF EXISTS idx_aps_ambassador;

DROP TABLE IF EXISTS statement_payment_history;
DROP TABLE IF EXISTS pay_statement_line_items;
DROP TABLE IF EXISTS pay_rate_history;
DROP TABLE IF EXISTS ambassador_pay_statements;

DROP TYPE IF EXISTS payment_status;
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS pay_rate_type;
DROP TYPE IF EXISTS payroll_source_type;
DROP TYPE IF EXISTS line_item_type;
DROP TYPE IF EXISTS pay_statement_status;
