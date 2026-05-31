-- Slack-Confirmation-Tracking fuer den Inkasso-Cron.
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS dunning_inkasso_slack_asked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS dunning_inkasso_slack_ts TEXT;
