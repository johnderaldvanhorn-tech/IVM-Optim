# IVM Optim — Reviewed Build

Base: `ivm-program-decision-platform-latest-20260824-212134.zip`

Reviewed cleanup applied:
- Removed `.env.local`, Supabase CLI temp state, generated TypeScript build info, backup/pre-fix files, and local backup folders.
- Removed the obsolete browser-side `VITE_IVM_INTEGRATION_ADMIN_TOKEN` helper and legacy environment example entry.
- Preserved Supabase session/role authorization for the Resend Edge Function.
- Restored `/api/geocode` middleware required by `LocationForm`, with OpenStreetMap primary and U.S. Census fallback.
- Enabled geocoding middleware for both Vite dev and preview servers.
- Preserved production allowed-host and preview port 3030 configuration.
- Aligned `package.json` / `package-lock.json` version with application version `1.1.0`.
- Expanded `.gitignore` for local backups, TypeScript build info, and Supabase CLI temp state.

## Review finding not auto-applied

`supabase/settings-management-migration.sql` contains development RLS policies that permit `anon` select/insert/update/delete access on settings tables. The reviewed source package keeps migration history intact, but this should be replaced with authenticated/admin-only policies before treating the deployment as production-hardened.

## IVM Optim branding — v1.1.0
- Renamed the user-facing application to **IVM Optim**.
- Added supplied IVM Optim logo assets for login and navigation branding.
- Added favicon, app icons, web manifest, browser metadata, and theme color.
- Updated login, header, sidebar, Resend test messages, and user invitation email branding.
- Updated safe export filenames to use the `ivm-optim-` prefix.
- Preserved database table names, Supabase project identifiers, local storage keys, routes, and deployment hostnames to avoid an unnecessary migration.
