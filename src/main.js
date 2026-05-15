import { renderDailyBarChart } from "./components/DailyBarChart.js";
import { renderReportTable } from "./components/ReportTable.js";
import { REPORT_TARGETS } from "./lib/reports/reportTypes.js";

let filters = null;

const elements = {
  globalHeartbeat: document.querySelector("#globalHeartbeat"),
  bookingChart: document.querySelector("#bookingChart"),
  bookingTable: document.querySelector("#bookingTable"),
  cancelledChart: document.querySelector("#cancelledChart"),
  cancelledTable: document.querySelector("#cancelledTable"),
  allBookingsChart: document.querySelector("#allBookingsChart"),
  allBookingsTable: document.querySelector("#allBookingsTable"),
  plannedChart: document.querySelector("#plannedChart"),
  plannedTable: document.querySelector("#plannedTable"),
  completedChart: document.querySelector("#completedChart"),
  completedTable: document.querySelector("#completedTable"),
};

const monthSelect = document.querySelector("#completedMonth");

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".report").forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("is-active");
  });
});

bindFilter("#bookingsStart", (value) => {
  if (!filters) return;
  filters.bookings.startDate = value;
  loadSummary();
});
bindFilter("#bookingsEnd", (value) => {
  if (!filters) return;
  filters.bookings.endDate = value;
  loadSummary();
});
bindFilter("#weekdayFilter", (value) => {
  if (!filters) return;
  filters.bookings.weekday = value;
  loadSummary();
});
bindFilter("#plannedStart", (value) => {
  if (!filters) return;
  filters.planned.startDate = value;
  loadSummary();
});
bindFilter("#plannedEnd", (value) => {
  if (!filters) return;
  filters.planned.endDate = value;
  loadSummary();
});
bindFilter("#completedMonth", (value) => {
  if (!filters) return;
  filters.completed.month = value;
  filters.completed.startDate = `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
  document.querySelector("#completedStart").value = filters.completed.startDate;
  loadSummary();
});
bindFilter("#completedStart", (value) => {
  if (!filters) return;
  filters.completed.startDate = value;
  loadSummary();
});
bindFilter("#completedEnd", (value) => {
  if (!filters) return;
  filters.completed.endDate = value;
  loadSummary();
});

loadSummary();

async function loadSummary() {
  try {
    const response = await fetch(`/api/reports/summary${buildQueryString()}`);
    if (!response.ok) {
      throw new Error(`Report API failed with ${response.status}`);
    }
    const summary = await response.json();

    filters = summary.filters;
    syncFilterInputs(summary);
    renderAll(summary);
  } catch (error) {
    elements.globalHeartbeat.textContent = "Berichtsdaten konnten nicht geladen werden.";
    console.error(error);
  }
}

function renderAll(summary) {
  elements.globalHeartbeat.textContent = `Letzte Aktualisierung: ${summary.generatedAt}`;
  renderBookings(summary.reports.bookings);
  renderPlanned(summary.reports.planned);
  renderCompleted(summary.reports.completed);
}

function renderBookings(report) {
  const weekdayLabel = filters.bookings.weekday === "all" ? "alle Wochentage" : translateWeekday(filters.bookings.weekday);
  document.querySelector("#bookingsLatest").textContent =
    `Letztes Datendatum: ${report.latestDataDate} · Filter: ${weekdayLabel}`;

  renderBookingSection({
    chartTarget: elements.bookingChart,
    tableTarget: elements.bookingTable,
    heartbeatTarget: "#bookingsHeartbeat",
    rows: report.createdRows,
    heartbeat: report.heartbeat,
    chartLabel: "Erstellte Buchungen pro Tag",
  });
  renderBookingSection({
    chartTarget: elements.cancelledChart,
    tableTarget: elements.cancelledTable,
    heartbeatTarget: "#cancelledHeartbeat",
    rows: report.cancelledRows,
    heartbeat: report.heartbeat,
    chartLabel: "Abgesagte Buchungen",
    variant: "cancelled",
  });
  renderBookingSection({
    chartTarget: elements.allBookingsChart,
    tableTarget: elements.allBookingsTable,
    heartbeatTarget: "#allBookingsHeartbeat",
    rows: report.allRows,
    heartbeat: report.heartbeat,
    chartLabel: "Alle Buchungen",
  });
}

function renderPlanned(report) {
  document.querySelector("#plannedHeartbeat").textContent = `Heartbeat: ${report.heartbeat}`;
  document.querySelector("#plannedLatest").textContent = `Letztes Datendatum: ${report.latestDataDate}`;

  renderDailyBarChart(elements.plannedChart, report.rows, {
    label: "Geplante Termine",
    size: "tall",
    targets: [
      { value: REPORT_TARGETS.plannedReferenceLine, label: "Ziel" },
      { value: REPORT_TARGETS.plannedDashedLine, label: "Referenz 64", variant: "dashed" },
    ],
  });
  renderReportTable(
    elements.plannedTable,
    [
      { key: "dateDisplay", label: "starts_at" },
      { key: "termine", label: "Termine" },
      { key: "delta45", label: "Delta zu 45" },
      { key: "percent53", label: "Prozent zu 53" },
    ],
    report.rows,
    {
      date: "Total",
      termine: report.total,
      delta45: report.total - REPORT_TARGETS.plannedDelta * report.rows.length,
      percent53: averagePercent(report.total, REPORT_TARGETS.plannedPercentBase * report.rows.length),
    },
  );
}

function renderCompleted(report) {
  document.querySelector("#completedHeartbeat").textContent = `Heartbeat: ${report.heartbeat}`;
  document.querySelector("#completedLatest").textContent = `Letztes Datendatum: ${report.latestDataDate}`;

  renderDailyBarChart(elements.completedChart, report.rows, {
    label: "Stattgefundene Termine",
    size: "tall",
    targets: [
      { value: REPORT_TARGETS.completedDelta, label: "Ziel" },
      { value: REPORT_TARGETS.completedPercentBase, label: "Referenz 64", variant: "dashed" },
    ],
  });
  renderReportTable(
    elements.completedTable,
    [
      { key: "dateDisplay", label: "starts_at" },
      { key: "termine", label: "Termine" },
      { key: "delta51", label: "Delta zu 51" },
      { key: "percent64", label: "% von 64" },
    ],
    report.rows,
    {
      date: "Total",
      termine: report.total,
      delta51: report.total - REPORT_TARGETS.completedDelta * report.rows.length,
      percent64: averagePercent(report.total, REPORT_TARGETS.completedPercentBase * report.rows.length),
    },
  );
}

function renderBookingSection({ chartTarget, tableTarget, heartbeatTarget, rows, heartbeat, chartLabel, variant }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  document.querySelector(heartbeatTarget).textContent = `Total: ${new Intl.NumberFormat("de-DE").format(total)} · Heartbeat: ${heartbeat}`;
  renderDailyBarChart(chartTarget, rows, { label: chartLabel, variant });
  renderReportTable(
    tableTarget,
    [
      { key: "dateDisplay", label: "created_at" },
      { key: "count", label: "Anzahl Termine" },
    ],
    rows,
    { dateDisplay: "Total", count: total },
  );
}

function bindFilter(selector, callback) {
  document.querySelector(selector).addEventListener("change", (event) => callback(event.target.value));
}

function syncFilterInputs(summary) {
  document.querySelector("#bookingsStart").value = filters.bookings.startDate;
  document.querySelector("#bookingsEnd").value = filters.bookings.endDate;
  document.querySelector("#weekdayFilter").value = filters.bookings.weekday;
  document.querySelector("#plannedStart").value = filters.planned.startDate;
  document.querySelector("#plannedEnd").value = filters.planned.endDate;
  document.querySelector("#completedStart").value = filters.completed.startDate;
  document.querySelector("#completedEnd").value = filters.completed.endDate;
  monthSelect.innerHTML = summary.completedMonths
    .map((month) => `<option value="${month}">${month}</option>`)
    .join("");
  monthSelect.value = filters.completed.month;
}

function buildQueryString() {
  if (!filters) {
    return "";
  }

  const params = new URLSearchParams({
    bookingsStart: filters.bookings.startDate,
    bookingsEnd: filters.bookings.endDate,
    weekday: filters.bookings.weekday,
    plannedStart: filters.planned.startDate,
    plannedEnd: filters.planned.endDate,
    completedMonth: filters.completed.month,
    completedStart: filters.completed.startDate,
    completedEnd: filters.completed.endDate,
  });

  return `?${params.toString()}`;
}

function average(total, count) {
  if (count === 0) {
    return "0";
  }

  return (total / count).toFixed(1);
}

function averagePercent(total, base) {
  if (base === 0) {
    return "0%";
  }

  return `${Math.round((total / base) * 100)}%`;
}

function translateWeekday(weekday) {
  const labels = {
    Monday: "Montag",
    Tuesday: "Dienstag",
    Wednesday: "Mittwoch",
    Thursday: "Donnerstag",
    Friday: "Freitag",
    Saturday: "Samstag",
    Sunday: "Sonntag",
  };

  return labels[weekday] ?? weekday;
}
