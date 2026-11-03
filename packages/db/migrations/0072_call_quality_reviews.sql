-- Platform reviewers can read completed calls across tenants; tenant writes stay unchanged.
CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
  SELECT app.current_actor_type() = 'operator' AND EXISTS (
    SELECT 1 FROM public.users WHERE id = app.current_user_id() AND platform_role = 'platform_admin'
  )
$$;
REVOKE ALL ON FUNCTION app.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_platform_admin() TO lobbystack_app;

CREATE POLICY businesses_quality_review_read ON public.businesses
  FOR SELECT TO lobbystack_app USING (app.is_platform_admin());
CREATE POLICY calls_quality_review_read ON public.calls
  FOR SELECT TO lobbystack_app USING (ended_at IS NOT NULL AND app.is_platform_admin());
CREATE POLICY transcripts_quality_review_read ON public.transcripts
  FOR SELECT TO lobbystack_app USING (app.is_platform_admin() AND EXISTS (
    SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.business_id = transcripts.business_id AND c.ended_at IS NOT NULL
  ));
CREATE POLICY audit_logs_quality_review_insert ON public.audit_logs
  FOR INSERT TO lobbystack_app WITH CHECK (app.is_platform_admin()
    AND actor_user_id = app.current_user_id()
    AND event_type IN ('platform.call_quality.viewed', 'platform.call_quality.reviewed'));

CREATE TABLE public.call_quality_reviews (
  call_id uuid PRIMARY KEY REFERENCES public.calls(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'needs_correction', 'passed', 'resolved')),
  flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flags) = 'array'),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_quality_reviews_business_status_idx ON public.call_quality_reviews(business_id, status);
ALTER TABLE public.call_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_quality_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY call_quality_reviews_platform_access ON public.call_quality_reviews
  FOR ALL TO lobbystack_app USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin() AND EXISTS (
    SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.business_id = call_quality_reviews.business_id AND c.ended_at IS NOT NULL
  ));
GRANT SELECT, INSERT, UPDATE ON public.call_quality_reviews TO lobbystack_app;
