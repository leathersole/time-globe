'use strict';

/* ------------------------------------------------------------------ *
 * Solar position (NOAA / Meeus low-precision solar coordinates).
 * Used to draw the day/night terminator on the map.
 * ------------------------------------------------------------------ */
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

function century(date) {
  return (date.getTime() - J2000) / 3155760000000; // Julian centuries since J2000.0
}
function meanLongitude(t) {
  const l = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  return l < 0 ? l + 360 : l;
}
function meanAnomaly(t) {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}
function orbitEccentricity(t) {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}
function obliquityOfEcliptic(t) {
  const e0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const omega = 125.04 - 1934.136 * t;
  return e0 + 0.00256 * Math.cos(rad(omega));
}
function equationOfCenter(t) {
  const m = rad(meanAnomaly(t));
  return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * m) * 0.000289;
}
function trueLongitude(t) {
  return meanLongitude(t) + equationOfCenter(t);
}
function apparentLongitude(t) {
  return trueLongitude(t) - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * t));
}
function equationOfTimeMinutes(t) {
  const epsilon = obliquityOfEcliptic(t);
  const l0 = meanLongitude(t);
  const e = orbitEccentricity(t);
  const m = meanAnomaly(t);
  const y = Math.pow(Math.tan(rad(epsilon) / 2), 2);
  const sin2l0 = Math.sin(2 * rad(l0));
  const sinm = Math.sin(rad(m));
  const cos2l0 = Math.cos(2 * rad(l0));
  const sin4l0 = Math.sin(4 * rad(l0));
  const sin2m = Math.sin(2 * rad(m));
  const etime = y * sin2l0 - 2 * e * sinm + 4 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m;
  return deg(etime) * 4;
}
function solarDeclination(t) {
  return deg(Math.asin(Math.sin(rad(obliquityOfEcliptic(t))) * Math.sin(rad(apparentLongitude(t)))));
}

// Returns the subsolar point { lon, lat } (degrees) for a given instant.
function sunPosition(date) {
  const t = century(date);
  const eot = equationOfTimeMinutes(t); // minutes
  const lat = solarDeclination(t);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let lon = (720 - utcMinutes - eot) / 4;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return { lon, lat };
}

/* ------------------------------------------------------------------ *
 * Time zone helpers (native Intl — handles DST automatically).
 * ------------------------------------------------------------------ */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');

const zonedFormatterCache = new Map();
function zonedFormatter(tz) {
  let f = zonedFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
    zonedFormatterCache.set(tz, f);
  }
  return f;
}

function getZonedTime(date, tz) {
  const parts = {};
  for (const p of zonedFormatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour, minute: +parts.minute,
    weekday: parts.weekday,
  };
}

