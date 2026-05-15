# Termin-Dashboard

Lightweight internal dashboard for replacing the first Power BI appointment reports. The current UI uses mock data by default.

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

To enable real read-only report data later, set `USE_REAL_REPORT_DATA=true` in the server-side runtime environment and provide the Cosmos DB values above. Do not expose these variables in browser-bundled code.

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
