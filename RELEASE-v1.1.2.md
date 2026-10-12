# IVM Optim v1.1.2 — Location assessment CSV
Baseline: GitHub commit 9e7c3d0869cadd920bd74a05290221ec21ca573e.

Adds eight scoring input columns to Locations CSV template, export and import. Existing rows are matched by machine_id. Blank assessment cells preserve existing values; calculations use the same functions and weighting as LocationForm. Each row reports errors independently. Existing deployment workflow is preserved.

Important: Saving access and demographic tables involves separate Supabase operations; if the second fails, the first may have saved. Review rejected/partial failures and retry after correcting permissions. Ensure RLS permits the signed-in user to write both related tables.

Validation: Source inspected and ZIP integrity checked. TypeScript build NOT executed (node_modules unavailable). Run npm ci && npm run build before deployment.

Deployment: In ~/Projects/IVM-Optim, git pull --ff-only origin main, then unzip this archive into a temporary directory and rsync source into the repo excluding .git. Commit and push, then manually trigger .github/workflows/deploy.yml.
