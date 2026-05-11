-- Original-Dealbetrag aus HubSpot. Wird bei jedem Sync mit dem aktuellen
-- HubSpot-Betrag überschrieben. betrag bleibt unangetastet (Mitarbeiter
-- dürfen ihren Provisions-relevanten Betrag dort weiterhin anpassen).
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS betrag_original numeric;

-- Bestehende Deals: bisher unangepasste Sätze → original = aktueller betrag.
UPDATE deals
  SET betrag_original = betrag
  WHERE betrag_original IS NULL;
