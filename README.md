# UofSC As-Built Workspace

Cloudflare Pages prototype for the UofSC low-voltage AS BUILT and closeout-document workspace.

The live UofSC portal should load from:

```text
https://UofSC.asbuilt.thnikers.com
```

To finish the hostname change in Cloudflare Pages, attach `UofSC.asbuilt.thnikers.com` as a custom domain for this Pages project, point the DNS record at the Pages deployment, and add the new hostname to the same Cloudflare Access application/policy as the old USC hostname. The committed `_redirects` file sends old `usc.asbuilt.thnikers.com` links to the new UofSC hostname after both domains are active.

## Current Pages

- `index.html` - UofSC-specific as-built workspace.
- `template.html` - reusable As-Built Template Studio prototype derived from the UofSC workflow.
- `strom_thurmond_map.html` - existing interactive floor map.
- `_headers` - Cloudflare Pages security headers.
- `_redirects` - redirects the old `usc.asbuilt.thnikers.com` hostname to `UofSC.asbuilt.thnikers.com`.
- `_config.yml` - GitHub Pages compatibility config.
- `docs/cloudflare-migration.md` - migration and production architecture notes.
- `docs/shared-map-state.md` - simple Cloudflare KV setup for shared map marker and annotation edits.

## UofSC Workspace Features

- Project intake form with CSV device-list import.
- Client-specific column picker for device schedules.
- Building plan image upload preview.
- Assisted automatic symbol placement workflow mockup.
- Shared map-state API path for marker and annotation edits when Cloudflare KV is bound.
- Cloudflare Access session endpoint and admin-only shared map saves through `ASBUILT_ADMIN_EMAILS`.
- Field tab and shared field-state API for cable-pulled/device-installed stage tracking across devices.
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
- broad building plan upload support, including PDF plus common image/CAD/BIM attachments,
- self-hosted PDF preview assets that render plan PDFs to canvas instead of blocked embedded frames,
- local IndexedDB source-file storage so uploaded plan files can be restored after refresh,
- multi-sheet PDF plan navigation,
- separate legend upload,
- digital legend symbols that can be selected and placed on the map,
- three-icon training before automatic marker placement,
- client URL slug checker and prototype reservation flow,
- template manifest export.

Future client template URLs should follow:

```text
theirchoice.asbuilt.thnikers.com
```

The current checker blocks obvious system/taken names such as `create` and `usc` and stores prototype reservations in browser storage. Production should move this to a shared Cloudflare KV or D1/Worker reservation check before creating DNS, Pages custom domains, or Access destinations.

Login branding should follow the same tenant template. A UofSC site should look UofSC, while a blue/purple client should see that same blue/purple identity on the login screen, dashboard, packet, and exported closeout documents. Cloudflare Access custom login settings appear account-wide in the current dashboard, so production should either render a tenant-branded login layer from the exported `loginBranding` manifest data or provision tenant-specific Access login settings if Cloudflare exposes them for the chosen plan/API.

## Template publishing

`create.asbuilt.thnikers.com` now publishes a validated tenant manifest instead of generating or copying application code. Every customer hostname runs the same tested dashboard and workflow feature set, while edge middleware injects only that tenant's brand and configuration. Browser storage is namespaced by tenant. Unknown tenants, UofSC-only map routes, and tenants without active secure login fail closed.

The publish service uses the existing `ASBUILT_MAPS` KV namespace for versioned tenant records. Automated domain and login activation additionally require these Cloudflare Pages secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with `Pages Write` and `Access: Apps and Policies Write`
- optional `CLOUDFLARE_PAGES_PROJECT` (defaults to `usc-network-projects`)

Enable Cloudflare Access One-Time PIN in the Zero Trust account before onboarding outside users. The generated Access policy starts with the As-Built admin email list plus any customer domains entered in the builder. Individual external guests can then be added to that application's Access policy. A publish without the deployment credentials may save its configuration, but middleware keeps the customer hostname offline until Access protection is confirmed.

Cloudflare Access is the current production authentication path because it fits the deployed Pages/Functions application and supports both the existing identity providers and approved-email codes for guests. Clerk Organizations is the planned native SaaS login option when username/password, passkeys, self-service invitations, and organization switching are implemented end to end. Convex is not required for this architecture, and Convex Auth is not used.

Smoke checks:

- `node scripts/smoke-create.mjs` (requires the local site on port 4174 and Chrome)
- `node scripts/smoke-publish.mjs`

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
