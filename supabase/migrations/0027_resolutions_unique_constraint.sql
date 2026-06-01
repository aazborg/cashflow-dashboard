-- 0023 erstellte einen UNIQUE INDEX auf (gc_id, kind).
-- Supabase JS .upsert(onConflict='gc_id,kind') verlangt aber ein
-- echtes CONSTRAINT (kein purer Index) -- sonst kann onConflict
-- nicht auf die Spalten verweisen.
--
-- Daher: zusaetzlich ein UNIQUE CONSTRAINT mit identischer Spaltenliste.
-- Der existierende Index wird beibehalten (schadet nicht, wird vom
-- Constraint impliziert / dedupliziert).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.gocardless_resolutions'::regclass
          AND conname = 'gocardless_resolutions_gc_id_kind_key'
    ) THEN
        ALTER TABLE public.gocardless_resolutions
            ADD CONSTRAINT gocardless_resolutions_gc_id_kind_key
            UNIQUE (gc_id, kind);
    END IF;
END
$$;
