// How it works: #/how-it-works – the calculation explained step by step in plain words.
// Numbers come from constants.js, so this page always matches the code.

import {
  CROPS, SOILS, RICE_DEFAULTS, UPLAND_RAIN_EFFICIENCY, MONITOR_FRACTION,
  RICE_MONITOR_MARGIN_MM, SKIP_LOOKAHEAD_DAYS, MAX_PAST_DAYS,
} from '../models/constants.js';
import { html, setHTML } from '../utils/ui.js';

const STEPS = [
  {
    title: 'Add your field',
    text: 'Choose the crop, the soil, the size and the planting date, then tap the field on the map.',
  },
  {
    title: 'Check the 7-day plan',
    text: 'AquaPlan reads the rain forecast and how fast the crop uses water, and tells you which days to water and how much.',
  },
  {
    title: 'Record your watering',
    text: 'Write down when you watered. The plan updates, and you can compare your usual amount with what was needed.',
  },
];

const pct = x => `${Math.round(x * 100)}%`;
const cm = mm => `${mm / 10} cm`;
const lower = s => s.toLowerCase();
const seasonDays = crop => crop.stages.reduce((a, b) => a + b, 0);
const rain80 = pct(UPLAND_RAIN_EFFICIENCY);

export async function renderHowItWorks({ container }) {
  setHTML(container, html`
    <section class="view how">
      <div class="page-head">
        <div>
          <h1>How it works</h1>
          <p class="meta">
            Every number AquaPlan uses, explained step by step. You only need adding, subtracting and multiplying.
          </p>
        </div>
      </div>

      <ol class="info-grid">
        ${STEPS.map((s, i) => html`
          <li class="card">
            <span class="step-number" aria-hidden="true">${i + 1}</span>
            <h2>${s.title}</h2>
            <p>${s.text}</p>
          </li>`)}
      </ol>

      <h2 class="how__title">Before we start</h2>
      ${waterAccountCard()}
      ${millimetreCard()}
      ${sourcesOfNumbersCard()}

      <h2 class="how__title">Part 1: How much water goes out each day</h2>
      ${weatherThirstStep()}
      ${cropNumberStep()}
      ${dailyUseStep()}

      <h2 class="how__title">Part 2: Keeping the water account</h2>
      <p>
        There are two kinds of account, because rice stands in water and the other crops don't.
        <strong>Step 4</strong> is for maize, soybean and cassava. <strong>Step 5</strong> is for paddy rice.
      </p>
      ${uplandStep()}
      ${riceStep()}

      <h2 class="how__title">Part 3: Turning the account into advice</h2>
      ${rainStep()}
      ${adviceStep()}
      ${unitsStep()}
      ${habitStep()}

      ${limitsCard()}
      ${referencesCard()}

      <div class="actions">
        <a class="btn btn--primary" href="#/dashboard">Try it: open the dashboard</a>
      </div>
    </section>`);
}

// ---------- building blocks ----------

const step = (number, question, body) => html`
  <section class="card calc-step" aria-labelledby="calc-${number}">
    <h3 id="calc-${number}"><span class="step-number" aria-hidden="true">${number}</span> ${question}</h3>
    ${body}
  </section>`;

const part = (title, body) => html`<div class="calc-part"><h4>${title}</h4>${body}</div>`;

const formula = text => html`<p class="formula">${text}</p>`;

const science = text => html`<p class="science">For developers: ${text}</p>`;

const exampleBox = (title, body) => html`
  <div class="calc-example">
    <p class="calc-example__title">${title ? `Example: ${title}` : 'Example'}</p>
    ${body}
  </div>`;

