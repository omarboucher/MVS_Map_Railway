# Database Migrations

This directory holds incremental SQL migration scripts that are applied to an **existing** `MVD_RP1_Map` database.

## How it works

On every server startup the migration runner:

1. Creates a `schema_migrations` table in `MVD_RP1_Map` if it does not already exist.
2. Scans this directory for files matching `NNN_<description>.sql` (e.g. `001_add_index.sql`).
3. Applies any files whose version number has not yet been recorded in `schema_migrations`, in ascending order.

This means the initial schema (imported from `MVD_RP1_Map.sql` when the database is first created) is **version 0** — every file here starts from **001**.

## Adding a migration

1. Create a new file: `NNN_<short_description>.sql` where `NNN` is the next sequential number (zero-padded to three digits).
2. Write idempotent SQL (use `IF NOT EXISTS`, `IF EXISTS`, etc. where possible).
3. Commit the file.  It will be picked up automatically on the next deployment.

## Example

```sql
-- 001_add_audit_columns.sql
ALTER TABLE RMCObject
   ADD COLUMN IF NOT EXISTS dtCreated DATETIME DEFAULT CURRENT_TIMESTAMP,
   ADD COLUMN IF NOT EXISTS dtModified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
```
