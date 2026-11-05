// Simple responsive line chart drawn with SVG (no chart library needed).

import { raw, escapeHtml, html } from '../utils/ui.js';
import { formatShortDate, formatNumber } from '../utils/format.js';

const W = 640;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 44 };

/**
 * @param {object} options
 * @param {string[]} options.dates        x-axis dates (one per point index)
 * @param {Array}    options.series       [{ label, cls, dashed, points: [{ i, y }] }]
 * @param {Array}    options.thresholds   [{ y, label, cls }] horizontal reference lines
 * @param {number}   options.todayIndex   index of today (vertical marker)
 * @param {string}   options.ariaLabel    description for screen readers
 */
export function lineChart({ dates, series, thresholds = [], todayIndex = null, ariaLabel = 'Chart' }) {
  const n = dates.length;
  if (n < 2) return html`<p class="muted">Not enough data to draw a chart yet.</p>`;

  const values = series.flatMap(s => s.points.map(p => p.y)).concat(thresholds.map(t => t.y));
  // Round the top of the axis up so the 4 grid steps are clean numbers (1, 2, 2.5, 5 × 10ⁿ).
  const rawStep = (Math.max(1, ...values) * 1.1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const yStep = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rawStep);
  const yMax = yStep * 4;
  const x = i => PAD.left + (i * (W - PAD.left - PAD.right)) / (n - 1);
  const y = v => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);

  const parts = [];

  // Horizontal grid + y labels
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    parts.push(`<line class="chart__grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="chart__label" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${formatNumber(v, 1)}</text>`);
  }

  // X labels (about 7 of them)
  const step = Math.ceil(n / 7);
  dates.forEach((date, i) => {
    if (i % step === 0 || i === n - 1) {
      parts.push(`<text class="chart__label" x="${x(i)}" y="${H - 10}" text-anchor="middle">${escapeHtml(formatShortDate(date).replace(/^\w+ /, ''))}</text>`);
    }
  });

  // Today marker
  if (todayIndex !== null && todayIndex >= 0 && todayIndex < n) {
    parts.push(`<line class="chart__today" x1="${x(todayIndex)}" x2="${x(todayIndex)}" y1="${PAD.top}" y2="${H - PAD.bottom}"/>`);
    parts.push(`<text class="chart__label chart__label--today" x="${x(todayIndex) + 4}" y="${PAD.top + 10}">today</text>`);
  }

  // Threshold lines
  for (const t of thresholds) {
    parts.push(`<line class="chart__threshold ${t.cls ?? ''}" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(t.y)}" y2="${y(t.y)}"/>`);
    // Labels sit on the left; "today" is usually near the right edge.
    parts.push(`<text class="chart__label ${t.cls ?? ''}" x="${PAD.left + 4}" y="${y(t.y) - 4}">${escapeHtml(t.label)}</text>`);
  }

  // Data lines
  for (const s of series) {
    if (s.points.length === 0) continue;
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path class="chart__line ${s.cls ?? ''}${s.dashed ? ' chart__line--dashed' : ''}" d="${d}"/>`);
    for (const p of s.points) {
      parts.push(`<circle class="chart__dot ${s.cls ?? ''}" cx="${x(p.i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="2.5"/>`);
    }
  }

  const legend = series
    .filter(s => s.points.length)
    .map(s => html`<span class="legend__item"><span class="legend__swatch ${s.cls ?? ''}${s.dashed ? ' legend__swatch--dashed' : ''}"></span>${s.label}</span>`);

  return html`
    <figure class="chart">
      ${raw(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${parts.join('')}</svg>`)}
      <figcaption class="legend">${legend}</figcaption>
    </figure>`;
}
