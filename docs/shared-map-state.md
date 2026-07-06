# Shared Map + Field State

The clients should not have to understand databases. The map and field workflow now save through simple APIs:

```text
/api/map-state
/api/field-state
```

Use **Cloudflare D1** as the preferred free shared database target for field workflow state because it needs structured phase history, PM verification, and approvals. The map-state endpoint still supports KV as a simple shared JSON save slot, and field-state can fall back to KV with `ASBUILT_FIELDS`.

## Simple Setup

1. In Cloudflare, create a D1 database, for example `usc-asbuilt`.
2. Apply the migrations:

```text
migrations/0001_map_states.sql
migrations/0002_field_states.sql
```

3. In the Cloudflare Pages project, add a D1 binding:

```text
Binding name: ASBUILT_DB
D1 database: usc-asbuilt
```

4. Optional map KV fallback: create a KV namespace, for example `usc-asbuilt-maps`, then add:

```text
Binding name: ASBUILT_MAPS
KV namespace: usc-asbuilt-maps
```

5. Optional field KV fallback if D1 is not available:

```text
Binding name: ASBUILT_FIELDS
KV namespace: usc-asbuilt-fields
```

6. Add role allowlists as Pages environment variables:

```text
Variable name: ASBUILT_ADMIN_EMAILS
Value: admin1@example.com,admin2@example.com

Variable name: ASBUILT_PM_EMAILS
Value: pm1@example.com,pm2@example.com
```

Optional domain-wide admin access can be set with:

```text
Variable name: ASBUILT_ADMIN_DOMAINS
Value: telcominc.com
```

7. Keep Cloudflare Access in front of the site and `/api/*` routes so the Function receives the Access identity headers.
8. Redeploy the Pages project from `main`.
9. Open the map as an allowed admin or PM. Field state should load, and field marker taps should be visible from another browser/device after the 5-second refresh.

## Field Workflow Rules

- The current phase starts at `Cable Pulled`.
- A field worker tap marks only the current phase for that device location.
- Extra field taps on the same device do not advance it to the next phase.
- PM/admin verification can happen by floor, wing, grouped area, individual device, or entire job.
- If a PM/admin verifies a scope with missing field marks, the API returns the missing marker IDs and the map highlights those locations.
- The job advances to the next phase only after every known marker is field-complete and PM/admin verified for the current phase.
- Two distinct admin emails must approve the phase before it advances.

That is the simple version. No SQL table, no client setup, no user-facing database.

## Fallback

The API also supports D1 with binding `ASBUILT_DB`, using `migrations/0001_map_states.sql`, but KV should be the first choice for the current map because the map is just one shared JSON document.

The existing Cloudflare Access protection should stay in front of the app so only approved users can load the workspace. The save API now also checks `ASBUILT_ADMIN_EMAILS` / `ASBUILT_ADMIN_DOMAINS`, so approved viewers can read shared map state but cannot overwrite it.
