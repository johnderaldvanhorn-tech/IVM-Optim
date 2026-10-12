# IVM Optim v1.1.8 — Planogram list reconciliation

- Machine Inventory list now pages through all `machine_planogram_items` records instead of silently using only the first PostgREST page.
- Selection count, PAR and inventory status derive from the same underlying planogram records shown in machine detail.
- Fail closed on planogram retrieval errors instead of falsely labeling all machines as `No Planogram`.
- No database migration. Existing planograms and deployment workflow unchanged.

Regression checks: machine WTN4224664F242100624 must display a nonzero selection count and PAR consistent with its detail view; test a machine without any items; test >1,000 total planogram rows.
