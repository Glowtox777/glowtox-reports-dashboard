import { mockAppointments, toMonthKey } from "./mockData.js";
import {
  buildDiagnosticsFromAppointments,
  fetchAppointmentDocumentsForReports,
  isRealReportDataEnabled,
} from "./appointmentReadOnlyRepository.js";
import { CANCELLATION_STATES, REPORT_TARGETS } from "./reportTypes.js";

const HISTORICAL_START_DATE = "2023-08-20";

export function getDefaultFilters() {
  const today = startOfTodayBerlin();
  const completedMonth = toMonthKey(today);

  return {
    bookings: {
      startDate: getBerlinDateKey(startOfCurrentMonthBerlin()),
      endDate: getBerlinDateKey(endExclusiveForMonth(startOfCurrentMonthBerlin())),
      weekday: "all",
    },
    planned: {
      startDate: getBerlinDateKey(today),
      endDate: getBerlinDateKey(addBerlinDays(today, 30)),
    },
    completed: {
      month: completedMonth,
      startDate: HISTORICAL_START_DATE,
      endDate: getBerlinDateKey(today),
    },
  };
}

export async function getReportsSummary(_filters = getDefaultFilters()) {
  const source = isRealReportDataEnabled() ? "cosmos" : "mock";
  const appointments = source === "cosmos"
    ? await fetchAppointmentDocumentsForReports({
        from: HISTORICAL_START_DATE,
        to: getBerlinDateKey(addBerlinDays(startOfTodayBerlin(), 30)),
      })
    : mockAppointments;
  const summary = buildReportsFromAppointments(appointments, source);

  return {
    source,
    generatedAt: new Date().toLocaleString("de-DE"),
    useRealReportData: isRealReportDataEnabled(),
    filters: getDefaultFilters(),
    completedMonths: summary.completedMonths,
    debugCounts: summary.debugCounts,
    reports: summary.reports,
  };
}

function buildReportsFromAppointments(appointments, source) {
  const now = new Date();
  const periods = getBerlinBookingPeriods(now);
  const monthDates = buildDateRange(periods.month.startDate, periods.month.endDateExclusive);
  const plannedStart = startOfTodayBerlin(now);
  const plannedEndExclusive = addBerlinDays(plannedStart, 31);
  const completedStart = startOfBerlinDate(HISTORICAL_START_DATE);
  const completedEndExclusive = addBerlinDays(startOfTodayBerlin(now), 1);

  const bookingBase = appointments.filter((appointment) => appointment.created_at && appointment.isOnlyAftercare === false);
  const acceptedCreatedThisMonth = bookingBase.filter(
    (appointment) => isInRange(appointment.created_at, periods.month.start, periods.month.endExclusive) && appointment.state === "accepted",
  );
  const cancelledCreatedThisMonth = bookingBase.filter(
    (appointment) => isInRange(appointment.created_at, periods.month.start, periods.month.endExclusive) && isCancellationState(appointment.state),
  );
  const allCreatedThisMonth = bookingBase.filter(
    (appointment) => isInRange(appointment.created_at, periods.month.start, periods.month.endExclusive),
  );

  const plannedAppointments = appointments.filter((appointment) => (
    appointment.starts_at &&
    isInRange(appointment.starts_at, plannedStart, plannedEndExclusive) &&
    appointment.state === "accepted" &&
    appointment.isOnlyAftercare === false
  ));
  const completedAppointments = appointments.filter((appointment) => (
    appointment.starts_at &&
    isInRange(appointment.starts_at, completedStart, completedEndExclusive) &&
    appointment.state === "accepted" &&
    appointment.isOnlyAftercare === false &&
    isNoShowFalse(appointment.no_show)
  ));

  const plannedRows = rowsForRange(plannedAppointments, "starts_at", getBerlinDateKey(plannedStart), getBerlinDateKey(plannedEndExclusive))
    .map(withPlannedFields);
  const completedRows = rowsForRange(
    completedAppointments,
    "starts_at",
    HISTORICAL_START_DATE,
    getBerlinDateKey(completedEndExclusive),
  ).map(withCompletedFields);

  const bookingKpis = buildBookingKpis(bookingBase, periods);
  const diagnostics = buildDiagnosticsFromAppointments(appointments);
  const plannedTotal = plannedRows.reduce((sum, row) => sum + row.count, 0);
  const completedTotal = completedRows.reduce((sum, row) => sum + row.count, 0);

  return {
    completedMonths: getMonthsFromRows(completedRows),
    debugCounts: {
      appointmentsFetched: appointments.length,
      createdTodayAll: bookingKpis.today.all,
      createdTodayAccepted: bookingKpis.today.accepted,
      createdThisWeekAll: bookingKpis.week.all,
      createdThisMonthAll: bookingKpis.month.all,
      plannedNext30Days: plannedTotal,
      completedTotalHistorical: completedTotal,
    },
    reports: {
      bookings: {
        heartbeat: new Date().toLocaleString("de-DE"),
        latestDataDate: latestDateFromAppointments(bookingBase, "created_at"),
        kpis: bookingKpis,
        periods: bookingPeriodMetadata(periods),
        stateDistribution: diagnostics.stateDistribution,
        createdRows: rowsFromCounts(countByBerlinDay(acceptedCreatedThisMonth, "created_at"), monthDates),
        cancelledRows: rowsFromCounts(countByBerlinDay(cancelledCreatedThisMonth, "created_at"), monthDates),
        allRows: rowsFromCounts(countByBerlinDay(allCreatedThisMonth, "created_at"), monthDates),
      },
      planned: {
        heartbeat: new Date().toLocaleString("de-DE"),
        latestDataDate: latestDateFromAppointments(plannedAppointments, "starts_at"),
        rows: plannedRows,
        total: plannedTotal,
      },
      completed: {
        heartbeat: new Date().toLocaleString("de-DE"),
        latestDataDate: latestDateFromAppointments(completedAppointments, "starts_at"),
        rows: completedRows,
        total: completedTotal,
        source,
      },
    },
  };
}

