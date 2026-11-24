-- Fix Supabase REST access for Cloudflare Pages Functions using the service_role key.
-- service_role is used only by trusted server-side Pages Functions; never expose it in the browser.
-- RLS remains enabled, but Supabase's service_role bypasses RLS by design.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure tables/sequences created later in public also receive the required privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
