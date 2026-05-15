import { mockAppointments, addDays, toDateKey, toMonthKey } from "./mockData.js";
import {
  getAllBookingsByDay,
  getBookingKpisForPeriods,
  getCancelledBookingsByDay,
  getCompletedAppointmentsByDay,
  getCreatedBookingsByDay,
  getPlannedAppointmentsNext30Days,
  isRealReportDataEnabled,
} from "./appointmentReadOnlyRepository.js";
import { CANCELLATION_STATES, REPORT_TARGETS } from "./reportTypes.js";

const today = new Date();
const berlinPeriods = getBerlinBookingPeriods();

export function getDefaultFilters() {
  const completedMonth = toMonthKey(today);

  return {
    bookings: {
      startDate: berlinPeriods.month.startDate,
      endDate: berlinPeriods.month.endDate,
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

export async function getReportsSummary(filters = getDefaultFilters()) {
  const [bookings, planned, completed] = await Promise.all([
    getBookingsReportFromConfiguredSource(filters.bookings),
    getPlannedReportFromConfiguredSource(filters.planned),
    getCompletedReportFromConfiguredSource(filters.completed),
  ]);

  return {
    generatedAt: new Date().toLocaleString("de-DE"),
    useRealReportData: isRealReportDataEnabled(),
    filters,
    completedMonths: getAvailableCompletedMonths(),
    reports: {
      bookings,
      planned,
      completed,
    },
  };
}

export function getBookingsReport(filters) {
  const periods = getBerlinBookingPeriods();
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
  const cancelled = scoped.filter((appointment) => CANCELLATION_STATES.includes(appointment.state));

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDate(scoped, "created_at"),
    kpis: getMockBookingKpis(periods),
    periods: bookingPeriodMetadata(periods),
    stateDistribution: getMockStateDistribution(periods.month),
    createdRows: groupByDay(accepted, "created_at", filters.startDate, filters.endDate),
    cancelledRows: groupByDay(cancelled, "created_at", filters.startDate, filters.endDate),
    allRows: groupByDay(scoped, "created_at", filters.startDate, filters.endDate),
  };
}

export async function getBookingsReportFromConfiguredSource(filters) {
  const periods = getBerlinBookingPeriods();
  const chartStart = periods.month.startDate;
  const chartEnd = periods.month.endDate;

  if (!isRealReportDataEnabled()) {
    return getBookingsReport({
      ...filters,
      startDate: chartStart,
      endDate: chartEnd,
    });
  }

  const [bookingKpis, createdRows, cancelledRows, allRows] = await Promise.all([
    getBookingKpisForPeriods(periods),
    getCreatedBookingsByDay({
      from: periods.month.from,
      to: periods.month.to,
      weekday: "all",
    }),
    getCancelledBookingsByDay({
      from: periods.month.from,
      to: periods.month.to,
      weekday: "all",
    }),
    getAllBookingsByDay({
      from: periods.month.from,
      to: periods.month.to,
      weekday: "all",
    }),
  ]);

  return {
    heartbeat: new Date().toLocaleString("de-DE"),
    latestDataDate: latestDateFromRows(allRows),
    kpis: bookingKpis.periods,
    periods: bookingPeriodMetadata(periods),
    stateDistribution: bookingKpis.stateDistribution,
    createdRows: rowsFromCounts(createdRows, chartStart, chartEnd),
    cancelledRows: rowsFromCounts(cancelledRows, chartStart, chartEnd),
    allRows: rowsFromCounts(allRows, chartStart, chartEnd),
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

function getMockBookingKpis(periods) {
  return Object.fromEntries(
    Object.entries(periods).map(([key, period]) => {
      const appointments = mockAppointments.filter((appointment) => {
        const createdAt = new Date(appointment.created_at);

        return createdAt >= new Date(period.from) && createdAt <= new Date(period.to) && !appointment.isOnlyAftercare;
      });

      return [
        key,
        {
          accepted: appointments.filter((appointment) => appointment.state === "accepted").length,
          cancelled: appointments.filter((appointment) => CANCELLATION_STATES.includes(appointment.state)).length,
          all: appointments.length,
        },
      ];
    }),
  );
}

function getMockStateDistribution(period) {
  const counts = new Map();

  mockAppointments
    .filter((appointment) => {
      const createdAt = new Date(appointment.created_at);
      return createdAt >= new Date(period.from) && createdAt <= new Date(period.to) && !appointment.isOnlyAftercare;
    })
    .forEach((appointment) => {
      counts.set(appointment.state, (counts.get(appointment.state) ?? 0) + 1);
    });

  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((left, right) => right.count - left.count);
}

function bookingPeriodMetadata(periods) {
  return Object.fromEntries(
    Object.entries(periods).map(([key, period]) => [
      key,
      {
        label: period.label,
        rangeLabel: `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`,
        from: period.from,
        to: period.to,
      },
    ]),
  );
}

function getBerlinBookingPeriods(now = new Date()) {
  const todayParts = getBerlinDateParts(now);
  const todayDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  const weekday = todayDate.getUTCDay() === 0 ? 7 : todayDate.getUTCDay();
  const weekStart = addUtcDays(todayDate, 1 - weekday);
  const weekEnd = addUtcDays(weekStart, 6);
  const monthStart = new Date(Date.UTC(todayParts.year, todayParts.month - 1, 1));
  const monthEnd = new Date(Date.UTC(todayParts.year, todayParts.month, 0));

  return {
    today: periodFromDates("Heute", todayDate, todayDate),
    week: periodFromDates("Diese Woche", weekStart, weekEnd),
    month: periodFromDates("Dieser Monat", monthStart, monthEnd),
  };
}

function periodFromDates(label, startDate, endDate) {
  const startDateKey = utcDateKey(startDate);
  const endDateKey = utcDateKey(endDate);

  return {
    label,
    startDate: startDateKey,
    endDate: endDateKey,
    from: berlinDateTimeWithOffset(startDateKey, "00:00:00.000"),
    to: berlinDateTimeWithOffset(endDateKey, "23:59:59.999"),
  };
}

function getBerlinDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function berlinDateTimeWithOffset(dateKey, time) {
  return `${dateKey}T${time}${berlinOffsetForDate(dateKey)}`;
}

function berlinOffsetForDate(dateKey) {
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset",
  })
    .formatToParts(probe)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    return "+01:00";
  }

  return `${match[1]}${match[2].padStart(2, "0")}:${match[3] ?? "00"}`;
}

function addUtcDays(value, days) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcDateKey(value) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}
