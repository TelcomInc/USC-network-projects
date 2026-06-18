# Cloudflare Migration and Product Plan

## Immediate Move From GitHub Pages

The current repo can deploy to Cloudflare Pages as a static site.

- Framework preset: None.
- Build command: blank.
- Build output directory: `/` in the dashboard, or `.` in `wrangler.toml`.
- Production branch: `main`.
- Protect with Cloudflare Access before sharing with clients.

## What Was Corrected

- Removed hardcoded client-side credentials.
- Removed the older duplicate HTML file that exposed credentials.
- Reworked the portal toward the actual closeout workflow:
  - project intake,
  - device-list import,
  - client-selected columns,
  - plan upload preview,
  - automatic symbol placement review queue,
  - AS BUILT packet manifest export.
- Added Cloudflare Pages security headers.
- Added a Cloudflare Pages `wrangler.toml`.

## Required Production Backend

The full product should not store client data only in browser `localStorage`. Use durable services:

| Product Need | Recommended Service |
| --- | --- |
| Frontend | Cloudflare Pages |
| Authentication | Cloudflare Access |
| API | Cloudflare Workers |
| Project/device records | Cloudflare D1 or external SQL |
| Plans, workbooks, warranties, cable tests, packets | Cloudflare R2 |
| Long-running document/CV work | Cloudflare Queues plus a processing worker/service |

## Device Data Model

Keep the original uploaded columns, then map selected fields onto standard keys:

- device number,
- device name,
- device type,
- brand,
- product name,
- model number,
- serial number,
- MAC address,
- IP address,
- closet location,
- port location,
- installed location,
- cable test result,
- warranty fields,
- custom client fields.

Not every client list will contain every column. The UI should store a per-template field map instead of forcing a single spreadsheet shape.

## Automatic Plan Symbol Placement

The automatic feature should be built as an approval workflow:

1. Upload plan sheets and legend pages.
2. Rasterize PDFs into page images.
3. Detect legend symbols and labels with OCR/computer vision.
4. Match device types from the workbook/database to legend symbols.
5. Suggest device marker locations from plan annotations, room labels, coordinates, or user-provided click points.
6. Store each marker with confidence, source evidence, approver, and timestamp.
7. Require human review before a marker becomes part of the final AS BUILT packet.

This keeps automation useful without letting a model silently create incorrect record drawings.

## AS BUILT Packet Sections

Recommended default packet:

- Cover page,
- index/table of contents,
- project summary,
- equipment overview,
- device schedule,
- marked AS BUILT layouts,
- data cable test results,
- warranty information,
- photos/field notes,
- appendix/source files.

## Custom Domains

For an apex domain such as `example.com`, the domain should be added as a Cloudflare zone and use Cloudflare nameservers.

For a subdomain such as `client.example.com`, Cloudflare Pages can use a CNAME pointed to the Pages hostname. If the domain is already in your Cloudflare account, the app can later automate this through Cloudflare's DNS and Pages APIs.

The template product should reserve the pattern `theirchoice.asbuilt.thnikers.com`. A production Worker can create the Pages custom domain, create the CNAME, and add the hostname to the matching Cloudflare Access application after the chosen slug is approved.

Buying brand-new client domains is possible through Cloudflare Registrar, but it requires registrant contact, billing, and ICANN verification flows. Keep domain purchase in the dashboard until the business process is settled.
