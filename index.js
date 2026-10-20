/* ============================================================
   DncWeather 3D · estação meteorológica interativa
   Open-Meteo (previsão + qualidade do ar + geocoding)
   ViaCEP (endereço) · Three.js (cena 3D) · Chart.js (gráficos)
   ============================================================ */
import { WeatherScene, Globe3D } from './scene3d.js';

const $ = (id) => document.getElementById(id);

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COMPASS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

const state = {
    lat: null, lon: null, place: '', addr: null,
    wx: null, air: null,
    units: 'metric', selected: 0, updatedAt: 0
};
let sceneOverride = null;   // código WMO forçado (modos visuais) ou null = condição real
let charts = null;
let scene = null;
let globe = null;
let refreshTimer = null;

/* ---------------- utilidades ---------------- */
const U = () => ({
    temp: state.units === 'metric' ? '°C' : '°F',
    wind: state.units === 'metric' ? 'km/h' : 'mph',
    rain: state.units === 'metric' ? 'mm' : 'in',
    dist: state.units === 'metric' ? 'km' : 'mi'
});

const mean = (a) => (a && a.length ? a.reduce((s, v) => s + (v ?? 0), 0) / a.length : 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r0 = (v) => Math.round(v ?? 0);

function weatherInfo(code) {
    if (code === 0) return { label: 'Céu limpo', icon: 'fa-sun' };
    if (code === 1) return { label: 'Predomínio de sol', icon: 'fa-sun' };
    if (code === 2) return { label: 'Parcialmente nublado', icon: 'fa-cloud-sun' };
    if (code === 3) return { label: 'Encoberto', icon: 'fa-cloud' };
    if (code === 45 || code === 48) return { label: 'Névoa', icon: 'fa-smog' };
    if (code >= 51 && code <= 57) return { label: 'Garoa', icon: 'fa-cloud-rain' };
    if (code >= 61 && code <= 67) return { label: 'Chuva', icon: 'fa-cloud-showers-heavy' };
    if (code >= 71 && code <= 77) return { label: 'Neve', icon: 'fa-snowflake' };
    if (code >= 80 && code <= 82) return { label: 'Pancadas de chuva', icon: 'fa-cloud-showers-heavy' };
    if (code === 85 || code === 86) return { label: 'Pancadas de neve', icon: 'fa-snowflake' };
    if (code >= 95) return { label: 'Tempestade', icon: 'fa-cloud-bolt' };
    return { label: 'Tempo instável', icon: 'fa-cloud' };
}

function cloudFromCode(code) {
    if (code >= 61 || code >= 95) return 96;
    if (code >= 45) return 90;
    if (code >= 3) return 95;
    if (code === 2) return 60;
    if (code === 1) return 30;
    return 8;
}

function dayHourly(i) {
    const h = state.wx.hourly;
    const from = i * 24;
    const slice = (arr) => arr.slice(from, from + 24);
    return {
        time: slice(h.time),
        temperature_2m: slice(h.temperature_2m),
        relative_humidity_2m: slice(h.relative_humidity_2m),
        precipitation_probability: slice(h.precipitation_probability),
        precipitation: slice(h.precipitation),
        weather_code: slice(h.weather_code),
        wind_speed_10m: slice(h.wind_speed_10m),
        uv_index: slice(h.uv_index),
        visibility: slice(h.visibility)
    };
}

function currentHourIndex() {
    if (!state.wx) return 0;
    const now = state.wx.current.time.slice(0, 13); // AAAA-MM-DDTHH
    const idx = state.wx.hourly.time.findIndex((t) => t.slice(0, 13) === now);
    return idx < 0 ? 0 : idx;
}

function moonPhase(date) {
    const known = Date.UTC(2000, 0, 6, 18, 14);
    const synodic = 29.530588853;
    const days = (date.getTime() - known) / 86400000;
    const p = ((days % synodic) + synodic) % synodic;
    const f = p / synodic;
    const names = [
        'Lua nova 🌑', 'Crescente côncava 🌒', 'Quarto crescente 🌓', 'Crescente gibosa 🌔',
        'Lua cheia 🌕', 'Minguante gibosa 🌖', 'Quarto minguante 🌗', 'Minguante côncava 🌘'
    ];
    return names[Math.round(f * 8) % 8];
}

function aqiInfo(v) {
    if (v == null) return { label: '—', color: '#5b7290' };
    if (v < 20) return { label: 'Boa', color: '#2fbf71' };
    if (v < 40) return { label: 'Razoável', color: '#c9d64a' };
    if (v < 60) return { label: 'Moderada', color: '#ffb020' };
    if (v < 80) return { label: 'Ruim', color: '#ff7a45' };
    if (v < 100) return { label: 'Muito ruim', color: '#e0417a' };
    return { label: 'Péssima', color: '#8b3a62' };
}

function uvInfo(v) {
    if (v < 3) return 'Baixo';
    if (v < 6) return 'Moderado';
    if (v < 8) return 'Alto';
    if (v < 11) return 'Muito alto';
    return 'Extremo';
}

const setErr = (m) => { $('formError').textContent = m || ''; };

function setLoading(on) {
    const btn = $('btnBuscar');
    btn.disabled = on;
    btn.querySelector('span').textContent = on ? 'Buscando...' : 'Buscar previsão';
}

/* ============================================================
   CENA 3D
   ============================================================ */
function initScene() {
    try {
        scene = new WeatherScene($('wxCanvas'));
        globe = new Globe3D($('globeCanvas'));
        scene.setWeather({ code: 0, isDay: true, temperature: 26, humidity: 55, wind: 8, cloud: 25, precipitation: 0 });
    } catch (e) {
        console.warn('WebGL indisponível:', e);
        $('sceneNote').textContent = 'Seu navegador não suporta WebGL — a cena 3D foi desativada, mas todos os dados continuam disponíveis.';
    }
}

function applyScene() {
    if (!scene) return;
    const hasData = !!state.wx;
    const i = state.selected;
    let code, isDay, temp, hum, wind, cloud, prec;

    if (!hasData) {
        code = 0; isDay = true; temp = 26; hum = 55; wind = 8; cloud = 25; prec = 0;
    } else if (i === 0) {
        const c = state.wx.current;
        code = c.weather_code;
        isDay = !!c.is_day;
        temp = c.temperature_2m;
        hum = c.relative_humidity_2m;
        wind = c.wind_speed_10m;
        cloud = c.cloud_cover;
        prec = c.precipitation;
    } else {
        const d = state.wx.daily;
        const h = dayHourly(i);
        code = d.weather_code[i];
        isDay = true;
        temp = (d.temperature_2m_max[i] + d.temperature_2m_min[i]) / 2;
        hum = mean(h.relative_humidity_2m);
        wind = d.wind_speed_10m_max[i];
        cloud = cloudFromCode(code);
        prec = d.precipitation_sum[i];
    }

    const forced = sceneOverride !== null;
    if (forced) code = sceneOverride;
    if (i > 0) isDay = true;

    scene.setWeather({ code, isDay, temperature: temp, humidity: r0(hum), wind: r0(wind), cloud: r0(cloud), precipitation: prec });

    const info = weatherInfo(code);
    const u = U();
    $('hudCond').textContent = info.label;
    $('hudWind').textContent = `${r0(wind)} ${u.wind}`;
    $('hudHum').textContent = `${r0(hum)}%`;
    $('hudCloud').textContent = `${r0(cloud)}%`;

    const tag = $('sceneTag');
    if (forced) {
        tag.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Modo visual: ${info.label}`;
    } else if (!hasData) {
        tag.innerHTML = '<i class="fa-solid fa-satellite"></i> Demonstração';
    } else if (i === 0) {
        tag.innerHTML = '<i class="fa-solid fa-satellite"></i> Condição agora';
    } else {
        const d = state.wx.daily;
        const dt = new Date(d.time[i] + 'T12:00:00');
        tag.innerHTML = `<i class="fa-solid fa-forward"></i> Prévia: ${DAYS_FULL[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`;
    }
}

/* ============================================================
   BUSCAS
   ============================================================ */
async function buscar() {
    setErr('');
    const cep = $('cep').value.replace(/\D/g, '');
    const lat = $('lat').value.trim().replace(',', '.');
    const lon = $('long').value.trim().replace(',', '.');

    if (cep.length > 0 && cep.length !== 8) { setErr('Digite um CEP válido com 8 números (ou deixe em branco).'); return; }
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        setErr('Digite latitude e longitude válidas (ou use sua localização / busque por cidade).');
        return;
    }

    setLoading(true);
    try {
        let addr = null;
        let place = `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`;

        if (cep.length === 8) {
            addr = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json());
            if (addr.erro) { setErr('CEP não encontrado. Confira o número.'); return; }
            place = `${addr.localidade}/${addr.uf}`;
        } else {
            place = (await reverseGeocode(lat, lon)) || place;
        }
        await loadWeather(lat, lon, place, addr);
    } catch {
        setErr('Falha na conexão. Tente novamente em instantes.');
    } finally {
        setLoading(false);
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const req = fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`).then((r) => r.json());
        const j = await Promise.race([req, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
        const city = j.city || j.locality || j.principalSubdivision;
        const uf = (j.principalSubdivisionCode || '').split('-').pop();
        return city ? (uf && !city.includes(uf) ? `${city}/${uf}` : city) : null;
    } catch {
        return null;
    }
}

async function buscarCidade() {
    setErr('');
    const q = $('cidade').value.trim();
    if (q.length < 2) { setErr('Digite o nome de uma cidade.'); return; }

    const btn = $('btnCidade');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Buscando...';
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt&format=json`).then((r) => r.json());
        const list = $('cityList');
        list.innerHTML = '';
        if (!res.results || !res.results.length) {
            setErr('Nenhuma cidade encontrada. Tente outro nome.');
            return;
        }
        res.results.forEach((c) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'city-item';
            const pop = c.population ? `<small>${(c.population / 1000).toFixed(0)} mil hab.</small>` : '';
            b.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span><strong>${c.name}</strong> <small>${c.admin1 || ''}${c.country ? ' · ' + c.country : ''}</small>${pop}</span>`;
            b.addEventListener('click', async () => {
                const place = c.admin1 && c.admin1 !== c.name ? `${c.name}/${c.admin1}` : c.name;
                $('lat').value = c.latitude.toFixed(4);
                $('long').value = c.longitude.toFixed(4);
                list.innerHTML = '';
                setErr('');
                await loadWeather(c.latitude, c.longitude, place, null, c.name);
            });
            list.appendChild(b);
        });
    } catch {
        setErr('Falha ao buscar cidades. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Buscar cidade';
    }
}

/* ============================================================
   CARREGAR PREVISÃO
   ============================================================ */
async function loadWeather(lat, lon, place, addr = null, cepCity = null, silent = false) {
    const p = new URLSearchParams({
        latitude: Number(lat).toFixed(4),
        longitude: Number(lon).toFixed(4),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,visibility',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
        timezone: 'auto',
        forecast_days: '7'
    });
    if (state.units === 'imperial') {
        p.set('temperature_unit', 'fahrenheit');
        p.set('wind_speed_unit', 'mph');
        p.set('precipitation_unit', 'inch');
    }

    try {
        const [wx, air] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?${p}`).then((r) => r.json()),
            fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lon).toFixed(4)}&current=european_aqi,pm10,pm2_5,ozone&timezone=auto`)
                .then((r) => r.json())
                .catch(() => null)
        ]);
        if (!wx || !wx.current) throw new Error('sem dados');

        state.lat = lat; state.lon = lon;
        state.place = place || state.place;
        state.addr = addr;
        state.cidade = cepCity;
        state.wx = wx;
        state.air = air;
        state.utc_offset_seconds = wx.utc_offset_seconds;
        state.updatedAt = Date.now();
        if (state.selected > 6) state.selected = 0;

        renderAll();
        if (!silent) {
            $('resultado').classList.remove('hidden');
            setTimeout(() => $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
        } else {
            $('resultado').classList.remove('hidden');
        }
        startAutoRefresh();
        saveFavHint();
    } catch {
        setErr('Não foi possível carregar a previsão. Verifique sua conexão.');
    }
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
        if (!state.lat) return;
        if (Date.now() - state.updatedAt > 10 * 60 * 1000) {
            await loadWeather(state.lat, state.lon, state.place, state.addr, state.cidade, true);
        }
    }, 60000);
}

