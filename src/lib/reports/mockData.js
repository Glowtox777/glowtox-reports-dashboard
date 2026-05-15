import { WEEKDAYS } from "./reportTypes.js";

const TODAY = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;
const START_DATE = new Date("2024-01-01T08:00:00");
const STATES = ["accepted", "accepted", "accepted", "cancelled", "rejected"];

export const mockAppointments = buildMockAppointments();

function buildMockAppointments() {
  const appointments = [];
  let id = 1;

  for (let cursor = new Date(START_DATE); cursor <= addDays(TODAY, 30); cursor = addDays(cursor, 1)) {
    const dayIndex = daysBetween(START_DATE, cursor);
    const startsPerDay = 18 + ((dayIndex * 7) % 38) + (isWeekend(cursor) ? -7 : 0);
    const safeStartsPerDay = Math.max(4, startsPerDay);

    for (let slot = 0; slot < safeStartsPerDay; slot += 1) {
      const startsAt = withTime(cursor, 8 + (slot % 10), (slot * 11) % 60);
      const leadDays = 2 + ((slot * 3 + dayIndex) % 24);
      const createdAt = withTime(addDays(cursor, -leadDays), 9 + (slot % 8), (slot * 17) % 60);
      const state = STATES[(slot + dayIndex) % STATES.length];
      const isOnlyAftercare = (slot + dayIndex) % 17 === 0;
      const noShow = startsAt <= TODAY && state === "accepted" && (slot + dayIndex) % 19 === 0;

      appointments.push({
        id: `apt_${id}`,
        created_at: createdAt.toISOString(),
        created_at_weekday: WEEKDAYS[(createdAt.getDay() + 6) % 7],
        starts_at: startsAt.toISOString(),
        starts_at_monthonly: toMonthKey(startsAt),
        state,
        isOnlyAftercare,
        no_show: noShow,
        number_of_appointments: 1,
        customer_id: `cust_${String(((slot + dayIndex) % 420) + 1).padStart(4, "0")}`,
        // TODO: Map exact treatment/service/category field from Cosmos DB to exclude pure "Nachsorge" or "Nachkontrolle" bookings.
      });
      id += 1;
    }
  }

  return appointments;
}

export function toDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function toMonthKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.round((stripTime(end) - stripTime(start)) / DAY_MS);
}

function stripTime(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function withTime(value, hour, minute) {
  const next = new Date(value);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function isWeekend(value) {
  return value.getDay() === 0 || value.getDay() === 6;
}