function buildBookingKpis(appointments, periods) {
  return Object.fromEntries(
    Object.entries(periods).map(([key, period]) => {
      const periodAppointments = appointments.filter((appointment) => (
        isInRange(appointment.created_at, period.start, period.endExclusive)
      ));

      return [
        key,
        {
          accepted: periodAppointments.filter((appointment) => appointment.state === "accepted").length,
          cancelled: periodAppointments.filter((appointment) => isCancellationState(appointment.state)).length,
          all: periodAppointments.length,
        },
      ];
    }),
  );
}

function rowsForRange(appointments, fieldName, startDate, endExclusiveDate) {
  return rowsFromCounts(
    countByBerlinDay(appointments, fieldName),
    buildDateRange(startDate, endExclusiveDate),
  );
}

function rowsFromCounts(counts, dateKeys) {
  return dateKeys.map((date) => ({
    date,
    dateDisplay: formatDate(date),
    label: formatShortDate(date),
    count: counts.get(date) ?? 0,
  }));
}

function withPlannedFields(row) {
  return {
    ...row,
    termine: row.count,
    delta45: row.count - REPORT_TARGETS.plannedDelta,
    percent53: formatPercent(row.count / REPORT_TARGETS.plannedPercentBase),
  };
}

function withCompletedFields(row) {
  return {
    ...row,
    termine: row.count,
    delta51: row.count - REPORT_TARGETS.completedDelta,
    percent64: formatPercent(row.count / REPORT_TARGETS.completedPercentBase),
  };
}

function countByBerlinDay(appointments, fieldName) {
  const counts = new Map();

  appointments.forEach((appointment) => {
    const key = getBerlinDateKey(new Date(appointment[fieldName]));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

function getBerlinBookingPeriods(now = new Date()) {
  const todayStart = startOfTodayBerlin(now);
  const weekStart = startOfCurrentWeekBerlin(now);
  const monthStart = startOfCurrentMonthBerlin(now);

  return {
    today: buildPeriod("Heute", todayStart, addBerlinDays(todayStart, 1)),
    week: buildPeriod("Diese Woche", weekStart, addBerlinDays(weekStart, 7)),
    month: buildPeriod("Dieser Monat", monthStart, endExclusiveForMonth(monthStart)),
  };
}

function buildPeriod(label, start, endExclusive) {
  return {
    label,
    start,
    endExclusive,
    startDate: getBerlinDateKey(start),
    endDateExclusive: getBerlinDateKey(endExclusive),
  };
}

function bookingPeriodMetadata(periods) {
  return Object.fromEntries(
    Object.entries(periods).map(([key, period]) => [
      key,
      {
        label: period.label,
        rangeLabel: `${formatDate(period.startDate)} - ${formatDate(getBerlinDateKey(addBerlinDays(period.endExclusive, -1)))}`,
        from: period.start.toISOString(),
        toExclusive: period.endExclusive.toISOString(),
      },
    ]),
  );
}

export function getBerlinDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
}

export function startOfTodayBerlin(now = new Date()) {
  return startOfBerlinDate(getBerlinDateKey(now));
}

export function startOfCurrentWeekBerlin(now = new Date()) {
  const todayStart = startOfTodayBerlin(now);
  const weekday = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  }).formatToParts(todayStart).find((part) => part.type === "weekday") ? berlinWeekdayNumber(todayStart) : 1);

  return addBerlinDays(todayStart, 1 - weekday);
}

export function startOfCurrentMonthBerlin(now = new Date()) {
  const [year, month] = getBerlinDateKey(now).split("-");
  return startOfBerlinDate(`${year}-${month}-01`);
}

function endExclusiveForMonth(monthStart) {
  const [year, month] = getBerlinDateKey(monthStart).split("-").map(Number);
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return startOfBerlinDate(nextMonth);
}

function startOfBerlinDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000${berlinOffsetForDate(dateKey)}`);
}

function addBerlinDays(date, days) {
  const dateKey = getBerlinDateKey(date);
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  const nextDateKey = `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, "0")}-${String(utcDate.getUTCDate()).padStart(2, "0")}`;

  return startOfBerlinDate(nextDateKey);
}

function berlinWeekdayNumber(date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  }).format(date);
  const map = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[weekday] ?? 1;
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

function isInRange(value, start, endExclusive) {
  const date = new Date(value);
  return date >= start && date < endExclusive;
}

function isCancellationState(state) {
  return CANCELLATION_STATES.includes(state);
}

function isNoShowFalse(value) {
  return value === false || value === undefined || value === null;
}

function buildDateRange(startDate, endExclusiveDate) {
  const dates = [];
  let cursor = startOfBerlinDate(startDate);
  const end = startOfBerlinDate(endExclusiveDate);

  while (cursor < end) {
    dates.push(getBerlinDateKey(cursor));
    cursor = addBerlinDays(cursor, 1);
  }

  return dates;
}

function getMonthsFromRows(rows) {
  return [...new Set(rows.map((row) => row.date.slice(0, 7).replace("-", "")))]
    .sort()
    .reverse();
}

function latestDateFromAppointments(appointments, fieldName) {
  const latest = appointments
    .filter((appointment) => appointment[fieldName])
    .map((appointment) => new Date(appointment[fieldName]))
    .sort((left, right) => left - right)
    .at(-1);

  return latest ? formatDate(getBerlinDateKey(latest)) : "Keine Daten";
}

function formatPercent(value) {
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
