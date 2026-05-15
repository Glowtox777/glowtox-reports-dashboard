import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDefaultFilters,
  getReportsSummary,
} from "./src/lib/reports/reportService.js";
import {
  getAppointmentDiagnostics,
  isRealReportDataEnabled,
} from "./src/lib/reports/appointmentReadOnlyRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT ?? 4173);

app.disable("x-powered-by");

// API routes are intentionally registered before static assets and the HTML fallback.
const apiRouter = express.Router();

apiRouter.get("/reports/summary", async (request, response, next) => {
  try {
    const filters = filtersFromQuery(request.query);
    const summary = await getReportsSummary(filters);
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/diagnostics", async (_request, response) => {
  const diagnostics = {
    runtime: "node-express",
    useRealReportData: isRealReportDataEnabled(),
    env: {
      COSMOS_ENDPOINT_SET: Boolean(process.env.COSMOS_ENDPOINT),
      COSMOS_KEY_SET: Boolean(process.env.COSMOS_KEY),
      COSMOS_DATABASE_ID: process.env.COSMOS_DATABASE_ID || null,
      COSMOS_APPOINTMENTS_CONTAINER_ID: process.env.COSMOS_APPOINTMENTS_CONTAINER_ID || null,
    },
    cosmos: {
      status: "mock-disabled",
      count: null,
      sample: [],
      error: null,
    },
  };

  if (isRealReportDataEnabled()) {
    try {
      const appointmentDiagnostics = await getAppointmentDiagnostics();
      diagnostics.cosmos = {
        status: "ok",
        count: appointmentDiagnostics.count,
        sample: appointmentDiagnostics.sample,
        error: null,
      };
    } catch (error) {
      diagnostics.cosmos = {
        status: "error",
        count: null,
        sample: [],
        error: safeErrorMessage(error),
      };
    }
  }

  response.json(diagnostics);
});

apiRouter.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.use("/api", apiRouter);

app.get("/", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get("/styles.css", (_request, response) => {
  response.sendFile(path.join(__dirname, "styles.css"));
});

app.use("/src", express.static(path.join(__dirname, "src"), {
  dotfiles: "deny",
  index: false,
}));

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "Not found" });
    return;
  }

  response.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _request, response, _next) => {
  console.error("Request failed:", sanitizeError(error));
  response.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Reports dashboard listening on 0.0.0.0:${port}`);
  console.log(`USE_REAL_REPORT_DATA=${isRealReportDataEnabled() ? "true" : "false"}`);
});

function filtersFromQuery(query) {
  const defaults = getDefaultFilters();
  const completedMonth = stringOrDefault(query.completedMonth, defaults.completed.month);
  const completedStart = stringOrDefault(
    query.completedStart,
    `${completedMonth.slice(0, 4)}-${completedMonth.slice(4, 6)}-01`,
  );

  return {
    bookings: {
      startDate: stringOrDefault(query.bookingsStart, defaults.bookings.startDate),
      endDate: stringOrDefault(query.bookingsEnd, defaults.bookings.endDate),
      weekday: stringOrDefault(query.weekday, defaults.bookings.weekday),
    },
    planned: {
      startDate: stringOrDefault(query.plannedStart, defaults.planned.startDate),
      endDate: stringOrDefault(query.plannedEnd, defaults.planned.endDate),
    },
    completed: {
      month: completedMonth,
      startDate: completedStart,
      endDate: stringOrDefault(query.completedEnd, defaults.completed.endDate),
    },
  };
}

function stringOrDefault(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value;
}

function sanitizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: safeErrorMessage(error),
  };
}

function safeErrorMessage(error) {
  return error?.message ?? "Unknown error";
}
