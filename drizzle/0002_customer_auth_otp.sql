-- Great Homes customer passwordless OTP session tables.
-- Idempotent: apply to the intended environment before deploying the code.
-- Prerequisite: the customers table already exists.

CREATE TABLE IF NOT EXISTS customer_otp_challenges (
  id text PRIMARY KEY,
  phone text NOT NULL,
  phone_hash text NOT NULL,
  ip_hash text NOT NULL,
  provider_session_id text,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'SENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamp NOT NULL,
  verified_at timestamp,
  profile_expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_otp_phone_created
  ON customer_otp_challenges(phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_otp_status_expiry
  ON customer_otp_challenges(status, expires_at);

CREATE TABLE IF NOT EXISTS customer_auth_rate_limits (
  id text PRIMARY KEY,
  window_start timestamp NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_auth_rate_limits_updated
  ON customer_auth_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS customer_auth_sessions (
  token_hash text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_customer
  ON customer_auth_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_expiry
  ON customer_auth_sessions(expires_at);