/* ============================================================
   RENDER
   ============================================================ */
function renderAll() {
    renderNow();
    renderGauges();
    renderAir();
    renderAdvice();
    renderWeek();
    renderDetail(state.selected);
    renderAddress();
    renderCharts();
    renderFavState();
    applyScene();

    if (globe && state.lat != null) {
        globe.setLocation(Number(state.lat), Number(state.lon));
        globe.resize();
        $('gPlace').textContent = state.place || '—';
        $('gCoords').textContent = `${Number(state.lat).toFixed(4)}, ${Number(state.lon).toFixed(4)}`;
        $('gTz').textContent = state.wx.timezone || '—';
        $('gElev').textContent = `${r0(state.wx.elevation)} m`;
    }
    stampUpdated();
}

function stampUpdated() {
    const d = new Date(state.updatedAt);
    $('updated').innerHTML = `<i class="fa-solid fa-circle-check"></i> Atualizado às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · atualiza a cada 10 min`;
}

/* tema reativo do card "Agora": cores de fundo + efeitos por condição */
function themeNowCard(code, isDay) {
    const card = $('nowCard');
    if (!card) return;
    let c1, c2, glow, fx;

    const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86;

    if (!isDay) {                                   /* ---------- noite ---------- */
        if (code >= 95) { c1 = '#070a16'; c2 = '#1d2536'; glow = 'rgba(150,180,255,.40)'; fx = 'fx-storm'; }
        else if (isSnow) { c1 = '#0a1526'; c2 = '#2a4460'; glow = 'rgba(205,230,255,.38)'; fx = 'fx-snow'; }
        else if (code >= 61) { c1 = '#08122a'; c2 = '#1e3350'; glow = 'rgba(120,170,255,.35)'; fx = 'fx-rain'; }
        else if (code >= 45) { c1 = '#0b1524'; c2 = '#2a3648'; glow = 'rgba(200,220,240,.28)'; fx = 'fx-fog'; }
        else if (code >= 2) { c1 = '#071026'; c2 = '#1c2f4c'; glow = 'rgba(180,205,255,.28)'; fx = 'fx-cloud'; }
        else { c1 = '#040c22'; c2 = '#16355c'; glow = 'rgba(255,220,140,.22)'; fx = 'fx-clear'; }
    } else {                                        /* ---------- dia ---------- */
        if (code >= 95) { c1 = '#141a26'; c2 = '#3a4459'; glow = 'rgba(170,190,255,.45)'; fx = 'fx-storm'; }
        else if (isSnow) { c1 = '#2b4a66'; c2 = '#a9c9e0'; glow = 'rgba(240,250,255,.55)'; fx = 'fx-snow'; }
        else if (code >= 61) { c1 = '#1f3a52'; c2 = '#486b8b'; glow = 'rgba(160,200,255,.42)'; fx = 'fx-rain'; }
        else if (code >= 45) { c1 = '#414e5e'; c2 = '#8d99a6'; glow = 'rgba(255,255,255,.35)'; fx = 'fx-fog'; }
        else if (code >= 2) { c1 = '#33587e'; c2 = '#8fb0c9'; glow = 'rgba(255,255,255,.30)'; fx = 'fx-cloud'; }
        else if (code === 1) { c1 = '#1667c6'; c2 = '#63aeee'; glow = 'rgba(255,214,110,.55)'; fx = 'fx-clear'; }
        else { c1 = '#0f5fbe'; c2 = '#7cc3f5'; glow = 'rgba(255,214,110,.60)'; fx = 'fx-clear'; }
    }

    card.style.setProperty('--c1', c1);
    card.style.setProperty('--c2', c2);
    card.style.setProperty('--glow', glow);
    card.classList.remove('fx-clear', 'fx-cloud', 'fx-rain', 'fx-storm', 'fx-snow', 'fx-fog');
    card.classList.add(fx);
    card.classList.toggle('is-night', !isDay);
}

