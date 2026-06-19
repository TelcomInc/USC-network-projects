# USC As-Built Workspace

Cloudflare Pages prototype for the USC low-voltage AS BUILT and closeout-document workspace.

The live USC portal should continue to load from:

```text
https://usc.asbuilt.thnikers.com
```

## Current Pages

- `index.html` - USC-specific as-built workspace.
- `template.html` - reusable As-Built Template Studio prototype derived from the USC workflow.
- `strom_thurmond_map.html` - existing interactive floor map.
- `_headers` - Cloudflare Pages security headers.
- `_config.yml` - GitHub Pages compatibility config.
- `docs/cloudflare-migration.md` - migration and production architecture notes.

## USC Workspace Features

- Project intake form with CSV device-list import.
- Client-specific column picker for device schedules.
- Building plan image upload preview.
- Assisted automatic symbol placement workflow mockup.
- Packet manifest export for AS BUILT package generation.

## Template Studio Prototype

The reusable template builder is available at:

```text
https://create.asbuilt.thnikers.com
```

For the current shared Pages project, the same builder is also available at `/template.html`.

It includes:

- logo upload,
- color choices,
- branded login preview and login-brand manifest fields,
- four packet layouts,
- low-voltage device and symbol catalog,
- custom symbol import,
- Excel/CSV header builder,
- semantic mapping for custom labels,
- interactive map workspace with 500x zoom,
- sample automatic marker placement,
- client URL slug checker and prototype reservation flow,
- template manifest export.

Future client template URLs should follow:

```text
theirchoice.asbuilt.thnikers.com
```

The current checker blocks obvious system/taken names such as `create` and `usc` and stores prototype reservations in browser storage. Production should move this to a shared Cloudflare D1/Worker reservation check before creating DNS, Pages custom domains, or Access destinations.

Login branding should follow the same tenant template. A USC site should look USC, while a blue/purple client should see that same blue/purple identity on the login screen, dashboard, packet, and exported closeout documents. Cloudflare Access custom login settings appear account-wide in the current dashboard, so production should either render a tenant-branded login layer from the exported `loginBranding` manifest data or provision tenant-specific Access login settings if Cloudflare exposes them for the chosen plan/API.

## Important Security Note

This repository used to include client-side usernames and passwords. Those were removed because static-site credentials are visible to anyone who can load or inspect the site source.

Before client data, plans, test results, serial numbers, MAC addresses, warranty documents, or generated packets are uploaded, protect the deployment with Cloudflare Access or a real backend authentication layer.

## Production Architecture Target

- Cloudflare Pages: frontend app.
- Cloudflare Access: user/client authentication.
- Cloudflare Workers: API, imports, packet generation coordination, and domain automation.
- Cloudflare D1 or external SQL: clients, projects, templates, devices, field maps, packet runs, approvals.
- Cloudflare R2: plans, workbooks, cable test files, warranty documents, generated packets.
- Queue or processing service: PDF rasterization, OCR, legend extraction, symbol matching, and packet rendering.
