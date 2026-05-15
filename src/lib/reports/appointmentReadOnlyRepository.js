// Read-only Azure Cosmos DB repository for appointment reports.
//
// Safety constraints:
// - This file is the only place future database access should live.
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

export function isRealReportDataEnabled() {
  return getEnvValue("USE_REAL_REPORT_DATA") === "true";
}

export async function getCreatedBookingsByDay({ from, to, weekday = "all" }) {
  return queryAppointmentsByDay({
    dateField: "created_at",
    from,
    to,
    weekday,
    weekdayField: "created_at_weekday",
    state: "accepted",
    extraWhere: [],
    // TODO: Confirm the exact treatment/service/category field used to exclude pure "Nachsorge" bookings.
  });
}

export async function getCancelledBookingsByDay({ from, to, weekday = "all" }) {
  return queryAppointmentsByDay({
    dateField: "created_at",
    from,
    to,
    weekday,
    weekdayField: "created_at_weekday",
    state: "cancelled",
    extraWhere: [],
    // TODO: Confirm the exact treatment/service/category field used to exclude pure "Nachsorge" bookings.
  });
}

export async function getAllBookingsByDay({ from, to, weekday = "all" }) {
  return queryAppointmentsByDay({
    dateField: "created_at",
    from,
    to,
    weekday,
    weekdayField: "created_at_weekday",
    extraWhere: [],
    // TODO: Confirm the exact treatment/service/category field used to exclude pure "Nachsorge" bookings.
  });
}

export async function getPlannedAppointmentsNext30Days({ fromDate }) {
  const toDate = addDays(fromDate, 30);

  return queryAppointmentsByDay({
    dateField: "starts_at",
    from: fromDate,
    to: toDate,
    state: "accepted",
    extraWhere: [],
    // TODO: Confirm the exact treatment/service/category field used to exclude pure "Nachsorge" appointments.
  });
}

export async function getCompletedAppointmentsByDay({ from, to, month }) {
  const extraWhere = [
    "c.no_show = false",
    "c.starts_at_monthonly = @month",
  ];

  return queryAppointmentsByDay({
    dateField: "starts_at",
    from,
    to,
    state: "accepted",
    extraWhere,
    extraParameters: [{ name: "@month", value: month }],
    // TODO: Confirm the exact treatment/service/category field used to exclude pure "Nachkontrolle" appointments.
  });
}

async function queryAppointmentsByDay({
  dateField,
  from,
  to,
  weekday,
  weekdayField,
  state,
  extraWhere = [],
  extraParameters = [],
}) {
  assertSafeFieldName(dateField);
  if (weekdayField) {
    assertSafeFieldName(weekdayField);
  }

  const container = await getAppointmentsContainer();
  const dateExpression = `SUBSTRING(c.${dateField}, 0, 10)`;
  const where = [
    `c.${dateField} >= @from`,
    `c.${dateField} <= @to`,
    "c.isOnlyAftercare = false",
    ...extraWhere,
  ];
  const parameters = [
    { name: "@from", value: startOfDay(from) },
    { name: "@to", value: endOfDay(to) },
    ...extraParameters,
  ];

  if (state) {
    where.push("c.state = @state");
    parameters.push({ name: "@state", value: state });
  }

  if (weekday && weekday !== "all" && weekdayField) {
    where.push(`c.${weekdayField} = @weekday`);
    parameters.push({ name: "@weekday", value: weekday });
  }

  const querySpec = {
    query: `
      SELECT ${dateExpression} AS date, COUNT(1) AS count
      FROM c
      WHERE ${where.join(" AND ")}
      GROUP BY ${dateExpression}
    `,
    parameters,
  };

  const { resources } = await container.items.query(querySpec, { enableCrossPartitionQuery: true }).fetchAll();
  return resources
    .map((row) => ({
      date: row.date,
      count: row.count,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
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

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function startOfDay(dateKey) {
  return `${dateKey}T00:00:00.000Z`;
}

function endOfDay(dateKey) {
  return `${dateKey}T23:59:59.999Z`;
}

function toDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function assertSafeFieldName(fieldName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
    throw new Error(`Unsafe field name in read-only report query: ${fieldName}`);
  }
}
