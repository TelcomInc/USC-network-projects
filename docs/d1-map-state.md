# Shared Map State With Cloudflare D1

The Strom Thurmond map should not depend on browser `localStorage` for production edits. `localStorage` only saves on one person's computer. Cloudflare D1 gives the Pages app a shared database so every approved user sees the same marker and annotation updates.

## What Was Added

- `functions/api/map-state.js` exposes a same-origin Pages Function at `/api/map-state`.
- `migrations/0001_map_states.sql` creates the `map_states` table.
- `strom_thurmond_map.html` now loads shared state from `/api/map-state?key=usc-strom-thurmond-map-v1` and saves edits back to that API.
- If D1 is not configured yet, the map still falls back to local browser cache and shows `Local cache only`.

## Cloudflare Setup

1. In Cloudflare, create a D1 database for the app, for example `usc-asbuilt-db`.
2. Run the SQL in `migrations/0001_map_states.sql` against that D1 database.
3. In the Cloudflare Pages project, add a D1 binding:

```text
Binding name: ASBUILT_DB
Database: usc-asbuilt-db
```

4. Redeploy the Pages project from `main`.
5. Open the map and confirm the sync pill changes from `Local cache only` to `Shared DB loaded` or `Shared DB saved`.

The existing Cloudflare Access protection should stay in front of the app so only approved users can call this API.
