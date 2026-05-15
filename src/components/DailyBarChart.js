export function renderDailyBarChart(target, rows, options = {}) {
  const maxValue = Math.max(
    1,
    ...rows.map((row) => row.count),
    ...(options.targets ?? []).map((targetConfig) => targetConfig.value),
  );
  const firstLabel = rows[0]?.label ?? "";
  const middleLabel = rows[Math.floor(rows.length / 2)]?.label ?? "";
  const lastLabel = rows[rows.length - 1]?.label ?? "";

  target.innerHTML = `
    <div class="chartFrame ${options.size ?? ""}" role="img" aria-label="${options.label ?? "Tageswerte"}">
      <div class="yAxis">Anzahl Termine</div>
      <div class="plotScroll">
        <div class="plot" style="width:${Math.max(100, rows.length * 10)}px">
          ${(options.targets ?? [])
            .map((targetConfig) => {
              const bottom = Math.min(100, Math.round((targetConfig.value / maxValue) * 100));
              return `<span class="targetLine ${targetConfig.variant ?? ""}" style="bottom:${bottom}%" title="${targetConfig.label}: ${targetConfig.value}"></span>`;
            })
            .join("")}
          ${rows
            .map((row) => {
              const height = Math.max(row.count === 0 ? 0 : 1, Math.round((row.count / maxValue) * 100));

              return `
                <span class="plotBar ${options.variant ?? ""}" style="height:${height}%" title="${row.date}: ${row.count}">
                  <span class="plotValue">${row.count}</span>
                </span>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="xAxis">
        <span>${firstLabel}</span>
        <span>${middleLabel}</span>
        <span>${lastLabel}</span>
      </div>
      <div class="chartLegend">
        ${(options.targets ?? [])
          .map((targetConfig) => `<span>${targetConfig.label}: ${targetConfig.value}</span>`)
          .join("")}
      </div>
    </div>
  `;
}
