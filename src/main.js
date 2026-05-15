import { renderDailyBarChart } from "./components/DailyBarChart.js";
import { renderReportTable } from "./components/ReportTable.js";
import {
  getAvailableCompletedMonths,
  getBookingsReport,
  getCompletedReport,
  getDefaultFilters,
  getPlannedReport,
} from "./lib/reports/reportService.js";
import { REPORT_TARGETS } from "./lib/reports/reportTypes.js";

const filters = getDefaultFilters();

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

document.querySelector("#bookingsStart").value = filters.bookings.startDate;
document.querySelector("#bookingsEnd").value = filters.bookings.endDate;
document.querySelector("#weekdayFilter").value = filters.bookings.weekday;
document.querySelector("#plannedStart").value = filters.planned.startDate;
document.querySelector("#plannedEnd").value = filters.planned.endDate;
document.querySelector("#completedStart").value = filters.completed.startDate;
document.querySelector("#completedEnd").value = filters.completed.endDate;

const monthSelect = document.querySelector("#completedMonth");
monthSelect.innerHTML = getAvailableCompletedMonths()
  .map((month) => `<option value="${month}">${month}</option>`)
  .join("");
monthSelect.value = filters.completed.month;

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".report").forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("is-active");
  });
});

bindFilter("#bookingsStart", (value) => {
  filters.bookings.startDate = value;
  renderBookings();
});
bindFilter("#bookingsEnd", (value) => {
  filters.bookings.endDate = value;
  renderBookings();
});
bindFilter("#weekdayFilter", (value) => {
  filters.bookings.weekday = value;
  renderBookings();
});
bindFilter("#plannedStart", (value) => {
  filters.planned.startDate = value;
  renderPlanned();
});
bindFilter("#plannedEnd", (value) => {
  filters.planned.endDate = value;
  renderPlanned();
});
bindFilter("#completedMonth", (value) => {
  filters.completed.month = value;
  filters.completed.startDate = `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
  document.querySelector("#completedStart").value = filters.completed.startDate;
  renderCompleted();
});
bindFilter("#completedStart", (value) => {
  filters.completed.startDate = value;
  renderCompleted();
});
bindFilter("#completedEnd", (value) => {
  filters.completed.endDate = value;
  renderCompleted();
});

renderAll();

function renderAll() {
  elements.globalHeartbeat.textContent = `Letzte Aktualisierung: ${new Date().toLocaleString("de-DE")}`;
  renderBookings();
  renderPlanned();
  renderCompleted();
}

function renderBookings() {
  const report = getBookingsReport(filters.bookings);
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

function renderPlanned() {
  const report = getPlannedReport(filters.planned);
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

function renderCompleted() {
  const report = getCompletedReport(filters.completed);
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