function renderNow() {
    const c = state.wx.current;
    const h = dayHourly(0);
    const hi = currentHourIndex() % 24;
    const info = weatherInfo(c.weather_code);
    const u = U();

    const icon = $('nowIcon');
    icon.className = `fa-solid ${info.icon}`;
    const box = icon.parentElement;
    box.classList.remove('pop');
    void box.offsetWidth;            /* reinicia a animação */
    box.classList.add('pop');

    $('nowTemp').textContent = `${r0(c.temperature_2m)}°`;
    $('nowDesc').textContent = info.label;
    $('nowPlace').textContent = state.place || '—';
    $('nowClock').textContent = `${c.time.slice(11, 16)} local`;
    $('nowHum').textContent = `${c.relative_humidity_2m}%`;
    $('nowWind').textContent = `${r0(c.wind_speed_10m)} ${u.wind}`;
    $('nowFeels').textContent = `${r0(c.apparent_temperature)}°`;
    $('nowPressure').textContent = `${r0(c.pressure_msl)} hPa`;
    $('nowUv').textContent = `${h.uv_index[hi] != null ? h.uv_index[hi].toFixed(1) : '—'} · ${uvInfo(h.uv_index[hi] || 0)}`;
    $('nowVis').textContent = `${(h.visibility[hi] / (state.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} ${u.dist}`;
    $('nowCloud').textContent = `${c.cloud_cover}%`;
    $('nowPrec').textContent = `${c.precipitation} ${u.rain}`;
    $('nowGust').textContent = `${r0(c.wind_gusts_10m)} ${u.wind}`;
    $('nowDir').textContent = `${COMPASS[Math.round(c.wind_direction_10m / 45) % 8]} (${c.wind_direction_10m}°)`;

    themeNowCard(c.weather_code, !!c.is_day);
}

