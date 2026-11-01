-- Runs once, when the database volume is first created.

-- The extension must exist before the first migration creates a vector column.
CREATE EXTENSION IF NOT EXISTS vector;

-- The app connects as this role, NOT as the `docmind` superuser:
-- superusers (and roles with BYPASSRLS) silently skip row-level security,
-- so access rules would never be enforced. Migrations still run as `docmind`.
CREATE ROLE docmind_app LOGIN PASSWORD 'docmind_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE docmind TO docmind_app;
GRANT USAGE ON SCHEMA public TO docmind_app;
