-- Preview-only additive performance index for /my-properties paginated dashboard queries.
-- Do NOT run automatically against production without scheduled maintenance review.
CREATE INDEX IF NOT EXISTS idx_property_submissions_customer_status_updated
  ON property_submissions (submitter_customer_id, submission_status, updated_at DESC);
