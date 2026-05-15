// Read-only Azure Cosmos DB repository for appointment reports.
//
// Safety constraints:
// - This file is the only place database access should live.
// - Only SELECT/read operations are allowed here.
// - Do not add insert/update/delete/upsert/patch/replace operations.
// - Do not add schema, migration, container, or database management logic.
// - Do not hardcode secrets; all connection settings must come from environment variables.
// - Nothing in this file connects to Cosmos DB at import time.

const REQUIRED_ENV = [
  "COSMOS_ENDPOINT",
  "COSMOS_KEY",
  "COSMOS_DATABASE_ID",
  "COSMOS_APPOINTMENTS_CONTAINER_ID",
];

const SAFE_APPOINTMENT_FIELDS = [
  "id",
  "created_at",
  "starts_at",
  "state",
  "isOnlyAftercare",
  "no_show",
  "customer_id",
];

export function isRealReportDataEnabled() {
  return getEnvValue("USE_REAL_REPORT_DATA") === "true";
}

export async function fetchAppointmentDocumentsForReports({ from = "2023-08-20", to } = {}) {
  const container = await getAppointmentsContainer();
  const toDate = to ?? toDateKey(addDays(new Date(), 30));
  const querySpec = {
    query: `
      SELECT
        c.id,
        c.created_at,
        c.starts_at,
        c.state,
        c.isOnlyAftercare,
        c.no_show,
        c.customer_id
      FROM c
      WHERE
        (
          IS_DEFINED(c.created_at)
          AND c.created_at >= @from
          AND c.created_at <= @to
        )
        OR
        (
          IS_DEFINED(c.starts_at)
          AND c.starts_at >= @from
          AND c.starts_at <= @to
        )
    `,
    parameters: [
      { name: "@from", value: from },
      { name: "@to", value: `${toDate}T23:59:59.999+02:00` },
    ],
  };

  const { resources } = await container.items.query(querySpec, { enableCrossPartitionQuery: true }).fetchAll();
  return resources.map(toSafeAppointment);
}

export async function getAppointmentDiagnostics() {
  const appointments = await fetchAppointmentDocumentsForReports();
  return buildDiagnosticsFromAppointments(appointments);
}

export function buildDiagnosticsFromAppointments(appointments) {
  const stateDistribution = countBy(appointments, (appointment) => appointment.state ?? "missing");

  return {
    totalDocumentsQueried: appointments.length,
    createdAtDefined: appointments.filter((appointment) => appointment.created_at).length,
    startsAtDefined: appointments.filter((appointment) => appointment.starts_at).length,
    isOnlyAftercare: {
      true: appointments.filter((appointment) => appointment.isOnlyAftercare === true).length,
      false: appointments.filter((appointment) => appointment.isOnlyAftercare === false).length,
      missing: appointments.filter((appointment) => appointment.isOnlyAftercare === undefined || appointment.isOnlyAftercare === null).length,
    },
    no_show: {
      true: appointments.filter((appointment) => appointment.no_show === true).length,
      false: appointments.filter((appointment) => appointment.no_show === false).length,
      missing: appointments.filter((appointment) => appointment.no_show === undefined || appointment.no_show === null).length,
    },
    stateDistribution,
    latestSamples: [...appointments]
      .filter((appointment) => appointment.created_at || appointment.starts_at)
      .sort((left, right) => latestTimestamp(right) - latestTimestamp(left))
      .slice(0, 5)
      .map(toSafeAppointment),
  };
}

async function getAppointmentsContainer() {
  const env = getCosmosEnv();
  const { CosmosClient } = await import("@azure/cosmos");
  const client = new CosmosClient({
    endpoint: env.COSMOS_ENDPOINT,
    key: env.COSMOS_KEY,
  });

  return client
    .database(env.COSMOS_DATABASE_ID)
    .container(env.COSMOS_APPOINTMENTS_CONTAINER_ID);
}

function getCosmosEnv() {
  const missing = REQUIRED_ENV.filter((name) => !getEnvValue(name));

  if (missing.length > 0) {
    throw new Error(`Missing required Cosmos DB environment variables: ${missing.join(", ")}`);
  }

  return {
    COSMOS_ENDPOINT: getEnvValue("COSMOS_ENDPOINT"),
    COSMOS_KEY: getEnvValue("COSMOS_KEY"),
    COSMOS_DATABASE_ID: getEnvValue("COSMOS_DATABASE_ID"),
    COSMOS_APPOINTMENTS_CONTAINER_ID: getEnvValue("COSMOS_APPOINTMENTS_CONTAINER_ID"),
  };
}

function getEnvValue(name) {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  return process.env[name];
}

function toSafeAppointment(appointment) {
  return Object.fromEntries(
    SAFE_APPOINTMENT_FIELDS.map((field) => [field, appointment[field]]),
  );
}

function countBy(items, getKey) {
  const counts = new Map();

  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((left, right) => right.count - left.count);
}

function latestTimestamp(appointment) {
  const value = appointment.created_at ?? appointment.starts_at;
  return value ? new Date(value).getTime() : 0;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
