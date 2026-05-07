-- Setter / Closer roles + Setter-Stunden-Variante.
-- Existierende `role`-Spalte ('admin' | 'member') bleibt erhalten —
-- der Admin-Status wird weiterhin daraus gelesen. is_setter / is_closer
-- sind orthogonale Flags (mehrfachauswahl möglich).

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_setter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS setter_hours text
    CHECK (setter_hours IN ('20h','25h','30h','35h','40h'));