/* ---------------- medidores ---------------- */
function setGauge(arcId, numId, pct, text) {
    const arc = $(arcId);
    const C = 2 * Math.PI * 52;
    arc.style.strokeDasharray = `${C}`;
    arc.style.strokeDashoffset = `${C * (1 - clamp(pct, 0, 1))}`;
    $(numId).textContent = text;
}

function renderGauges() {
    const i = state.selected;
    const u = U();
    const ctx = i === 0 ? 'agora' : 'dia selecionado';

    let hum, rainP, uv, wind, windMax;
    if (i === 0) {
        const c = state.wx.current;
        const h = dayHourly(0);
        const hi = currentHourIndex() % 24;
        hum = c.relative_humidity_2m;
        rainP = h.precipitation_probability[hi] ?? state.wx.daily.precipitation_probability_max[0];
        uv = state.wx.daily.uv_index_max[0];
        wind = c.wind_speed_10m;
        windMax = state.wx.daily.wind_speed_10m_max[0];
    } else {
        const d = state.wx.daily;
        const h = dayHourly(i);
        hum = mean(h.relative_humidity_2m);
        rainP = d.precipitation_probability_max[i];
        uv = d.uv_index_max[i];
        wind = d.wind_speed_10m_max[i];
        windMax = wind;
    }

    const windScale = state.units === 'metric' ? 80 : 50;
    setGauge('gHumArc', 'gHumNum', hum / 100, `${r0(hum)}%`);
    setGauge('gRainArc', 'gRainNum', rainP / 100, `${r0(rainP)}%`);
    setGauge('gUvArc', 'gUvNum', uv / 11, `${(uv ?? 0).toFixed(1)}`);
    setGauge('gWindArc', 'gWindNum', wind / windScale, `${r0(wind)}`);

    $('gHumSub').textContent = `(${ctx})`;
    $('gRainSub').textContent = `(${ctx})`;
    $('gUvSub').textContent = `· máx ${uvInfo(uv || 0)} (${ctx})`;
    $('gWindSub').textContent = `${u.wind} · rajadas até ${r0(windMax)}`;
}

/* ---------------- qualidade do ar ---------------- */
function renderAir() {
    const card = $('airCard');
    if (!state.air || !state.air.current || state.air.current.european_aqi == null) {
        card.classList.add('muted');
        $('aqiLabel').textContent = 'sem dados';
        $('aqiVal').textContent = '—';
        $('pm25').textContent = '—';
        $('pm10').textContent = '—';
        $('ozone').textContent = '—';
        $('aqiBar').style.width = '0%';
        return;
    }
    card.classList.remove('muted');
    const a = state.air.current;
    const info = aqiInfo(a.european_aqi);
    $('aqiLabel').textContent = info.label;
    $('aqiLabel').style.background = info.color;
    $('aqiVal').textContent = a.european_aqi;
    $('pm25').textContent = `${a.pm2_5} µg/m³`;
    $('pm10').textContent = `${a.pm10} µg/m³`;
    $('ozone').textContent = `${a.ozone} µg/m³`;
    $('aqiBar').style.width = `${clamp(a.european_aqi, 4, 100)}%`;
    $('aqiBar').style.background = info.color;
}

