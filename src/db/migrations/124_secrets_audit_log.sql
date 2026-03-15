-- UP
CREATE TABLE IF NOT EXISTS secrets_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key VARCHAR(128) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  accessor VARCHAR(255) NOT NULL,
  ip INET,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secrets_audit_log_secret_key ON secrets_audit_log(secret_key);
CREATE INDEX IF NOT EXISTS idx_secrets_audit_log_timestamp ON secrets_audit_log(timestamp DESC);

-- DOWN
DROP TABLE IF EXISTS secrets_audit_log;
