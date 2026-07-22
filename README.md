# UofSC As-Built Workspace

Cloudflare Pages application for the UofSC low-voltage AS BUILT and closeout-document workspace.

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
- Browser-based automatic symbol detection trained from three examples on the uploaded plan.
- Shared map-state API path for marker and annotation edits when Cloudflare KV is bound.
- Clerk session verification and admin-only shared map saves through `ASBUILT_ADMIN_EMAILS`.
- Field tab and shared field-state API for cable-pulled/device-installed stage tracking across devices.
- Packet manifest export for AS BUILT package generation.

## Template Studio

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
- uploaded symbols rendered without an added circle, square, or triangle and with marker numbers centered,
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
- visual symbol matching with reviewable confidence-marked suggestions,
- authenticated manual device-document PDF upload to private Cloudflare KV storage,
- manufacturer document lookup that downloads, validates, stores, and attaches the Warranty, Manual, and Cut Sheet PDFs without exposing search-result URLs,
- client URL slug checker and reservation flow,
- template manifest export.

Future client template URLs should follow:

```text
theirchoice.asbuilt.thnikers.com
```

The current checker blocks obvious system/taken names such as `create` and `usc`. Publishing persists tenant manifests in the shared `ASBUILT_MAPS` KV namespace before attaching the customer domain.

Login branding follows the same tenant template. The shared Clerk component is wrapped in the As-Built blue, grey, and dark-teal login shell so customers do not see Cloudflare's Access login page.

## Template publishing

`create.asbuilt.thnikers.com` now publishes a validated tenant manifest instead of generating or copying application code. Every customer hostname runs the same tested dashboard and workflow feature set, while edge middleware injects only that tenant's brand and configuration. Browser storage is namespaced by tenant. Unknown tenants, UofSC-only map routes, and tenants without active secure login fail closed.

The publish service uses the `ASBUILT_MAPS` KV namespace for versioned tenant records. Automated domain activation additionally requires these Cloudflare Pages secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with `Pages Write`
- optional `CLOUDFLARE_PAGES_PROJECT` (defaults to `usc-network-projects`)

PDF uploads require the `asbuilt-documents` KV namespace bound as `ASBUILT_DOCS`. Manufacturer-document discovery also requires `OPENAI_API_KEY`. If search is not configured or a valid PDF cannot be downloaded, the interface reports the missing file and offers manual PDF upload; it never creates search-result links.

Clerk email verification codes and passwords are enabled for approved users. A publish without the Cloudflare deployment credentials may save its configuration, but the customer hostname remains offline until its Pages domain is attached.

Clerk is the application authentication path. ClerkJS renders the branded login, each API request carries a short-lived session token, and Pages Functions verify the RS256 signature against the production Clerk JWKS. The session token includes only the user's primary email as a custom claim so the existing admin and project-manager allowlists continue to work. Cloudflare remains the infrastructure provider for DNS, Pages, Functions, KV, and deployment automation.

Smoke checks:

- `node scripts/smoke-create.mjs` (requires the local site on port 4174 and Chrome)
- `node scripts/smoke-publish.mjs`
- `node scripts/smoke-doc-upload.mjs`
- `node scripts/smoke-doc-search.mjs`

## Important Security Note

This repository used to include client-side usernames and passwords. Those were removed because static-site credentials are visible to anyone who can load or inspect the site source.

The deployment uses the branded Clerk login and server-side Clerk JWT verification. Do not place private project data in a deployment that is missing the Clerk production secrets or the KV/R2 bindings described above.

## Production Architecture Target

- Cloudflare Pages: frontend app.
- Clerk: user/client authentication.
- Cloudflare Workers: API, imports, packet generation coordination, and domain automation.
- Cloudflare D1 or external SQL: clients, projects, templates, devices, field maps, packet runs, approvals.
- Cloudflare R2: plans, workbooks, cable test files, warranty documents, generated packets.
- Queue or processing service: PDF rasterization, OCR, legend extraction, symbol matching, and packet rendering.
