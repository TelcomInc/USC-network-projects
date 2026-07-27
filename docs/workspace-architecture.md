# Workspace architecture

The product has two intentionally separate surfaces.

## Create control plane

`create.asbuilt.thnikers.com` serves `template.html`. It owns only customer identity and deployment configuration: customer name, logo, colors, URL, login branding, authentication, and publish status. Publishing stores a tenant manifest; it does not contain active project maps or device records.

## Published customer application

Customer hostnames serve `index.html`. This is the project system of record for projects, plans, map markers, device types, protected spreadsheet columns, device records, documents, and closeout workflow.

Workspace state is cached under a tenant-scoped browser key for responsiveness and synchronized to `/api/map-state` under `tenant-workspace-<slug>`. Existing browser projects and older tenant-manifest seed data remain valid migration inputs; normalization adds required columns and device-type configuration without deleting existing fields or rows.

Map markers and device rows share the same device number. Selecting a marker opens the corresponding row. Renumbering is grouped by device type and ordered by sheet and map position, so like devices use one continuous sequence across the project.