function getUtcOffsetMinutes(date, tz) {
  const z = getZonedTime(date, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function formatOffsetLabel(mins) {
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + pad(m) : ''}`;
}

function dayDiffLabel(date, tz, localTz) {
  const a = getZonedTime(date, tz);
  const b = getZonedTime(date, localTz);
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  const diff = Math.round((da - db) / 86400000);
  if (diff === 0) return null;
  return diff > 0 ? `+${diff}d` : `${diff}d`;
}

/* ------------------------------------------------------------------ *
 * City lookup helpers
 * ------------------------------------------------------------------ */
const cityKey = c => `${c.name}|${c.country}`;
const cityByKey = new Map(CITIES.map(c => [cityKey(c), c]));
const findCityByKey = key => cityByKey.get(key);

function findNearestCity(lon, lat) {
  let best = null, bestD = Infinity;
  const cosLat = Math.cos(rad(lat));
  for (const c of CITIES) {
    const dLat = c.lat - lat;
    let dLon = c.lon - lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    dLon *= cosLat;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Application state
 * ------------------------------------------------------------------ */
const STORAGE_KEY = 'timeglobe.clocks';
let activeKeys = loadSaved() || defaultCities();

// While `manualBase` is null the app shows the real live time. Once the user
// scrolls, time freezes at `manualBase` (rounded to a clean 10-minute mark)
// plus `offsetMinutes`, so every wheel step lands on a round value (:00, :10, ...).
let manualBase = null;
let offsetMinutes = 0;
let wheelAccum = 0;
const WHEEL_UNIT_MIN = 10;
const WHEEL_THRESHOLD = 100;

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw).filter(k => cityByKey.has(k));
    return arr.length ? arr : null;
  } catch (e) { return null; }
}

function defaultCities() {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const keys = [];
  const localMatch = CITIES.find(c => c.tz === localTz);
  if (localMatch) keys.push(cityKey(localMatch));
  for (const name of ['Tokyo', 'London', 'New York']) {
    const c = CITIES.find(c => c.name === name);
    if (c && !keys.includes(cityKey(c))) keys.push(cityKey(c));
  }
  return keys;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activeKeys));
}

function currentVirtualTime() {
  if (manualBase) return new Date(manualBase.getTime() + offsetMinutes * 60000);
  return new Date();
}

function addCity(city) {
  const key = cityKey(city);
  if (activeKeys.includes(key)) { flashCard(key); return; }
  activeKeys.push(key);
  persist();
  rebuildClocks();
  rebuildSettingsList();
  updateMapSelection();
}

function removeCity(key) {
  activeKeys = activeKeys.filter(k => k !== key);
  persist();
  rebuildClocks();
  rebuildSettingsList();
  updateMapSelection();
}

function flashCard(key) {
  const el = document.querySelector(`.clock-card[data-key="${CSS.escape(key)}"]`);
  if (!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 500);
}

/* ------------------------------------------------------------------ *
 * Analog clock cards
 * ------------------------------------------------------------------ */
let clockRefs = {};

function buildTicksSVG() {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    const major = i % 3 === 0;
    const r1 = major ? 37 : 41, r2 = 45;
    const a = rad(angle - 90);
    const x1 = 50 + r1 * Math.cos(a), y1 = 50 + r1 * Math.sin(a);
    const x2 = 50 + r2 * Math.cos(a), y2 = 50 + r2 * Math.sin(a);
    s += `<line class="tick${major ? ' major' : ''}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`;
  }
  return s;
}
const TICKS_SVG = buildTicksSVG();

function buildClockCard(city) {
  const key = cityKey(city);
  const wrap = document.createElement('div');
  wrap.className = 'clock-card';
  wrap.dataset.key = key;
  wrap.innerHTML = `
    <button class="clock-remove" aria-label="Remove ${city.name}" title="Remove">&#10005;</button>
    <div class="clock-city">${city.name}</div>
    <div class="clock-country">${city.country}</div>
    <div class="clock-face-wrap">
      <svg class="clock-face" viewBox="0 0 100 100">
        <circle class="face" cx="50" cy="50" r="46"></circle>
        ${TICKS_SVG}
        <line class="hand-hour" x1="50" y1="50" x2="50" y2="27"></line>
        <line class="hand-minute" x1="50" y1="50" x2="50" y2="17"></line>
        <circle class="pivot" cx="50" cy="50" r="2.4"></circle>
      </svg>
    </div>
    <div class="clock-digital"></div>
    <div class="clock-date"></div>
    <div class="clock-meta">
      <span class="clock-offset"></span>
      <span class="clock-daybadge" hidden></span>
    </div>
  `;
  wrap.querySelector('.clock-remove').addEventListener('click', () => removeCity(key));
  return {
    el: wrap, city,
    hourHand: wrap.querySelector('.hand-hour'),
    minuteHand: wrap.querySelector('.hand-minute'),
    digital: wrap.querySelector('.clock-digital'),
    dateEl: wrap.querySelector('.clock-date'),
    offsetEl: wrap.querySelector('.clock-offset'),
    dayBadge: wrap.querySelector('.clock-daybadge'),
  };
}

function setHand(el, angleDeg) {
  el.setAttribute('transform', `rotate(${angleDeg.toFixed(2)} 50 50)`);
}

function rebuildClocks() {
  const list = document.getElementById('clocksList');
  const empty = document.getElementById('clocksEmpty');
  list.innerHTML = '';
  clockRefs = {};
  if (!activeKeys.length) { empty.hidden = false; return; }
  empty.hidden = true;

  const now = currentVirtualTime();
  const sorted = [...activeKeys].sort((a, b) =>
    getUtcOffsetMinutes(now, findCityByKey(a).tz) - getUtcOffsetMinutes(now, findCityByKey(b).tz));

  for (const key of sorted) {
    const card = buildClockCard(findCityByKey(key));
    list.appendChild(card.el);
    clockRefs[key] = card;
  }
  tickClocks();
}

