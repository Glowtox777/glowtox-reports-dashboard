import { mockAppointments, addDays, toDateKey, toMonthKey } from "./mockData.js";
import {
  getAllBookingsByDay,
  getCancelledBookingsByDay,
  getCompletedAppointmentsByDay,
  getCreatedBookingsByDay,
  getPlannedAppointmentsNext30Days,
  isRealReportDataEnabled,
} from "./appointmentReadOnlyRepository.js";
import { REPORT_TARGETS } from "./reportTypes.js";

const today = new Date();
const defaultStart = "2024-01-01";
const defaultEnd = toDateKey(addDays(today, 30));

export function getDefaultFilters() {
  const completedMonth = toMonthKey(today);

  return {
    bookings: {
      startDate: defaultStart,
      endDate: toDateKey(today),
      weekday: "all",
    },
    planned: {
      startDate: toDateKey(today),
      endDate: toDateKey(addDays(today, 30)),
    },
    completed: {
      month: completedMonth,
      startDate: `${completedMonth.slice(0, 4)}-${completedMonth.slice(4, 6)}-01`,
      endDate: toDateKey(today),
    },
  };
}

export function getBookingsReport(filters) {
  const scoped = mockAppointments.filter((appointment) => {
    const createdDate = toDateKey(appointment.created_at);

    return (
      !appointment.isOnlyAftercare &&
      // TODO: Add exact treatment/service/category field filter to exclude pure "Nachsorge" bookings.
      createdDate >= filters.startDate &&
      createdDate <= filters.endDate &&
      (filters.weekday === "all" || appointment.created_at_weekday === filters.weekday)
    );
  });

  const accepted = scoped.filter((appointment) => appointment.state === "accepted");
  const cancelled = scoped.filter((appointment) => appointment.state === "cancelled");

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDate(scoped, "created_at"),
    createdRows: groupByDay(accepted, "created_at", filters.startDate, filters.endDate),
    cancelledRows: groupByDay(cancelled, "created_at", filters.startDate, filters.endDate),
    allRows: groupByDay(scoped, "created_at", filters.startDate, filters.endDate),
  };
}

export async function getBookingsReportFromConfiguredSource(filters) {
  if (!isRealReportDataEnabled()) {
    return getBookingsReport(filters);
  }

  const [createdRows, cancelledRows, allRows] = await Promise.all([
    getCreatedBookingsByDay({
      from: filters.startDate,
      to: filters.endDate,
      weekday: filters.weekday,
    }),
    getCancelledBookingsByDay({
      from: filters.startDate,
      to: filters.endDate,
      weekday: filters.weekday,
    }),
    getAllBookingsByDay({
      from: filters.startDate,
      to: filters.endDate,
      weekday: filters.weekday,
    }),
  ]);

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDateFromRows(allRows),
    createdRows: rowsFromCounts(createdRows, filters.startDate, filters.endDate),
    cancelledRows: rowsFromCounts(cancelledRows, filters.startDate, filters.endDate),
    allRows: rowsFromCounts(allRows, filters.startDate, filters.endDate),
  };
}

