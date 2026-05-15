# Termin-Dashboard

Lightweight internal dashboard for replacing the first Power BI appointment reports. The current UI uses mock data by default.

## Real Read-Only Data Later

Real data access is prepared but intentionally disabled by default. Database access must remain isolated in `src/lib/reports/appointmentReadOnlyRepository.js`.

Required environment variables:

```bash
COSMOS_ENDPOINT=
COSMOS_KEY=
COSMOS_DATABASE_ID=
COSMOS_APPOINTMENTS_CONTAINER_ID=
USE_REAL_REPORT_DATA=false
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