function tickClocks() {
  const now = currentVirtualTime();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const key in clockRefs) {
    const ref = clockRefs[key];
    const z = getZonedTime(now, ref.city.tz);
    setHand(ref.hourHand, (z.hour % 12) * 30 + z.minute * 0.5);
    setHand(ref.minuteHand, z.minute * 6);
    ref.digital.textContent = `${pad(z.hour)}:${pad(z.minute)}`;
    ref.dateEl.textContent = `${z.weekday} ${MONTHS[z.month - 1]} ${pad(z.day)}, ${z.year}`;
    ref.offsetEl.textContent = formatOffsetLabel(getUtcOffsetMinutes(now, ref.city.tz));
    const dl = dayDiffLabel(now, ref.city.tz, localTz);
    ref.dayBadge.hidden = !dl;
    if (dl) ref.dayBadge.textContent = dl;
  }
}

/* ------------------------------------------------------------------ *
 * Header "reference time" readout
 * ------------------------------------------------------------------ */
function updateHeader(now) {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const z = getZonedTime(now, localTz);
  document.getElementById('refValue').textContent =
    `${z.weekday} ${MONTHS[z.month - 1]} ${pad(z.day)}, ${z.year}  ${pad(z.hour)}:${pad(z.minute)} (your local time)`;

  const pill = document.getElementById('offsetPill');
  const resetBtn = document.getElementById('resetBtn');
  resetBtn.hidden = manualBase === null;
  if (offsetMinutes === 0) {
    pill.hidden = true;
  } else {
    const sign = offsetMinutes > 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const h = Math.floor(abs / 60), m = abs % 60;
    pill.textContent = `${sign}${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
    pill.hidden = false;
  }
}

/* ------------------------------------------------------------------ *
 * World map (D3): land, graticule, day/night terminator, city dots
 * ------------------------------------------------------------------ */
let mapState = null;

async function initMap() {
  const width = 960, height = 500;
  const svg = d3.select('#map');
  const projection = d3.geoNaturalEarth1().fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' });
  const path = d3.geoPath(projection);

  svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere').attr('d', path);
  svg.append('path').datum(d3.geoGraticule().step([30, 30])()).attr('class', 'graticule').attr('d', path);

  const landPath = svg.append('path').attr('class', 'land');
  const nightPath = svg.append('path').attr('class', 'night');
  const sunCircle = svg.append('circle').attr('class', 'sun').attr('r', 6);

  const dotsG = svg.append('g').attr('class', 'dots');
  const labelsG = svg.append('g').attr('class', 'labels');

  mapState = { projection, path, nightPath, sunCircle, dotsG, labelsG };

  svg.select('.sphere').on('click', (event) => {
    const [x, y] = d3.pointer(event, svg.node());
    const geo = projection.invert([x, y]);
    if (!geo) return;
    const nearest = findNearestCity(geo[0], geo[1]);
    if (nearest) addCity(nearest);
  });

  const dots = dotsG.selectAll('circle.city-dot')
    .data(CITIES)
    .join('circle')
    .attr('class', 'city-dot')
    .attr('r', 2.6)
    .attr('cx', d => projection([d.lon, d.lat])[0])
    .attr('cy', d => projection([d.lon, d.lat])[1])
    .on('click', (event, d) => { event.stopPropagation(); addCity(d); });
  dots.append('title').text(d => `${d.name}, ${d.country}`);
  mapState.dots = dots;

  try {
    const world = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    const land = topojson.feature(world, world.objects.countries);
    landPath.datum(land).attr('d', path);
  } catch (e) {
    console.warn('Could not load world map data; continuing without land shapes.', e);
  }

  updateMapSelection();
  updateMapTime(currentVirtualTime());
}

function updateMapTime(now) {
  if (!mapState) return;
  const { lon, lat } = sunPosition(now);
  const nightGeo = d3.geoCircle().center([lon + 180, -lat]).radius(90).precision(2)();
  mapState.nightPath.attr('d', mapState.path(nightGeo));
  const sunXY = mapState.projection([lon, lat]);
  if (sunXY) mapState.sunCircle.attr('cx', sunXY[0]).attr('cy', sunXY[1]);
}

function updateMapSelection() {
  if (!mapState) return;
  mapState.dots.classed('active', d => activeKeys.includes(cityKey(d)));

  const activeCities = activeKeys.map(findCityByKey);
  const sel = mapState.labelsG.selectAll('text.city-label').data(activeCities, cityKey);
  sel.exit().remove();
  sel.enter().append('text').attr('class', 'city-label')
    .merge(sel)
    .attr('x', d => mapState.projection([d.lon, d.lat])[0] + 6)
    .attr('y', d => mapState.projection([d.lon, d.lat])[1] - 6)
    .text(d => d.name);
}

/* ------------------------------------------------------------------ *
 * Settings panel
 * ------------------------------------------------------------------ */
function rebuildSettingsList() {
  const ul = document.getElementById('activeCityList');
  ul.innerHTML = '';
  if (!activeKeys.length) {
    ul.innerHTML = '<li class="settings-empty">No locations yet.</li>';
    return;
  }
  const now = currentVirtualTime();
  for (const key of activeKeys) {
    const city = findCityByKey(key);
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="li-info">
        <span>${city.name}, ${city.country}</span>
        <span class="li-offset">${formatOffsetLabel(getUtcOffsetMinutes(now, city.tz))}</span>
      </div>
      <button aria-label="Remove ${city.name}" title="Remove">&#10005;</button>
    `;
    li.querySelector('button').addEventListener('click', () => removeCity(key));
    ul.appendChild(li);
  }
}

