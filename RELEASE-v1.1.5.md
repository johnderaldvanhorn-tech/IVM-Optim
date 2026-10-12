# IVM Optim v1.1.5 — Restock CSV compatibility

- Recognizes header columns by name, including `Organization,Machine Stocked,Selection`.
- Supports report metadata machine when no per-row machine column exists.
- Preserves negative quantities for removal transactions.
- **Database prerequisite:** run `supabase/restock-signed-quantity-v1.1.5.sql` before deploying/importing signed quantities.
- **Reporting caution:** existing staffing aggregate SQL sums signed quantities; removal records will decrease net units in existing summaries. Review whether your desired staffing metric should count only positive replenishments before interpreting those summaries.
