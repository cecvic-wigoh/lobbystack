-- Additive: null preserves existing operator-configured email routing.
ALTER TABLE public.receptionist_profiles ADD COLUMN IF NOT EXISTS call_summary_email text;