function table(head, rows) {
  const row = cells => html`
    <tr>${cells.map((cell, i) => (i === 0 ? html`<th scope="row">${cell}</th>` : html`<td>${cell}</td>`))}</tr>`;
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${head.map(h => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${rows.map(row)}</tbody>
      </table>
    </div>`;
}

// ---------- before we start ----------

function waterAccountCard() {
  return html`
    <section class="card">
      <h3>The idea: your field has a water account</h3>
      <p>Think of your field like a bank account, but for water.</p>
      <ul class="how__list">
        <li><strong>Water comes in</strong> when it rains and when you water the field.</li>
        <li>
          <strong>Water goes out</strong> because the crop drinks it every day.
          In a rice paddy, some water also leaks into the ground.
        </li>
      </ul>
      <p>
        AquaPlan adds up what comes in and takes away what goes out, <strong>one day at a time</strong>.
        That tells it how much water your field has today. Then it uses the weather forecast to do the same
        for the <strong>next 7 days</strong>. When the water is about to run too low, it says
        <strong>"Water today"</strong> and tells you how much.
      </p>
    </section>`;
}

function millimetreCard() {
  return html`
    <section class="card">
      <h3>One unit to know: the millimetre (mm) of water</h3>
      <p>
        We measure water like rain is measured: in <strong>millimetres</strong>. "10 mm of water" means that
        if the water stood on top of your field, it would be 10 mm (1 cm) deep everywhere.
      </p>
      ${table(['Amount', 'Means'], [
        ['1 mm on 1 square metre', '1 litre (a big water bottle)'],
        ['1 mm on 1 hectare (100 m × 100 m)', '10 m³ = 10,000 litres'],
        ['10 mm = 1 cm on 1 hectare', '100 m³ = 100,000 litres'],
      ])}
    </section>`;
}

function sourcesOfNumbersCard() {
  return html`
    <section class="card">
      <h3>Where the numbers come from</h3>
      ${table(['Source', 'What it gives us'], [
        ['You', 'Your crop, the planting date, the field size, the soil type, the location (tap on the map), '
          + 'your pump, the water you add, and for rice the water depth you measure with a ruler.'],
        ['The weather (Open-Meteo)', 'For your exact location: how much it rained each day, how much it will rain, '
          + 'and how "thirsty" the weather is (Step 1). Downloaded every time you open your field.'],
        ['Farming science (FAO-56)', 'How much water each crop drinks at each age, and how much water each soil can hold. '
          + 'From the international guide by the United Nations Food and Agriculture Organization (1998).'],
      ])}
    </section>`;
}

// ---------- part 1: water going out ----------

function weatherThirstStep() {
  return step(1, 'How thirsty is the weather today?', html`
    <p>
      Sun, heat, wind and dry air all pull water out of the ground and the plants. On a hot, sunny, windy day
      a lot of water disappears into the air. On a cloudy, cool, rainy day much less does.
    </p>
    <p>
      To compare days fairly, scientists measure this on a standard field of short, green grass. The answer is
      the <strong>"weather thirst"</strong> of the day: how many mm of water the weather would pull out of that
      grass in one day.
    </p>
    ${table(['Kind of day in Cambodia', 'Weather thirst'], [
      ['Cloudy and rainy', 'about 2–3 mm'],
      ['Normal', 'about 4 mm'],
      ['Hot, sunny and windy', 'about 5–7 mm'],
    ])}
    <p>
      We don't guess this number. Open-Meteo calculates it for your field's location every day, from the
      temperature, sunshine, wind and humidity.
    </p>
    ${science('the "weather thirst" is the reference evapotranspiration ET₀ (FAO-56 Penman-Monteith), '
      + 'Open-Meteo field et0_fao_evapotranspiration.')}
  `);
}

function cropNumberStep() {
  const maize = CROPS.maize;
  const [startDays, growingDays] = maize.stages;
  const cropRows = Object.values(CROPS).map(c => [
    c.label, c.kcIni.toFixed(2), c.kcMid.toFixed(2), c.kcEnd.toFixed(2), c.stages.join(' + '), `${seasonDays(c)} days`,
  ]);

  return step(2, 'How thirsty is your crop compared with grass?', html`
    <p>
      Your crop is not short grass. A big, leafy maize plant drinks more than grass; a small seedling drinks less.
      So each crop gets a <strong>"crop number"</strong> that says how thirsty it is compared with grass:
    </p>
    ${table(['Crop number', 'Means'], [
      ['1.0', 'drinks the same as grass'],
      ['1.2', 'drinks 20% more than grass'],
      ['0.3', 'drinks only 30% of what grass drinks'],
    ])}
    ${part('The crop number changes as the crop grows', html`
      <p>A crop's life has 4 stages:</p>
      <ol class="how__list">
        <li><strong>Start</strong> – small young plants. Low number, it stays the same.</li>
        <li><strong>Growing</strong> – the plants get bigger every day. The number goes up a little each day.</li>
        <li><strong>Middle</strong> – flowering and filling the grain or roots. The <strong>thirstiest</strong> time, the highest number.</li>
        <li><strong>End</strong> – ripening. The number goes down again until harvest.</li>
      </ol>
      <p>AquaPlan counts the <strong>days since you planted</strong> to know which stage your crop is in:</p>
      ${table(
        ['Crop', 'Start', 'Middle (thirstiest)', 'End', 'Days in each stage (start + growing + middle + end)', 'Whole season'],
        cropRows,
      )}
      <p>After the last day of the season the crop is finished, and AquaPlan shows <strong>"Season over"</strong>.</p>
    `)}
    ${exampleBox('maize, 37 days after planting', html`
      <ul class="how__list">
        <li>
          Maize is in the "start" stage for ${startDays} days, then "growing" for ${growingDays} days
          (day ${startDays} to day ${startDays + growingDays}).
        </li>
        <li>
          Day 37 is 17 days into the ${growingDays} growing days, so the number has gone about halfway up,
          from ${maize.kcIni} to ${maize.kcMid}.
        </li>
        <li>Exactly: ${maize.kcIni} + (17 ÷ ${growingDays}) × (${maize.kcMid} − ${maize.kcIni}) = <strong>0.74</strong>.</li>
      </ul>`)}
    ${science('the crop number is the crop coefficient Kc (FAO-56 Tables 11–12), with linear change in the '
      + 'development and late stages (js/models/kc.js).')}
  `);
}

function dailyUseStep() {
  return step(3, 'How much water does your crop use today?', html`
    <p>Now we put Step 1 and Step 2 together:</p>
    ${formula('Water the crop uses today = weather thirst × crop number')}
    ${exampleBox('a hot day in the middle stage', html`
      <ul class="how__list">
        <li>Weather thirst = 5 mm, crop number = 1.2.</li>
        <li>Water used today = 5 × 1.2 = <strong>6 mm</strong>.</li>
        <li>On 1 hectare that is 6 × 10 = 60 m³, which is <strong>60,000 litres in one day</strong>.</li>
      </ul>`)}
    ${science('crop water use ETc = Kc × ET₀ (FAO-56 equation 56).')}
  `);
}

// ---------- part 2: the water account ----------

function uplandStep() {
  const maize = CROPS.maize;
  const loam = SOILS.loam.awcMmPerM;
  const sponge = loam * maize.rootDepthM;
  const waterLine = maize.p * sponge;
  const checkLine = +(MONITOR_FRACTION * waterLine).toFixed(1);
  const uplandCrops = Object.values(CROPS).filter(c => c.rootDepthM);

  return step(4, 'Maize, soybean, cassava: how full is the soil "sponge"?', html`
    <p>
      For these crops the water is stored <strong>inside the soil</strong>, like water in a sponge. The roots
      drink from it. When the sponge gets too dry, the plants suffer. So AquaPlan keeps track of
      <strong>how much water is missing</strong> from a full sponge.
    </p>

    ${part('4a. How big is the sponge?', html`
      <p>It depends on two things:</p>
      <ul class="how__list">
        <li>
          <strong>The soil type.</strong> Sand lets water run through; clay holds a lot.
          Here is how much water 1 metre of each soil can hold for plants:
        </li>
      </ul>
      ${table(['Soil', 'Water it holds per metre of soil'], Object.values(SOILS).map(s => [s.label, `${s.awcMmPerM} mm`]))}
      <ul class="how__list">
        <li>
          <strong>How deep the roots go.</strong> Roots can only drink from the soil they reach:
          ${uplandCrops.map(c => `${lower(c.label)} ${c.rootDepthM} m`).join(', ')}.
        </li>
      </ul>
      ${formula('Size of the sponge = water the soil holds per metre × root depth')}
    `)}

    ${part('4b. When is it time to water?', html`
      <p>
        A crop can use part of the sponge without problems. If more is missing, the plant starts to wilt and
        grows less. Each crop has a <strong>"safe share"</strong>:
        ${uplandCrops.map(c => `${lower(c.label)} ${pct(c.p)}`).join(', ')}.
      </p>
      ${formula('"Water now" line = safe share × size of the sponge')}
      <p>
        When this much water is missing, AquaPlan says <strong>"Water today"</strong>. A little earlier, at
        <strong>${pct(MONITOR_FRACTION)}</strong> of that line, it warns <strong>"Check your field"</strong>.
      </p>
    `)}

    ${part('4c. Updating the account every day', html`
      ${formula(`Missing today = missing yesterday + water the crop used − ${rain80} of the rain − water you added`)}
      <ul class="how__list">
        <li><strong>Why only ${rain80} of the rain?</strong> Some rain runs off the surface or dries up before it soaks in.</li>
        <li><strong>It can't go below 0.</strong> 0 means the sponge is full; extra water just drains away deeper.</li>
        <li><strong>It can't go above the size of the sponge</strong> (then the sponge is completely dry).</li>
        <li>
          <strong>Where it starts:</strong> on the planting day, with a full sponge (we assume the soil was wet
          when you planted). If you planted more than ${MAX_PAST_DAYS} days ago, it starts ${MAX_PAST_DAYS} days ago, also full.
        </li>
      </ul>
    `)}

    ${exampleBox('maize on loam soil, middle stage, using 6 mm a day', html`
      <ul class="how__list">
        <li>Sponge: ${loam} mm per metre × ${maize.rootDepthM} m roots = <strong>${sponge} mm</strong>.</li>
        <li>
          "Water now" line: ${pct(maize.p)} of ${sponge} = <strong>${waterLine} mm missing</strong>.
          "Check your field" from ${checkLine} mm missing.
        </li>
      </ul>
      ${table(['Day', 'Missing at the start', 'Crop used', 'Rain (counted)', 'Missing at the end', 'Advice'], [
        ['Yesterday', '74 mm', '6 mm', '0', '80 mm', `Check your field (above ${checkLine})`],
        ['Today', '80 mm', '6 mm', '0', '86 mm', `Check your field (not yet ${waterLine})`],
        ['Tomorrow', '86 mm', '6 mm', '0', '92 mm', `Water today: add 92 mm (above ${waterLine})`],
      ])}
      <p>92 mm on a 0.8-hectare field = 92 × 0.8 × 10 = <strong>736 m³</strong> of water.</p>`)}
    ${science('missing water = root-zone depletion D; sponge size = total available water TAW = AWC × Zr; '
      + '"water now" line = readily available water RAW = p × TAW (FAO-56 chapter 8); js/models/upland.js.')}
  `);
}

function riceStep() {
  const rice = RICE_DEFAULTS;
  const margin = cm(RICE_MONITOR_MARGIN_MM);

  return step(5, 'Paddy rice: how deep is the water in the paddy?', html`
    <p>
      A rice paddy stands under water, so we simply follow the <strong>depth of the water</strong>.
      You can check it yourself with a ruler.
    </p>

    ${part('5a. Where it starts: your ruler', html`
      <p>
        We can't guess how much water is in a paddy, so the account starts from your
        <strong>latest ruler reading</strong> ("How deep is the water today?" on the field page).
        Measure every few days and after heavy rain, and the plan stays accurate.
      </p>
    `)}

    ${part('5b. What makes the water go up and down', html`
      ${formula('Depth today = depth yesterday + rain + water you added − water the crop used − leaking')}
      <ul class="how__list">
        <li><strong>Rain:</strong> all of it counts, because it falls straight into the water.</li>
        <li>
          <strong>Leaking:</strong> every day some water soaks down into the ground or escapes through the walls:
          about <strong>${rice.seepageMmDay} mm a day</strong> by default (you can set 2 to 6 mm).
          It only leaks while there is water standing.
        </li>
        <li>
          <strong>The field wall:</strong> the little earth wall around the paddy is ${cm(rice.bundMm)} high by default.
          Water above it flows away, so the depth can never be higher. (That's also why the forms won't accept
          more water than the wall can hold.)
        </li>
        <li><strong>It can't go below 0</strong> (the paddy is dry).</li>
      </ul>
    `)}

    ${part('5c. Two levels you choose', html`
      ${table(['Level', 'Default', 'Means'], [
        ['"Add water at"', cm(rice.refillMm),
          'When the water falls to this depth, AquaPlan says "Water today". 0 cm = the water has just disappeared from the surface.'],
        ['"Fill to"', cm(rice.targetMm), 'How deep to fill the paddy when you water.'],
      ])}
      ${formula('Water to add = "fill to" level − depth now')}
      <p>
        When the water is within <strong>${margin}</strong> of the "add water at" level, AquaPlan warns
        <strong>"Check your field"</strong>.
      </p>
    `)}

    ${exampleBox('you measured 3 cm this morning; the crop uses 5.4 mm a day; no rain', html`
      ${table(['Day', 'Water at the start', 'Crop used', 'Leaking', 'Water at the end', 'Advice'], [
        ['Today', '30 mm (3 cm)', '5.4 mm', '4 mm', '20.6 mm', 'No water needed'],
        ['Day 2', '20.6 mm', '5.4 mm', '4 mm', '11.2 mm', 'No water needed'],
        ['Day 3', '11.2 mm', '5.4 mm', '4 mm', '1.8 mm', `Check your field (within ${margin} of 0)`],
        ['Day 4', '1.8 mm', '5.4 mm', '4 mm', '0 mm (can’t go lower)',
          `Water today: add ${cm(rice.targetMm)} − 0 = ${cm(rice.targetMm)}`],
      ])}`)}
    ${science('depth d with seepage + percolation S, capped by the bund height (js/models/rice.js).')}
  `);
}

// ---------- part 3: advice ----------

function rainStep() {
  return step(6, 'Is rain coming? Then wait.', html`
    <p>
      Before saying "Water today", AquaPlan looks at the rain forecast for the <strong>next ${SKIP_LOOKAHEAD_DAYS} days</strong>.
      If that rain will bring at least the water your field needs, there is no point pumping water today:
      the rain will do it for free.
    </p>
    ${formula('If the rain of the next 2 days ≥ the water your field needs → "Wait for the rain"')}
    <p>For maize, soybean and cassava we count ${rain80} of that rain (like in Step 4); for rice, all of it.</p>
    ${exampleBox('', html`
      <p>
        Your rice paddy needs 5 cm (50 mm) today, and the forecast says 30 mm tomorrow and 25 mm the day after.
        30 + 25 = 55 mm, more than 50 mm → <strong>"Wait for the rain"</strong>. You save the fuel.
      </p>`)}
  `);
}

function adviceStep() {
  const badge = (cls, text) => html`<span class="badge badge--${cls}">${text}</span>`;
  return step(7, 'The advice for each of the next 7 days', html`
    <p>
      First AquaPlan replays the <strong>past days</strong> with the real weather and the water you recorded,
      to know how much water your field has today. Then it goes through the <strong>next 7 days</strong> with
      the forecast and gives each day one advice:
    </p>
    ${table(['Advice', 'When'], [
      [badge('irrigate', 'Water today'),
        `The field reaches the "water now" / "add water at" line, and the rain of the next ${SKIP_LOOKAHEAD_DAYS} days is not enough.`],
      [badge('skip', 'Wait for the rain'), 'The field needs water, but the rain coming soon is enough (Step 6).'],
      [badge('monitor', 'Check your field'), 'Getting close to the line, but not there yet.'],
      [badge('ok', 'No water needed'), 'There is enough water.'],
      [badge('muted', 'Season over'), 'The crop has finished its season.'],
    ])}
    <p>
      <strong>One important rule:</strong> after a "Water today" day, AquaPlan <strong>assumes you followed the advice</strong>,
      so the next days start from a full field. If it didn't, every day after the first would also say "Water today".
      On the chart this is the jump in the dashed line.
    </p>
  `);
}

function unitsStep() {
  return step(8, 'How much to add, in units you can use', html`
    <p>Inside AquaPlan everything is in mm. On the screen we change it into units you can measure:</p>
    ${table(['From → to', 'How', 'Example'], [
      ['mm → cm', 'divide by 10', '50 mm = 5 cm'],
      ['mm → m³ on your field', 'mm × hectares × 10', '50 mm on 1.5 ha = 750 m³'],
      ['m³ → hours of pumping', 'm³ ÷ your pump flow (m³ per hour)', '750 m³ ÷ 60 = 12.5 hours = 12 h 30 min'],
    ])}
    ${part("Don't know your pump flow? Do the drum test", html`
      <p>Time how many seconds your pump needs to fill a 200-litre drum. Then:</p>
      ${formula('Pump flow (m³ per hour) = 720 ÷ seconds')}
      <p>
        Example: 24 seconds → 720 ÷ 24 = <strong>30 m³ per hour</strong>.
        (720 comes from 0.2 m³ × 3600 seconds in an hour.)
      </p>
    `)}
    <p>
      Pumping time is rounded to 5 minutes. Rice is shown in <strong>cm</strong> because you can check it with a ruler.
      For the other crops we show <strong>hours of pumping</strong>, because water that soaks into the soil leaves
      no level to measure.
    </p>
  `);
}

function habitStep() {
  return step(9, 'Do you use more water than you need?', html`
    ${part('Your habit vs AquaPlan', html`
      ${formula('Your usual water per week = usual amount × 7 ÷ days between waterings')}
      <p>
        AquaPlan adds up all its "Water today" amounts for the next 7 days. The difference is the water,
        and pump fuel, you could save.
      </p>
      ${exampleBox('', html`
        <p>
          You usually give 5 cm every 4 days: 50 × 7 ÷ 4 = <strong>87.5 mm a week</strong>. If AquaPlan only
          needs 50 mm this week, you could save 37.5 mm, which is <strong>375 m³ on 1 hectare</strong>.
        </p>`)}
    `)}
    ${part('Each watering you record', html`
      <p>
        When you record a watering, AquaPlan saves what it advised for that day: the "Water today" amount, or
        <strong>0</strong> if that day's advice was "No water needed", "Check your field" or "Wait for the rain".
        (It is saved at that moment because forecasts change later.) Then it compares:
      </p>
      ${table(['What you added', 'Shown as'], [
        ['Within 10% of the advice', 'About right'],
        ['More than 10% above (or any water on a day the advice was 0)', 'Too much'],
        ['More than 10% below', 'Too little'],
      ])}
    `)}
  `);
}

// ---------- limits and sources ----------

function limitsCard() {
  return html`
    <section class="card">
      <h2>What AquaPlan can't know</h2>
      <ul class="how__list">
        <li>The crop and soil numbers are averages from the FAO-56 guide, not measured on your own farm.</li>
        <li>Weather forecasts can be wrong, so the plan is calculated again every time you open your field.</li>
        <li>For maize, soybean and cassava we assume the soil was wet when you planted.</li>
        <li>Rice advice is only as good as your latest ruler reading.</li>
        <li>Pumping hours are only as good as the pump flow you entered.</li>
      </ul>
    </section>`;
}

function referencesCard() {
  return html`
    <section class="card">
      <h2>Sources</h2>
      <ul class="how__list">
        <li>
          Allen, R. G., Pereira, L. S., Raes, D., &amp; Smith, M. (1998).
          <em>Crop evapotranspiration: Guidelines for computing crop water requirements</em>
          (FAO Irrigation and Drainage Paper 56). FAO.
          <a href="https://www.fao.org/4/x0490e/x0490e00.htm" target="_blank" rel="noopener">fao.org</a>
        </li>
        <li>
          Open-Meteo. Weather Forecast API: daily rain and reference evapotranspiration (ET₀).
          <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">open-meteo.com</a>
        </li>
      </ul>
    </section>`;
}