/* ---------------- análise + alertas do dia ---------------- */
function adviceFor(i) {
    const d = state.wx.daily;
    const h = dayHourly(i);
    const u = U();
    const out = [];

    const rainP = d.precipitation_probability_max[i];
    const rainMm = d.precipitation_sum[i];
    const uv = d.uv_index_max[i];
    const hum = mean(h.relative_humidity_2m);
    const wind = d.wind_speed_10m_max[i];
    const tMax = d.temperature_2m_max[i];
    const tMin = d.temperature_2m_min[i];
    const code = d.weather_code[i];

    if (code >= 95) out.push({ lvl: 'alta', icon: 'fa-cloud-bolt', text: 'Risco de tempestade: evite áreas abertas e sombras de árvores.' });
    if (rainP >= 70) out.push({ lvl: 'alta', icon: 'fa-umbrella', text: `Chance de chuva de ${r0(rainP)}% — leve guarda-chuva.` });
    else if (rainP >= 40) out.push({ lvl: 'media', icon: 'fa-umbrella', text: `Possibilidade de chuva (${r0(rainP)}%) — esteja preparado.` });
    if (rainMm > 5) out.push({ lvl: 'media', icon: 'fa-cloud-showers-heavy', text: `Acumulo previsto de ${rainMm} ${u.rain} no dia.` });
    if (uv >= 8) out.push({ lvl: 'alta', icon: 'fa-sun', text: `UV em ${uv} (${uvInfo(uv)}) — protetor solar obrigatório.` });
    else if (uv >= 6) out.push({ lvl: 'media', icon: 'fa-sun', text: `UV em ${uv} (${uvInfo(uv)}) — use protetor solar.` });
    if (hum >= 85) out.push({ lvl: 'media', icon: 'fa-droplet', text: `Umidade do ar em ${r0(hum)}% — sensação abafada.` });
    else if (hum <= 35) out.push({ lvl: 'media', icon: 'fa-droplet', text: `Umidade baixa (${r0(hum)}%) — hidrate-se bastante.` });
    if (wind >= 50) out.push({ lvl: 'alta', icon: 'fa-wind', text: `Vento forte, até ${r0(wind)} ${u.wind} — cuidado com objetos soltos.` });
    else if (wind >= 35) out.push({ lvl: 'media', icon: 'fa-wind', text: `Ventos de até ${r0(wind)} ${u.wind}.` });
    if (tMax >= 33) out.push({ lvl: 'alta', icon: 'fa-temperature-high', text: `Calor intenso (${r0(tMax)}°) — hidrate-se e evite o sol entre 10h e 16h.` });
    else if (tMax >= 29) out.push({ lvl: 'media', icon: 'fa-temperature-high', text: `Dia quente, máxima de ${r0(tMax)}°.` });
    if (tMin <= 10) out.push({ lvl: 'media', icon: 'fa-temperature-low', text: `Madrugada fria, mínima de ${r0(tMin)}°.` });
    if (state.air && state.air.current && state.air.current.european_aqi >= 60) {
        out.push({ lvl: 'media', icon: 'fa-lungs', text: 'Ar de qualidade ruim — evite exercícios intensos ao ar livre.' });
    }
    if (!out.length) out.push({ lvl: 'boa', icon: 'fa-face-smile', text: 'Sem alertas: dia tranquilo para atividades ao ar livre.' });
    return out;
}

function renderAdvice() {
    const i = state.selected;
    const d = state.wx.daily;
    const h = dayHourly(i);
    const c = state.wx.current;
    const u = U();
    const info = weatherInfo(i === 0 ? c.weather_code : d.weather_code[i]);
    const dt = new Date(d.time[i] + 'T12:00:00');

    const label = i === 0 ? 'Agora' : `${DAYS_FULL[dt.getDay()]}, ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`;
    const tempTxt = i === 0
        ? `${r0(c.temperature_2m)}${u.temp} (sensação ${r0(c.apparent_temperature)}${u.temp})`
        : `${r0(d.temperature_2m_max[i])}° / ${r0(d.temperature_2m_min[i])}°`;
    const hum = i === 0 ? c.relative_humidity_2m : mean(h.relative_humidity_2m);
    const wind = i === 0 ? c.wind_speed_10m : d.wind_speed_10m_max[i];
    const rainP = i === 0 ? (h.precipitation_probability[currentHourIndex() % 24] ?? 0) : d.precipitation_probability_max[i];

    $('analysisText').textContent =
        `${label} em ${state.place}: ${info.label.toLowerCase()}, ${tempTxt}, ` +
        `umidade do ar em ${r0(hum)}%, vento de ${r0(wind)} ${u.wind} e ${r0(rainP)}% de chance de chuva. ` +
        `Nuvens em ${i === 0 ? c.cloud_cover : cloudFromCode(d.weather_code[i])}%.`;

    const chips = $('adviceChips');
    chips.innerHTML = '';
    adviceFor(i).forEach((a) => {
        const el = document.createElement('span');
        el.className = `chip ${a.lvl}`;
        el.innerHTML = `<i class="fa-solid ${a.icon}"></i> ${a.text}`;
        chips.appendChild(el);
    });
}

/* ---------------- 7 dias ---------------- */
function renderWeek() {
    const d = state.wx.daily;
    const week = $('week');
    week.innerHTML = '';
    d.time.forEach((date, i) => {
        const dt = new Date(date + 'T12:00:00');
        const w = weatherInfo(d.weather_code[i]);
        const h = dayHourly(i);
        const hum = mean(h.relative_humidity_2m);
        const rainP = d.precipitation_probability_max[i];

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'day' + (i === state.selected ? ' active' : '');
        el.setAttribute('aria-pressed', i === state.selected ? 'true' : 'false');
        el.dataset.i = i;
        el.innerHTML =
            `<small>${i === 0 ? 'Hoje' : DAYS[dt.getDay()]} · ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}</small>` +
            `<i class="fa-solid ${w.icon}"></i>` +
            `<strong>${r0(d.temperature_2m_max[i])}°</strong>` +
            `<span>${r0(d.temperature_2m_min[i])}°</span>` +
            `<em>${w.label}</em>` +
            `<div class="d-bars">` +
            `<div class="dbar hum" title="Umidade média ${r0(hum)}%"><span style="width:${clamp(hum, 0, 100)}%"></span></div>` +
            `<div class="dbar rain" title="Chance de chuva ${r0(rainP)}%"><span style="width:${clamp(rainP, 0, 100)}%"></span></div>` +
            `</div>` +
            `<b class="d-pct">${r0(rainP)}% chuva</b>`;
        el.addEventListener('click', () => selectDay(i));
        week.appendChild(el);
    });
}

