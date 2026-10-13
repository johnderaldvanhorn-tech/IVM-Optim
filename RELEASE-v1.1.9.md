# IVM Optim v1.1.9 — Restock import duplicate-key fix

- Retain separate restock transactions even when all business fields are identical.
- Preserve original import key for the first occurrence; append a stable occurrence suffix to later identical rows.
- Ensure each REST upsert batch has distinct conflict keys to avoid PostgreSQL cardinality violations.
- Re-importing the same CSV remains idempotent with consistent row ordering.
- No database migration is required for this particular conflict error.
- Note: a database check constraint that prohibits zero restock quantities must be corrected separately if still present.
