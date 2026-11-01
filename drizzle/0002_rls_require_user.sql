-- Fail closed: shared documents are visible to any *signed-in* user, not to a session with no
-- user set. Caught by rls.int.test.ts ("fails closed: with no user set, nothing is visible").
DROP POLICY documents_select ON documents;--> statement-breakpoint
CREATE POLICY documents_select ON documents FOR SELECT
  USING (app_user_id() IS NOT NULL AND (shared OR owner_id = app_user_id()));
