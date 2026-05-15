// Future database boundary for Azure Cosmos DB / mirrored database reads.
// Keep this file read-only: only SELECT/read operations, no create/update/delete/upsert,
// no schema changes, no migrations, and no hardcoded secrets.
// Connection details must come from environment variables in the final implementation.

export async function getCreatedBookingsByDay(_params) {
  throw new Error("Read-only database access is not implemented. The dashboard currently uses mock data.");
  /*
    Final implementation note:
    Use a parameterized SELECT/read-only query grouped by date(created_at).
    Required filters:
    - isOnlyAftercare = false
    - TODO: confirm exact treatment/service/category field used to exclude pure "Nachsorge"
  */
}

export async function getPlannedAppointmentsNext30Days(_params) {
  throw new Error("Read-only database access is not implemented. The dashboard currently uses mock data.");
  /*
    Final implementation note:
    Use a parameterized SELECT/read-only query for starts_at between today and today + 30 days.
    Required filters:
    - state = "accepted"
    - isOnlyAftercare = false
    - TODO: confirm exact treatment/service/category field used to exclude pure "Nachsorge"
  */
}

export async function getCompletedAppointmentsByDay(_params) {
  throw new Error("Read-only database access is not implemented. The dashboard currently uses mock data.");
  /*
    Final implementation note:
    Use a parameterized SELECT/read-only query for starts_at <= today grouped by starts_at date.
    Required filters:
    - state = "accepted"
    - isOnlyAftercare = false
    - no_show = false
    - TODO: confirm exact treatment/service/category field used to exclude pure "Nachkontrolle"
  */
}
