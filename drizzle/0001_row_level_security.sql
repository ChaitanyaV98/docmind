-- Row-level security: Postgres itself decides which rows a user may see.
-- Even a buggy query in app code (a missing WHERE owner_id = ...) cannot leak another user's
-- documents, and retrieval for the LLM goes through the same rules as the UI.
--
-- The app sets the current user per *transaction*:  SELECT set_config('app.user_id', $1, true)
-- `true` = transaction-local, so the setting can never leak to the next request that reuses
-- a pooled connection.

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Documents: read your own + team-shared; write only your own.
CREATE POLICY documents_select ON documents FOR SELECT
  USING (shared OR owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY documents_insert ON documents FOR INSERT
  WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY documents_update ON documents FOR UPDATE
  USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY documents_delete ON documents FOR DELETE
  USING (owner_id = app_user_id());--> statement-breakpoint

-- Chunks inherit visibility from their document. The sub-select on `documents` is itself
-- filtered by the policies above, so "can see the document" is defined in exactly one place.
CREATE POLICY chunks_select ON chunks FOR SELECT
  USING (EXISTS (SELECT 1 FROM documents d WHERE d.id = chunks.document_id));--> statement-breakpoint
CREATE POLICY chunks_insert ON chunks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM documents d WHERE d.id = chunks.document_id AND d.owner_id = app_user_id()
  ));--> statement-breakpoint
-- (Deleting a document cascades to its chunks; FK cascades are not subject to RLS.)

-- The restricted app role (created in docker/init.sql, or by hand in production).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docmind_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, documents, chunks TO docmind_app;
  END IF;
END $$;
