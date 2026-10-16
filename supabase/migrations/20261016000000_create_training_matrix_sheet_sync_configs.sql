CREATE TABLE IF NOT EXISTS public.sheet_sync_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'google_sheet',
  source_sheet_id text NOT NULL,
  source_tab_name text NOT NULL DEFAULT 'APP_SYNC',
  source_range text NOT NULL DEFAULT 'A1:Z500',
  primary_key text NOT NULL DEFAULT 'email',
  include_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_enabled boolean NOT NULL DEFAULT true,
  allow_new_rows boolean NOT NULL DEFAULT false,
  manual_only boolean NOT NULL DEFAULT true,
  sync_active_column text NULL,
  last_updated_column text NULL,
  last_synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS sheet_sync_configs_location_idx
  ON public.sheet_sync_configs (location_id, sync_enabled);

CREATE INDEX IF NOT EXISTS sheet_sync_configs_sheet_idx
  ON public.sheet_sync_configs (source_sheet_id, source_tab_name);

CREATE OR REPLACE FUNCTION public.touch_sheet_sync_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sheet_sync_configs_updated_at_trg ON public.sheet_sync_configs;
CREATE TRIGGER sheet_sync_configs_updated_at_trg
BEFORE UPDATE ON public.sheet_sync_configs
FOR EACH ROW
EXECUTE FUNCTION public.touch_sheet_sync_config_updated_at();

ALTER TABLE public.sheet_sync_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sheet sync configs" ON public.sheet_sync_configs;
CREATE POLICY "Admins manage sheet sync configs"
  ON public.sheet_sync_configs
  FOR ALL
  USING (true)
  WITH CHECK (true);