function selectDay(i) {
    state.selected = i;
    document.querySelectorAll('.week .day').forEach((el) => {
        const on = Number(el.dataset.i) === i;
        el.classList.toggle('active', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderGauges();
    renderAdvice();
    renderDetail(i);
    updateChart24();
    applyScene();
}

function renderDetail(i) {
    const d = state.wx.daily;
    const dt = new Date(d.time[i] + 'T12:00:00');
    const h = dayHourly(i);
    const hum = mean(h.relative_humidity_2m);

    $('dTitle').innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${i === 0 ? 'Hoje' : DAYS_FULL[dt.getDay()]} · ${String(dt.getDate()).padStart(2, '0')} ${MONTHS[dt.getMonth()]} · ${weatherInfo(d.weather_code[i]).label}`;
    $('dSunrise').textContent = d.sunrise[i].slice(11, 16);
    $('dSunset').textContent = d.sunset[i].slice(11, 16);
    $('dUv').textContent = `${d.uv_index_max[i]?.toFixed(1)} · ${uvInfo(d.uv_index_max[i] || 0)}`;
    $('dRain').textContent = `${d.precipitation_sum[i]} ${U().rain} · ${d.precipitation_probability_max[i]}%`;
    $('dWind').textContent = `${r0(d.wind_speed_10m_max[i])} ${U().wind}`;
    $('dHum').textContent = `${r0(hum)}%`;
    $('dMoon').textContent = moonPhase(new Date(d.time[i] + 'T12:00:00'));
    $('dCloud').textContent = `${cloudFromCode(d.weather_code[i])}% estimado`;

    $('ch24title').innerHTML = i === 0
        ? 'Próximas 24 horas · temperatura e % de chuva'
        : `${DAYS_FULL[dt.getDay()]} · temperatura e % de chuva por hora`;
}

function renderAddress() {
    const a = state.addr;
    $('rua').textContent = a?.logradouro || (state.cidade ? state.cidade : '—');
    $('bairro').textContent = a?.bairro || '—';
    $('estado').textContent = a ? `${a.localidade}/${a.uf}` : (state.place || '—');
    $('geoLat').textContent = Number(state.lat).toFixed(5);
    $('geoLon').textContent = Number(state.lon).toFixed(5);
    $('geoElev').textContent = `${r0(state.wx.elevation)} m`;
    $('geoTz').textContent = `${state.wx.timezone} (UTC${formatOffset(state.utc_offset_seconds)})`;
    $('geoCep').textContent = a?.cep || '—';
    $('geoSrc').textContent = a ? 'Open-Meteo + ViaCEP' : 'Open-Meteo + geocoding';
}

function formatOffset(sec) {
    const s = sec < 0 ? '-' : '+';
    const abs = Math.abs(sec);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    return `${s}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/* ============================================================
   GRÁFICOS
   ============================================================ */
const GRID = 'rgba(255,255,255,0.07)';
const TICK = 'rgba(211,231,247,0.75)';

function axisOpts(extra = {}) {
    return Object.assign({
        type: 'linear',
        grid: { color: GRID, drawBorder: false },
        ticks: { color: TICK, font: { size: 11 } },
        border: { display: false }
    }, extra);
}

function legendOpts() {
    return {
        labels: { color: '#cfe3f5', usePointStyle: true, boxWidth: 8, font: { size: 11 } }
    };
}

function renderCharts() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.color = TICK;

    const d = state.wx.daily;
    const labels7 = d.time.map((t, i) => {
        const dt = new Date(t + 'T12:00:00');
        return `${i === 0 ? 'Hoje' : DAYS[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    const hum7 = d.time.map((_, i) => r0(mean(dayHourly(i).relative_humidity_2m)));
    const u = U();

    const rainH4 = $('chRain').closest('.chart-card')?.querySelector('h4');
    if (rainH4) rainH4.textContent = `Chuva (${u.rain}) × Vento máximo (${u.wind})`;

    if (!charts) {
        charts = {
            c24: new Chart($('ch24'), {
                type: 'line',
                data: { labels: [], datasets: [
                    { label: `Temperatura (${u.temp})`, data: [], borderColor: '#ffb020', backgroundColor: 'rgba(255,176,32,.18)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5, yAxisID: 'y' },
                    { label: 'Probabilidade de chuva (%)', data: [], borderColor: '#5aa9ff', backgroundColor: 'rgba(90,169,255,.25)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2, yAxisID: 'y1' }
                ] },
                options: baseOpts({ y1: { position: 'right', min: 0, max: 100, grid: { color: GRID }, ticks: { color: TICK, callback: (v) => v + '%' } } })
            }),
            temp: new Chart($('chTemp'), {
                type: 'line',
                data: { labels: labels7, datasets: [
                    { label: `Máxima (${u.temp})`, data: d.temperature_2m_max, borderColor: '#ff8a3d', backgroundColor: 'rgba(255,138,61,.20)', fill: '+1', tension: 0.35, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#ff8a3d' },
                    { label: `Mínima (${u.temp})`, data: d.temperature_2m_min, borderColor: '#6fd2ff', backgroundColor: 'rgba(111,210,255,.15)', fill: false, tension: 0.35, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#6fd2ff' }
                ] },
                options: baseOpts()
            }),
            hum: new Chart($('chHum'), {
                type: 'bar',
                data: { labels: labels7, datasets: [
                    { type: 'line', label: 'Umidade do ar (%)', data: hum7, borderColor: '#4fd1a5', backgroundColor: 'rgba(79,209,165,.15)', fill: true, tension: 0.35, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#4fd1a5', yAxisID: 'y' },
                    { type: 'bar', label: 'Probabilidade de chuva (%)', data: d.precipitation_probability_max, backgroundColor: 'rgba(90,169,255,.65)', borderColor: '#5aa9ff', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y' }
                ] },
                options: baseOpts({ y: { min: 0, max: 100, grid: { color: GRID }, ticks: { color: TICK, callback: (v) => v + '%' } } })
            }),
            rain: new Chart($('chRain'), {
                type: 'bar',
                data: { labels: labels7, datasets: [
                    { type: 'bar', label: `Chuva (${u.rain})`, data: d.precipitation_sum, backgroundColor: 'rgba(90,169,255,.7)', borderColor: '#5aa9ff', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y' },
                    { type: 'line', label: `Vento máx (${u.wind})`, data: d.wind_speed_10m_max, borderColor: '#ffd166', backgroundColor: '#ffd166', tension: 0.35, borderWidth: 3, pointRadius: 4, yAxisID: 'y1' }
                ] },
                options: baseOpts({ y1: { position: 'right', grid: { color: GRID }, ticks: { color: TICK } } })
            }),
            uv: new Chart($('chUv'), {
                type: 'bar',
                data: { labels: labels7, datasets: [
                    { type: 'bar', label: 'UV máximo', data: d.uv_index_max, backgroundColor: (ctx) => {
                        const v = ctx.raw || 0;
                        return v >= 8 ? 'rgba(224,65,122,.8)' : v >= 6 ? 'rgba(255,138,61,.8)' : v >= 3 ? 'rgba(255,207,77,.8)' : 'rgba(79,209,165,.8)';
                    }, borderRadius: 6, yAxisID: 'y' },
                    { type: 'line', label: `Temperatura média (${u.temp})`, data: d.temperature_2m_max.map((mx, i) => r0((mx + d.temperature_2m_min[i]) / 2)), borderColor: '#ff8a3d', tension: 0.35, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#ff8a3d', yAxisID: 'y1' }
                ] },
                options: baseOpts({ y1: { position: 'right', grid: { color: GRID }, ticks: { color: TICK } } })
            })
        };
    } else {
        charts.temp.data.labels = labels7;
        charts.temp.data.datasets[0].data = d.temperature_2m_max;
        charts.temp.data.datasets[1].data = d.temperature_2m_min;
        charts.temp.data.datasets[0].label = `Máxima (${u.temp})`;
        charts.temp.data.datasets[1].label = `Mínima (${u.temp})`;
        charts.hum.data.labels = labels7;
        charts.hum.data.datasets[0].data = hum7;
        charts.hum.data.datasets[1].data = d.precipitation_probability_max;
        charts.rain.data.labels = labels7;
        charts.rain.data.datasets[0].data = d.precipitation_sum;
        charts.rain.data.datasets[0].label = `Chuva (${u.rain})`;
        charts.rain.data.datasets[1].data = d.wind_speed_10m_max;
        charts.rain.data.datasets[1].label = `Vento máx (${u.wind})`;
        charts.uv.data.labels = labels7;
        charts.uv.data.datasets[0].data = d.uv_index_max;
        charts.uv.data.datasets[1].data = d.temperature_2m_max.map((mx, i) => r0((mx + d.temperature_2m_min[i]) / 2));
        charts.uv.data.datasets[1].label = `Temperatura média (${u.temp})`;
        Object.values(charts).forEach((c) => c.update('none'));
    }
    updateChart24();
}

function baseOpts(extraScales = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legendOpts(), tooltip: { backgroundColor: 'rgba(8,24,42,.95)', padding: 10, cornerRadius: 10 } },
        scales: Object.assign({ x: axisOpts() }, mapScales(extraScales))
    };
}

function mapScales(obj) {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => { out[k] = axisOpts(v); });
    return out;
}

function updateChart24() {
    if (!charts || !state.wx) return;
    const i = state.selected;
    const h = dayHourly(i);
    const u = U();
    let times = h.time;
    let temps = h.temperature_2m;
    let probs = h.precipitation_probability;

    if (i === 0) {
        const start = currentHourIndex();
        times = times.slice(start);
        temps = temps.slice(start);
        probs = probs.slice(start);
    }

    charts.c24.data.labels = times.map((t) => t.slice(11, 13) + 'h');
    charts.c24.data.datasets[0].data = temps;
    charts.c24.data.datasets[0].label = `Temperatura (${u.temp})`;
    charts.c24.data.datasets[1].data = probs;
    charts.c24.update('none');
}

/* ============================================================
   FAVORITOS
   ============================================================ */
const FAV_KEY = 'dncweather_favs';

function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}
function setFavs(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* ignore */ }
}

function renderFavs() {
    const box = $('favList');
    const favs = getFavs();
    box.innerHTML = '';
    if (!favs.length) {
        box.innerHTML = '<small class="fav-empty">Nenhum local salvo ainda — busque e clique em “Salvar local”.</small>';
        return;
    }
    favs.forEach((f, idx) => {
        const wrap = document.createElement('span');
        wrap.className = 'chip-fav';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'chip-main';
        main.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${f.place}`;
        main.title = `${f.lat}, ${f.lon}`;
        main.addEventListener('click', () => loadWeather(f.lat, f.lon, f.place, null, null));
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'chip-x';
        x.setAttribute('aria-label', 'Remover favorito');
        x.textContent = '×';
        x.addEventListener('click', (e) => {
            e.stopPropagation();
            const list = getFavs();
            list.splice(idx, 1);
            setFavs(list);
            renderFavs();
            renderFavState();
        });
        wrap.append(main, x);
        box.appendChild(wrap);
    });
}

function isFav() {
    if (state.lat == null) return false;
    return getFavs().some((f) => Math.abs(f.lat - state.lat) < 0.01 && Math.abs(f.lon - state.lon) < 0.01);
}

function renderFavState() {
    const on = isFav();
    $('btnFav').innerHTML = on
        ? '<i class="fa-solid fa-star"></i> Salvo'
        : '<i class="fa-regular fa-star"></i> Salvar local';
}

function saveFavHint() { renderFavState(); }

function toggleFav() {
    if (state.lat == null) { setErr('Busque um local primeiro.'); return; }
    const list = getFavs();
    const idx = list.findIndex((f) => Math.abs(f.lat - state.lat) < 0.01 && Math.abs(f.lon - state.lon) < 0.01);
    if (idx >= 0) list.splice(idx, 1);
    else list.push({ place: state.place, lat: Number(state.lat), lon: Number(state.lon) });
    setFavs(list);
    renderFavs();
    renderFavState();
}

/* ============================================================
   EVENTOS
   ============================================================ */
function bindEvents() {
    /* máscara de CEP */
    $('cep').addEventListener('input', (e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 8);
        e.target.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    });

    /* abas */
    $('tabCep').addEventListener('click', () => switchTab('cep'));
    $('tabCidade').addEventListener('click', () => switchTab('cidade'));

    $('btnBuscar').addEventListener('click', buscar);
    $('btnCidade').addEventListener('click', buscarCidade);
    $('cidade').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCidade(); } });
    [$('cep'), $('lat'), $('long')].forEach((el) =>
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } })
    );

    /* geolocalização */
    $('btnGeo').addEventListener('click', () => {
        if (!navigator.geolocation) { setErr('Seu navegador não suporta geolocalização.'); return; }
        setErr('');
        $('btnGeo').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Localizando...';
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude.toFixed(4);
                const lon = pos.coords.longitude.toFixed(4);
                $('lat').value = lat;
                $('long').value = lon;
                $('btnGeo').innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar minha localização';
                setErr('');
                switchTab('cep');
                const name = await reverseGeocode(lat, lon);
                await loadWeather(lat, lon, name || 'Sua localização', null);
            },
            () => {
                $('btnGeo').innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar minha localização';
                setErr('Não foi possível obter sua localização. Digite manualmente.');
            }
        );
    });

    /* unidades */
    $('unitC').addEventListener('click', () => setUnits('metric'));
    $('unitF').addEventListener('click', () => setUnits('imperial'));

    /* cena 3D */
    let rotating = true;
    $('btnRotate').addEventListener('click', () => {
        if (!scene) return;
        rotating = !rotating;
        scene.setAutoRotate(rotating);
        $('btnRotate').innerHTML = rotating
            ? '<i class="fa-solid fa-rotate"></i> Giro: ligado'
            : '<i class="fa-solid fa-pause"></i> Giro: pausado';
    });
    $('btnResetCam').addEventListener('click', () => scene && scene.resetCamera());

    document.querySelectorAll('#sceneModes .mode').forEach((b) => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#sceneModes .mode').forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            sceneOverride = b.dataset.code === 'auto' ? null : Number(b.dataset.code);
            applyScene();
        });
    });

    /* dia selecionado */
    $('btnBackNow').addEventListener('click', () => {
        selectDay(0);
        document.getElementById('semana').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* favoritos / atualizar */
    $('btnFav').addEventListener('click', toggleFav);
    $('btnRefresh').addEventListener('click', async () => {
        if (!state.lat) { setErr('Busque um local primeiro.'); return; }
        $('btnRefresh').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Atualizando';
        await loadWeather(state.lat, state.lon, state.place, state.addr, state.cidade, true);
        $('btnRefresh').innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Atualizar';
    });

    /* menu mobile */
    $('burger').addEventListener('click', () => {
        const nav = $('mainNav');
        const open = nav.classList.toggle('open');
        $('burger').setAttribute('aria-expanded', String(open));
        $('burger').innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });
    $('mainNav').addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            $('mainNav').classList.remove('open');
            $('burger').setAttribute('aria-expanded', 'false');
            $('burger').innerHTML = '<i class="fa-solid fa-bars"></i>';
        }
    });

    /* formulário de alertas */
    $('leadForm').addEventListener('submit', () => {
        setTimeout(() => {
            $('leadOk').textContent = 'Cadastro feito! Bem-vindo aos alertas do tempo.';
            $('leadForm').reset();
        }, 800);
    });
}

