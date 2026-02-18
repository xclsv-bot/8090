-- OAuth Integrations Migration (WO-62)
-- Adds tables for OAuth token storage and audit logging

-- Add missing columns to integrations table
DO $$ 
BEGIN
  -- Add encrypted token columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'access_token_encrypted'
  ) THEN
    ALTER TABLE integrations ADD COLUMN access_token_encrypted TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'refresh_token_encrypted'
  ) THEN
    ALTER TABLE integrations ADD COLUMN refresh_token_encrypted TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE integrations ADD COLUMN token_expires_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE integrations ADD COLUMN last_error TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE integrations ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Create unique constraint on integration_type if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integrations_integration_type_key'
  ) THEN
    ALTER TABLE integrations ADD CONSTRAINT integrations_integration_type_key UNIQUE (integration_type);
  END IF;
END $$;

-- Create integration audit logs table
CREATE TABLE IF NOT EXISTS integration_audit_logs (
  id SERIAL PRIMARY KEY,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying audit logs
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_integration_id 
  ON integration_audit_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_action 
  ON integration_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_created_at 
  ON integration_audit_logs(created_at);

-- Index for token expiration checks
CREATE INDEX IF NOT EXISTS idx_integrations_token_expires 
  ON integrations(token_expires_at) 
  WHERE status = 'active' AND refresh_token_encrypted IS NOT NULL;