export function getPlannedReport(filters) {
  const rows = groupByDay(
    mockAppointments.filter((appointment) => {
      const startsDate = toDateKey(appointment.starts_at);

      return (
        startsDate >= filters.startDate &&
        startsDate <= filters.endDate &&
        appointment.state === "accepted" &&
        !appointment.isOnlyAftercare
        // TODO: Add exact treatment/service/category field filter to exclude pure "Nachsorge" appointments.
      );
    }),
    "starts_at",
    filters.startDate,
    filters.endDate,
  ).map((row) => ({
    ...row,
    termine: row.count,
    delta45: row.count - REPORT_TARGETS.plannedDelta,
    percent53: formatPercent(row.count / REPORT_TARGETS.plannedPercentBase),
  }));

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDate(
      mockAppointments.filter((appointment) => {
        const startsDate = toDateKey(appointment.starts_at);
        return startsDate >= filters.startDate && startsDate <= filters.endDate;
      }),
      "starts_at",
    ),
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export async function getPlannedReportFromConfiguredSource(filters) {
  if (!isRealReportDataEnabled()) {
    return getPlannedReport(filters);
  }

  const realRows = await getPlannedAppointmentsNext30Days({ fromDate: filters.startDate });
  const rows = rowsFromCounts(realRows, filters.startDate, filters.endDate).map((row) => ({
    ...row,
    termine: row.count,
    delta45: row.count - REPORT_TARGETS.plannedDelta,
    percent53: formatPercent(row.count / REPORT_TARGETS.plannedPercentBase),
  }));

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDateFromRows(realRows),
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export function getCompletedReport(filters) {
  const rows = groupByDay(
    mockAppointments.filter((appointment) => {
      const startsDate = toDateKey(appointment.starts_at);

      return (
        startsDate <= filters.endDate &&
        startsDate >= filters.startDate &&
        appointment.starts_at_monthonly === filters.month &&
        appointment.state === "accepted" &&
        !appointment.isOnlyAftercare &&
        appointment.no_show === false
        // TODO: Add exact treatment/service/category field filter to exclude pure "Nachkontrolle" appointments.
      );
    }),
    "starts_at",
    filters.startDate,
    filters.endDate,
  ).map((row) => ({
    ...row,
    termine: row.count,
    delta51: row.count - REPORT_TARGETS.completedDelta,
    percent64: formatPercent(row.count / REPORT_TARGETS.completedPercentBase),
  }));

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDate(
      mockAppointments.filter((appointment) => {
        const startsDate = toDateKey(appointment.starts_at);
        return startsDate >= filters.startDate && startsDate <= filters.endDate && startsDate <= toDateKey(today);
      }),
      "starts_at",
    ),
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export async function getCompletedReportFromConfiguredSource(filters) {
  if (!isRealReportDataEnabled()) {
    return getCompletedReport(filters);
  }

  const realRows = await getCompletedAppointmentsByDay({
    from: filters.startDate,
    to: filters.endDate,
    month: filters.month,
  });
  const rows = rowsFromCounts(realRows, filters.startDate, filters.endDate).map((row) => ({
    ...row,
    termine: row.count,
    delta51: row.count - REPORT_TARGETS.completedDelta,
    percent64: formatPercent(row.count / REPORT_TARGETS.completedPercentBase),
  }));

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDateFromRows(realRows),
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export function getAvailableCompletedMonths() {
  return [...new Set(mockAppointments.map((appointment) => appointment.starts_at_monthonly))]
    .filter((month) => month <= toMonthKey(today))
    .sort()
    .reverse();
}

export function groupByDay(appointments, fieldName, startDate, endDate) {
  const counts = new Map();

  appointments.forEach((appointment) => {
    const key = toDateKey(appointment[fieldName]);
    counts.set(key, (counts.get(key) ?? 0) + (appointment.number_of_appointments ?? 1));
  });

  const dates = buildDateRange(startDate, endDate);

  return dates.map((date) => ({
      date,
      dateDisplay: formatDate(date),
      label: formatShortDate(date),
      count: counts.get(date) ?? 0,
    }));
}

export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${dateKey}T00:00:00`));
}

function formatDate(dateKey) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00`));
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  let cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function rowsFromCounts(rows, startDate, endDate) {
  const counts = new Map(rows.map((row) => [row.date, row.count]));

  return buildDateRange(startDate, endDate).map((date) => ({
    date,
    dateDisplay: formatDate(date),
    label: formatShortDate(date),
    count: counts.get(date) ?? 0,
  }));
}

function latestDate(appointments, fieldName) {
  if (appointments.length === 0) {
    return "Keine Daten";
  }

  const latest = appointments
    .map((appointment) => toDateKey(appointment[fieldName]))
    .sort()
    .at(-1);

  return formatDate(latest);
}

function latestDateFromRows(rows) {
  const latest = rows
    .filter((row) => row.count > 0)
    .map((row) => row.date)
    .sort()
    .at(-1);

  return latest ? formatDate(latest) : "Keine Daten";
}
