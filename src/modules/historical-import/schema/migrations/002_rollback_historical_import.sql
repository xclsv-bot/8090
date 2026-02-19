-- Historical Data Import Schema Rollback
-- Work Order: WO-77
-- Database: PostgreSQL (Neon)
--
-- WARNING: This will DROP all tables and data. Use with caution!
-- Run with: psql $DATABASE_URL -f 002_rollback_historical_import.sql

BEGIN;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS event_assignments CASCADE;
DROP TABLE IF EXISTS payroll_records CASCADE;
DROP TABLE IF EXISTS budget_records CASCADE;
DROP TABLE IF EXISTS sign_ups CASCADE;
DROP TABLE IF EXISTS audit_trail_entries CASCADE;
DROP TABLE IF EXISTS import_results CASCADE;
DROP TABLE IF EXISTS reconciliation_matches CASCADE;
DROP TABLE IF EXISTS parsed_records CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS venues CASCADE;
DROP TABLE IF EXISTS operators CASCADE;
DROP TABLE IF EXISTS ambassadors CASCADE;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop enum types
DROP TYPE IF EXISTS assignment_status CASCADE;
DROP TYPE IF EXISTS payroll_status CASCADE;
DROP TYPE IF EXISTS budget_record_type CASCADE;
DROP TYPE IF EXISTS sign_up_status CASCADE;
DROP TYPE IF EXISTS audit_severity CASCADE;
DROP TYPE IF EXISTS audit_action CASCADE;
DROP TYPE IF EXISTS import_operation CASCADE;
DROP TYPE IF EXISTS reconciliation_decision CASCADE;
DROP TYPE IF EXISTS match_type CASCADE;
DROP TYPE IF EXISTS entity_type CASCADE;
DROP TYPE IF EXISTS record_import_status CASCADE;
DROP TYPE IF EXISTS reconciliation_status CASCADE;
DROP TYPE IF EXISTS validation_status CASCADE;
DROP TYPE IF EXISTS validation_mode CASCADE;
DROP TYPE IF EXISTS import_data_type CASCADE;
DROP TYPE IF EXISTS import_phase CASCADE;
DROP TYPE IF EXISTS import_job_status CASCADE;
DROP TYPE IF EXISTS venue_status CASCADE;
DROP TYPE IF EXISTS venue_type CASCADE;
DROP TYPE IF EXISTS operator_status CASCADE;
DROP TYPE IF EXISTS operator_type CASCADE;
DROP TYPE IF EXISTS event_status CASCADE;
DROP TYPE IF EXISTS ambassador_status CASCADE;

COMMIT;