function populateCityOptions() {
  const datalist = document.getElementById('cityOptions');
  const sorted = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));
  datalist.innerHTML = sorted.map(c => `<option value="${c.name}, ${c.country}"></option>`).join('');
}

function tryAddFromSearch() {
  const input = document.getElementById('citySearch');
  const val = input.value.trim().toLowerCase();
  if (!val) return;
  const match = CITIES.find(c => `${c.name}, ${c.country}`.toLowerCase() === val)
    || CITIES.find(c => c.name.toLowerCase() === val);
  if (match) {
    addCity(match);
    input.value = '';
  } else {
    input.classList.add('input-error');
    setTimeout(() => input.classList.remove('input-error'), 600);
  }
}

function openSettings() {
  document.getElementById('settingsOverlay').hidden = false;
  const panel = document.getElementById('settingsPanel');
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => panel.classList.add('open'));
}
function closeSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  setTimeout(() => { document.getElementById('settingsOverlay').hidden = true; }, 220);
}

/* ------------------------------------------------------------------ *
 * Main tick + wheel-driven time travel
 * ------------------------------------------------------------------ */
function mainTick() {
  const now = currentVirtualTime();
  tickClocks();
  updateHeader(now);
  updateMapTime(now);
}

function normalizedDeltaY(e) {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
  return e.deltaY;
}

function initWheel() {
  document.getElementById('workspace').addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!manualBase) {
      const tenMin = WHEEL_UNIT_MIN * 60000;
      manualBase = new Date(Math.round(Date.now() / tenMin) * tenMin);
    }
    wheelAccum += normalizedDeltaY(e);
    while (wheelAccum >= WHEEL_THRESHOLD) { offsetMinutes += WHEEL_UNIT_MIN; wheelAccum -= WHEEL_THRESHOLD; }
    while (wheelAccum <= -WHEEL_THRESHOLD) { offsetMinutes -= WHEEL_UNIT_MIN; wheelAccum += WHEEL_THRESHOLD; }
    mainTick();
  }, { passive: false });
}

function init() {
  populateCityOptions();
  rebuildClocks();
  rebuildSettingsList();
  initWheel();

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay').addEventListener('click', closeSettings);
  document.getElementById('addCityBtn').addEventListener('click', tryAddFromSearch);
  document.getElementById('citySearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryAddFromSearch();
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    manualBase = null;
    offsetMinutes = 0;
    wheelAccum = 0;
    mainTick();
  });

  mainTick();
  setInterval(mainTick, 15000);

  initMap();
}

init();
