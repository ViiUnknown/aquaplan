// A line chart drawn by hand with SVG (no chart library).

import { raw, escapeHtml, html } from '../utils/ui.js';
import { formatShortDate, formatNumber } from '../utils/format.js';

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 44 };
const GRID_STEPS = 4;

/**
 * @param {object} options
 * @param {string[]} options.dates        one date per x position
 * @param {Array}    options.series       [{ label, cls, dashed, points: [{ i, y }] }]
 * @param {Array}    options.thresholds   [{ y, label, cls }] horizontal reference lines
 * @param {number}   options.todayIndex   x position of the "today" marker
 * @param {string}   options.ariaLabel    description for screen readers
 */
export function lineChart({ dates, series, thresholds = [], todayIndex = null, ariaLabel = 'Chart' }) {
  const count = dates.length;
  if (count < 2) return html`<p class="muted">Not enough data to draw a chart yet.</p>`;

  const values = series.flatMap(s => s.points.map(p => p.y)).concat(thresholds.map(t => t.y));
  const yMax = niceMaximum(Math.max(1, ...values) * 1.1);
  const x = i => PAD.left + (i * (WIDTH - PAD.left - PAD.right)) / (count - 1);
  const y = v => HEIGHT - PAD.bottom - (v / yMax) * (HEIGHT - PAD.top - PAD.bottom);

  const svg = [
    ...gridLines(yMax, y),
    ...dateLabels(dates, x),
    ...todayMarker(todayIndex, count, x),
    ...thresholdLines(thresholds, y),
    ...dataLines(series, x, y),
  ].join('');

  const legend = series.filter(s => s.points.length).map(s => html`
    <span class="legend__item">
      <span class="legend__swatch ${s.cls ?? ''}${s.dashed ? ' legend__swatch--dashed' : ''}"></span>${s.label}
    </span>`);

  return html`
    <figure class="chart">
      ${raw(`<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(ariaLabel)}">${svg}</svg>`)}
      <figcaption class="legend">${legend}</figcaption>
    </figure>`;
}

/** Rounds the top of the axis up so each grid step is 1, 2, 2.5 or 5 × 10ⁿ. */
function niceMaximum(top) {
  const rawStep = top / GRID_STEPS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rawStep);
  return step * GRID_STEPS;
}

function gridLines(yMax, y) {
  const parts = [];
  for (let k = 0; k <= GRID_STEPS; k++) {
    const v = (yMax * k) / GRID_STEPS;
    parts.push(
      `<line class="chart__grid" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`,
      `<text class="chart__label" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${formatNumber(v, 1)}</text>`,
    );
  }
  return parts;
}

/** About 7 date labels along the bottom, always including the last day. */
function dateLabels(dates, x) {
  const every = Math.ceil(dates.length / 7);
  return dates
    .map((date, i) => ({ date, i }))
    .filter(({ i }) => i % every === 0 || i === dates.length - 1)
    .map(({ date, i }) => {
      const label = escapeHtml(formatShortDate(date).replace(/^\w+ /, ''));
      return `<text class="chart__label" x="${x(i)}" y="${HEIGHT - 10}" text-anchor="middle">${label}</text>`;
    });
}

function todayMarker(todayIndex, count, x) {
  if (todayIndex === null || todayIndex < 0 || todayIndex >= count) return [];
  const at = x(todayIndex);
  return [
    `<line class="chart__today" x1="${at}" x2="${at}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}"/>`,
    `<text class="chart__label chart__label--today" x="${at + 4}" y="${PAD.top + 10}">today</text>`,
  ];
}

// Threshold labels sit on the left, because "today" is usually near the right edge.
function thresholdLines(thresholds, y) {
  return thresholds.flatMap(t => [
    `<line class="chart__threshold ${t.cls ?? ''}" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y(t.y)}" y2="${y(t.y)}"/>`,
    `<text class="chart__label ${t.cls ?? ''}" x="${PAD.left + 4}" y="${y(t.y) - 4}">${escapeHtml(t.label)}</text>`,
  ]);
}

function dataLines(series, x, y) {
  return series.filter(s => s.points.length).flatMap(s => {
    const cls = s.cls ?? '';
    const path = s.points
      .map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.y).toFixed(1)}`)
      .join(' ');
    const dots = s.points.map(p =>
      `<circle class="chart__dot ${cls}" cx="${x(p.i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="2.5"/>`);
    return [`<path class="chart__line ${cls}${s.dashed ? ' chart__line--dashed' : ''}" d="${path}"/>`, ...dots];
  });
}
