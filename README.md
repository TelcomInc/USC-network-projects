# As-Built Template Studio

Static prototype for a reusable low-voltage AS BUILT and closeout-document portal.

The app is no longer only a USC-specific prototype. It is now a template builder that can be branded per client and published under this URL pattern:

```text
theirchoice.asbuilt.thnikers.com
```

## Current Prototype

- Plain HTML/CSS/JavaScript deployable to Cloudflare Pages.
- Client branding:
  - logo upload,
  - primary/secondary colors,
  - packet paper color,
  - client URL slug.
- Four packet layouts:
  - Executive Closeout,
  - Technical Schedule,
  - Plan-First As-Built,
  - Warranty + Turnover.
- Low-voltage device catalog:
  - cameras,
  - access points,
  - data drops,
  - TVs,
  - smart boards,
  - kiosks,
  - door access,
  - speakers,
  - intercoms,
  - racks/cabinets.
- Custom equipment labels that must be linked to known equipment types.
- Custom symbol upload per equipment type.
- Excel/CSV template builder:
  - selectable standard headers,
  - custom client headers,
  - semantic mapping so labels such as "Jack ID" can map to "Port / Jack Number".
- Interactive plan workspace:
  - plan image upload,
  - scrollable canvas,
  - zoom up to 500x,
  - compact numbered markers,
  - simulated automatic marker placement.
- Template manifest export for future backend/API automation.

## Important Security Note

This is still a static prototype. Do not store real client plans, MAC addresses, serial numbers, test results, warranties, or generated packets in browser-only storage for production.

Production should protect client portals with Cloudflare Access and move durable data into backend services.

## Cloudflare Pages Deployment

Recommended setup:

1. Cloudflare dashboard -> Workers & Pages -> Create application -> Pages -> Connect to Git.
2. Select `TelcomInc/USC-network-projects`.
3. Production branch: `main`.
4. Build command: leave blank.
5. Build output directory: `/`.
6. Add Cloudflare Access in front of each Pages hostname.

Current desired custom hostname:

```text
usc.asbuilts.thnikers.com
```

Future client hostname pattern:

```text
theirchoice.asbuilt.thnikers.com
```

## Production Architecture Target

- Cloudflare Pages: frontend app.
- Cloudflare Access: client authentication and internal review access.
- Cloudflare Workers: API, template creation, import processing, and domain automation.
- Cloudflare D1 or external SQL: clients, templates, projects, device rows, field maps, marker approvals.
- Cloudflare R2: plans, workbooks, test results, warranties, photos, generated packets.
- Queue/worker pipeline: PDF rasterization, OCR, legend extraction, symbol matching, plan marker suggestions, packet rendering.

## Questions To Resolve

- Who approves automatic marker placement: Telcom only, client reviewers, or both?
- Which source files come first: CSV, XLSX, PDF plans, LinkWare/Fluke files, photos, warranty PDFs?
- Should clients be view-only, comment-only, or allowed to drag/edit markers?
- Should billing be per client, per project, per packet, or monthly?

See `docs/cloudflare-migration.md` for the implementation path.