function switchTab(which) {
    const cep = which === 'cep';
    $('tabCep').classList.toggle('active', cep);
    $('tabCidade').classList.toggle('active', !cep);
    $('tabCep').setAttribute('aria-selected', String(cep));
    $('tabCidade').setAttribute('aria-selected', String(!cep));
    $('panelCep').classList.toggle('hidden', !cep);
    $('panelCidade').classList.toggle('hidden', cep);
}

async function setUnits(units) {
    if (units === state.units) return;
    state.units = units;
    $('unitC').classList.toggle('active', units === 'metric');
    $('unitF').classList.toggle('active', units === 'imperial');
    $('unitC').setAttribute('aria-pressed', String(units === 'metric'));
    $('unitF').setAttribute('aria-pressed', String(units === 'imperial'));
    if (state.lat != null) {
        await loadWeather(state.lat, state.lon, state.place, state.addr, state.cidade, true);
    }
}

/* ============================================================
   INÍCIO
   ============================================================ */
/* animações de entrada */
function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    const els = document.querySelectorAll(
        '.search-card, .scene-sec, .now-card, .globe-card, .gauge-card, .air-card, .analysis, .detail, .chart-card, .addr-card, .alerts'
    );
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el, i) => {
        el.classList.add('reveal');
        el.style.transitionDelay = `${(i % 4) * 70}ms`;
        io.observe(el);
    });
}

bindEvents();
initScene();
initReveal();
renderFavs();
applyScene();

/* exposição para depuração */
window.__dnc = { state, scene, globe, themeNowCard, get charts() { return charts; } };

/* demo inicial: preenche São Paulo para a cena já ter dados reais */
(async () => {
    await loadWeather(-23.5475, -46.63611, 'São Paulo/SP', null, null, true);
    $('resultado').classList.remove('hidden');
})();
