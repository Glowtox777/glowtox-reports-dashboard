export function renderMetricCards(target, cards) {
  target.innerHTML = cards
    .map(
      (card) => `
        <article class="metricCard">
          <div class="metricLabel">${card.label}</div>
          <div class="metricValue">${card.value}</div>
          <div class="metricHint">${card.hint ?? ""}</div>
        </article>
      `,
    )
    .join("");
}
