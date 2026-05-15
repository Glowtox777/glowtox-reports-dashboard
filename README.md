# Termin-Dashboard

Lightweight internal dashboard for replacing the first Power BI appointment reports. The current UI uses mock data by default.

## Runtime

The dashboard runs on a minimal Node/Express server. Express serves the static frontend and provides server-side API endpoints:

- `GET /api/reports/summary`
- `GET /api/diagnostics`

`/api/reports/summary` returns mock report data while `USE_REAL_REPORT_DATA=false`. When `USE_REAL_REPORT_DATA=true`, it uses the read-only repository in `src/lib/reports/appointmentReadOnlyRepository.js` to run Cosmos SQL `SELECT` queries server-side.

`/api/diagnostics` is read-only. It reports whether real data mode is enabled, whether the Cosmos endpoint is configured, the configured database/container ids, a count query result, and only safe fields from the latest three appointments. It must not return `COSMOS_KEY`, full documents, or any secret values.

Expected diagnostics shape:

```json
{
  "runtime": "node-express",
  "useRealReportData": false,
  "env": {
    "COSMOS_ENDPOINT_SET": false,
    "COSMOS_KEY_SET": false,
    "COSMOS_DATABASE_ID": null,
    "COSMOS_APPOINTMENTS_CONTAINER_ID": null
  },
  "cosmos": {
    "status": "mock-disabled",
    "count": null,
    "sample": [],
    "error": null
  }
}
```

## Portainer Deployment With Existing Cloudflare Tunnel

This stack is intended for your existing Cloudflare Tunnel named `dash1`. It does not start a `cloudflared` container and does not publish any host ports.

1. Deploy the stack in Portainer from this GitHub repository.
2. Keep `USE_REAL_REPORT_DATA=false` for the first deployment.
3. After deploy, open the `glowtox-reports-dashboard` container in Portainer.
4. Find the container's internal Docker IP address.
5. In the existing Cloudflare Tunnel `dash1`, route `reports.glowtox.link` to `http://<container-ip>:4173`.
6. No public host ports are required.
7. Protect `reports.glowtox.link` with Cloudflare Access before sharing it.

The production compose file uses `expose: 4173` only and does not publish host ports.

The production container runs `npm start`, which starts `node server.js`.

In Portainer, stack environment variables must be referenced under the dashboard service `environment:` block in `docker-compose.yml`. Setting variables in the Portainer UI alone is not enough unless the compose file passes them into the container, for example `COSMOS_DATABASE_ID: ${COSMOS_DATABASE_ID:-}`.

For optional local testing, use `docker-compose.local.yml`. It binds only to `127.0.0.1:4173`.

## Real Read-Only Data Later

Real data access is prepared but intentionally disabled by default. Database access must remain isolated in `src/lib/reports/appointmentReadOnlyRepository.js`.

Required environment variables:

```bash
COSMOS_ENDPOINT=
COSMOS_KEY=
COSMOS_DATABASE_ID=
COSMOS_APPOINTMENTS_CONTAINER_ID=
USE_REAL_REPORT_DATA=false
CLOUDFLARE_TUNNEL_TOKEN=
```

To enable real read-only report data later, set `USE_REAL_REPORT_DATA=true` in the server-side runtime environment and provide the Cosmos DB values above. These values are used only by the Express server and must not be exposed in browser-bundled code.

The repository functions are read-only and use Cosmos SQL `SELECT` queries only:

- `getCreatedBookingsByDay({ from, to, weekday })`
- `getCancelledBookingsByDay({ from, to, weekday })`
- `getAllBookingsByDay({ from, to, weekday })`
- `getPlannedAppointmentsNext30Days({ fromDate })`
- `getCompletedAppointmentsByDay({ from, to, month })`

Before connecting real data, confirm the exact appointment field used to exclude pure `Nachsorge` and `Nachkontrolle` bookings. The current repository includes TODO comments for those filters rather than guessing.

Safety notes:

- Do not add database write operations.
- Do not add schema, migration, deployment, or Azure CLI logic.
- Do not hardcode credentials.
- Keep mock data as the default unless `USE_REAL_REPORT_DATA=true` is set.
