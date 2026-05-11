-- Closer-Fixum: monatlicher Euro-Betrag, der unabhängig vom variablen
-- Provisionsanteil ausgezahlt wird. Wird im Cashflow-Dashboard auf die
-- monatliche Auszahlung addiert.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS closer_fixum_eur numeric;
