-- One-time email tokens: password reset (30 min) and email verification (24 h).
-- Only the sha256 of the token is stored, like refresh_tokens.
BEGIN;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose varchar(32) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO raktasetu_rls;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_tokens_auth_only ON auth_tokens;
-- Tokens are only ever read/written by the unauthenticated auth flows (role 'auth') and the
-- signed-in "send verification" action for the user's own row.
CREATE POLICY auth_tokens_auth_only ON auth_tokens TO raktasetu_rls
USING (app_role() = 'auth' OR user_id = app_user_id())
WITH CHECK (app_role() = 'auth' OR user_id = app_user_id());

COMMIT;
