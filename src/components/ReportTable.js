export function renderReportTable(target, columns, rows, totals) {
  target.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${columns.map((column) => `<td class="${cellClass(row[column.key])}">${formatCell(row[column.key])}</td>`).join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            ${columns.map((column) => `<td class="${cellClass(totals[column.key])}">${formatCell(totals[column.key])}</td>`).join("")}
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function formatCell(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("de-DE").format(value);
  }

  return value;
}

function cellClass(value) {
  if (typeof value !== "number") {
    return "";
  }

  if (value < 0) {
    return "negative";
  }

  if (value > 0) {
    return "positive";
  }

  return "";
}
