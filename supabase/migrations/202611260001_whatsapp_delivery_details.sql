-- Persist WhatsApp delivery failure details for the workspace dashboard.
alter table public.whatsapp_message_logs
  add column if not exists error_message text,
  add column if not exists meta_error_code text,
  add column if not exists meta_error_subcode text,
  add column if not exists meta_error_details text;
