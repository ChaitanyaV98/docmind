-- The app role could read every user's password hash: `users` has no row-level security and
-- docmind_app had plain SELECT on the whole table. A bug or SQL injection in app code could have
-- dumped all hashes for offline cracking.
--
-- Fix: docmind_app may read every column of `users` EXCEPT password_hash. Login no longer reads
-- the hash at all; it goes through two narrow SECURITY DEFINER functions instead:
--   1. app_password_params(email) → the salt and key length (not secret) of that user's hash.
--   2. The app runs scrypt itself, then app_check_password(email, candidate) → the user's
--      id/email/name if the candidate equals the stored hash, otherwise no row.
-- The stored hash never leaves the database. Both sides are hashed with sha256 before comparing,
-- so comparison timing reveals nothing about the stored value.
--
-- docmind_app keeps INSERT/UPDATE on users (the seed script writes demo users).

CREATE OR REPLACE FUNCTION app_password_params(p_email text)
  RETURNS TABLE (salt text, key_length integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT split_part(u.password_hash, '$', 2),
           octet_length(decode(split_part(u.password_hash, '$', 3), 'base64'))
      FROM public.users u
     WHERE u.email = p_email AND split_part(u.password_hash, '$', 1) = 'scrypt'
  $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_check_password(p_email text, p_candidate text)
  RETURNS TABLE (id uuid, email text, name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.email, u.name
      FROM public.users u
     WHERE u.email = p_email
       AND sha256(convert_to(u.password_hash, 'UTF8')) = sha256(convert_to(p_candidate, 'UTF8'))
  $$;
--> statement-breakpoint

-- Functions are executable by PUBLIC by default; only the app role should call these.
REVOKE ALL ON FUNCTION app_password_params(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_check_password(text, text) FROM PUBLIC;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docmind_app') THEN
    REVOKE SELECT ON users FROM docmind_app;
    GRANT SELECT (id, email, name, created_at) ON users TO docmind_app;
    GRANT EXECUTE ON FUNCTION app_password_params(text) TO docmind_app;
    GRANT EXECUTE ON FUNCTION app_check_password(text, text) TO docmind_app;
  END IF;
END $$;
