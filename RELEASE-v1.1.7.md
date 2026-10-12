# IVM Optim v1.1.7 — Restock quantity compatibility

Allow signed and zero quantities in restock CSV imports. Zero-quantity events are retained as reported, not treated as replenishment. Negative quantities remain negative. No database schema changes included. Verify database constraints permit zero and negative values before importing.
