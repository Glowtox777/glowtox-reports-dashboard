# Termin-Dashboard

Lightweight internal dashboard for replacing the first Power BI appointment reports. The current UI uses mock data by default.

## Secure Portainer Deployment With Cloudflare Tunnel

This stack runs the dashboard and `cloudflared` together without publishing any host ports. The dashboard is reachable only inside the Docker network at `http://dashboard:4173`.

1. Create a Cloudflare Tunnel first.
2. In Cloudflare Zero Trust, set the tunnel public hostname:
   - `reports.glowtox.link` to service `http://dashboard:4173`
   - or `reports.glowtox.de` to service `http://dashboard:4173`
3. Copy the tunnel token.
4. In Portainer, create a stack from this GitHub repository.
5. Add `CLOUDFLARE_TUNNEL_TOKEN` in the Portainer stack environment variables. Do not commit the token to Git.
6. Keep `USE_REAL_REPORT_DATA=false` for the first deployment.
7. Deploy the stack using `docker-compose.yml`.
8. Protect the hostname with Cloudflare Access before sharing it.

The production compose file uses `expose: 4173` for the dashboard and does not publish any host ports.

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
