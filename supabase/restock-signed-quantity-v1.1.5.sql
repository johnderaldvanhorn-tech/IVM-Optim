-- Run before importing Restock Summary Reports containing removals.
-- Signed restock_quantity preserves negative removal transactions.
BEGIN;
ALTER TABLE public.restock_events DROP CONSTRAINT IF EXISTS restock_events_restock_quantity_check;
ALTER TABLE public.restock_events ADD CONSTRAINT restock_events_restock_quantity_check CHECK (restock_quantity <> 0);
COMMIT;
