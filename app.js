(function () {
  'use strict';

  // Capitais estaduais [rótulo, latitude, longitude]. A declinação varia pouco dentro de um estado.
  var REGIOES = [
    ['AC — Rio Branco', -9.975, -67.824], ['AL — Maceió', -9.666, -35.735],
    ['AP — Macapá', 0.034, -51.066], ['AM — Manaus', -3.119, -60.022],
    ['BA — Salvador', -12.971, -38.501], ['CE — Fortaleza', -3.732, -38.527],
    ['DF — Brasília', -15.794, -47.882], ['ES — Vitória', -20.315, -40.312],
    ['GO — Goiânia', -16.686, -49.265], ['MA — São Luís', -2.530, -44.303],
    ['MT — Cuiabá', -15.601, -56.097], ['MS — Campo Grande', -20.469, -54.620],
    ['MG — Belo Horizonte', -19.917, -43.934], ['PA — Belém', -1.456, -48.502],
    ['PB — João Pessoa', -7.115, -34.863], ['PR — Curitiba', -25.428, -49.273],
    ['PE — Recife', -8.054, -34.881], ['PI — Teresina', -5.089, -42.802],
    ['RJ — Rio de Janeiro', -22.907, -43.173], ['RN — Natal', -5.795, -35.209],
    ['RS — Porto Alegre', -30.035, -51.218], ['RO — Porto Velho', -8.761, -63.900],
    ['RR — Boa Vista', 2.820, -60.673], ['SC — Florianópolis', -27.595, -48.548],
    ['SP — São Paulo', -23.550, -46.633], ['SE — Aracaju', -10.911, -37.071],
    ['TO — Palmas', -10.184, -48.333]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var sel = $('region'), manual = $('manual'), latIn = $('lat'), lonIn = $('lon');
  var bTrue = $('bTrue'), bMag = $('bMag'), headingEl = $('heading'), cardEl = $('cardinal');
  var dial = $('dial'), infoEl = $('info'), warnEl = $('warn');

  var state = { regionIdx: 9, trueNorth: true, dec: 0, label: '' };
  try {
    var saved = JSON.parse(localStorage.getItem('bussola') || '{}');
    if (typeof saved.regionIdx === 'number') state.regionIdx = saved.regionIdx;
    if (typeof saved.trueNorth === 'boolean') state.trueNorth = saved.trueNorth;
    state.lat = saved.lat; state.lon = saved.lon;
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem('bussola', JSON.stringify({
        regionIdx: state.regionIdx, trueNorth: state.trueNorth, lat: state.lat, lon: state.lon
      }));
    } catch (e) {}
  }

  // ---------- Região / declinação ----------
  REGIOES.forEach(function (r, i) {
    var o = document.createElement('option'); o.value = i; o.textContent = r[0]; sel.appendChild(o);
  });
  var oM = document.createElement('option'); oM.value = 'manual'; oM.textContent = 'Outra (digitar coordenadas)';
  sel.appendChild(oM);

  function num(s) { return parseFloat(String(s).replace(',', '.')); }

  function fmt(d) { return (d < 0 ? '−' : '+') + Math.abs(d).toFixed(1).replace('.', ',') + '°'; }

  function updateDeclination() {
    var lat, lon, label;
    if (state.regionIdx === 'manual') {
      lat = num(latIn.value); lon = num(lonIn.value); label = 'coordenadas informadas';
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
        state.dec = 0; state.label = ''; infoEl.textContent = 'Informe latitude e longitude válidas.'; return;
      }
      state.lat = latIn.value; state.lon = lonIn.value;
    } else {
      var r = REGIOES[state.regionIdx]; lat = r[1]; lon = r[2]; label = r[0];
    }
    var yr = WMM.decimalYear(new Date());
    var res = WMM.compute(lat, lon, 0, yr);
    state.dec = res.dec; state.label = label;
    warnEl.textContent = (yr < WMM.EPOCH || yr > WMM.VALID_UNTIL)
      ? 'Atenção: data do aparelho fora da validade do modelo (2025–2030).' : '';
    renderInfo();
    save();
  }

  function renderInfo() {
    if (!state.label) return;
    infoEl.innerHTML = 'Declinação magnética: <span class="dim">' + fmt(state.dec) + '</span> (' +
      (state.dec < 0 ? 'oeste' : 'leste') + ') · WMM2025 · ' + state.label;
  }

  sel.value = String(state.regionIdx);
  if (state.regionIdx === 'manual') { manual.style.display = 'flex'; latIn.value = state.lat || ''; lonIn.value = state.lon || ''; }
  sel.addEventListener('change', function () {
    state.regionIdx = sel.value === 'manual' ? 'manual' : parseInt(sel.value, 10);
    manual.style.display = state.regionIdx === 'manual' ? 'flex' : 'none';
    updateDeclination();
  });
  latIn.addEventListener('input', updateDeclination);
  lonIn.addEventListener('input', updateDeclination);

  function setMode(t) {
    state.trueNorth = t;
    bTrue.classList.toggle('on', t); bMag.classList.toggle('on', !t);
    save();
  }
  bTrue.addEventListener('click', function () { setMode(true); });
  bMag.addEventListener('click', function () { setMode(false); });
  setMode(state.trueNorth);
  updateDeclination();

  // ---------- Mostrador ----------
  (function drawDial() {
    var NS = 'http://www.w3.org/2000/svg', s = '';
    s += '<circle r="196" fill="#101a2e" stroke="#26324d" stroke-width="3"/>';
    for (var a = 0; a < 360; a += 5) {
      var big = a % 30 === 0, mid = a % 10 === 0;
      var r1 = 190, r2 = big ? 168 : (mid ? 176 : 182);
      var rad = a * Math.PI / 180, sx = Math.sin(rad), cy = -Math.cos(rad);
      s += '<line x1="' + (sx * r1).toFixed(2) + '" y1="' + (cy * r1).toFixed(2) + '" x2="' + (sx * r2).toFixed(2) +
        '" y2="' + (cy * r2).toFixed(2) + '" stroke="' + (big ? '#e8eef9' : '#5b6b8c') + '" stroke-width="' + (big ? 3 : 1.5) + '"/>';
    }
    var pts = [['N', 0, '#ff4d4d'], ['L', 90, '#e8eef9'], ['S', 180, '#e8eef9'], ['O', 270, '#e8eef9']];
    pts.forEach(function (p) {
      var rad = p[1] * Math.PI / 180, x = Math.sin(rad) * 138, y = -Math.cos(rad) * 138;
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 12).toFixed(1) + '" text-anchor="middle" font-size="36" font-weight="700" fill="' + p[2] + '">' + p[0] + '</text>';
    });
    [30, 60, 120, 150, 210, 240, 300, 330].forEach(function (a) {
      var rad = a * Math.PI / 180, x = Math.sin(rad) * 138, y = -Math.cos(rad) * 138;
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 6).toFixed(1) + '" text-anchor="middle" font-size="16" fill="#8fa0bd">' + a + '</text>';
    });
    s += '<polygon points="0,-100 9,0 -9,0" fill="#ff4d4d"/><polygon points="0,100 9,0 -9,0" fill="#5b6b8c"/><circle r="6" fill="#e8eef9"/>';
    dial.innerHTML = s;
  })();

  var NOMES = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

  // ---------- Sensor ----------
  var rad = Math.PI / 180;
  var sinS = 0, cosS = 1, haveData = false, lastEvt = 0, shown = null;

  // Direção (rumo magnético) a partir de alpha/beta/gamma (convenção W3C: Z-X'-Y'').
  // Horizontal: usa o topo do aparelho (eixo +Y). Muito inclinado/em pé: usa a traseira (eixo -Z).
  function headingFromEuler(alpha, beta, gamma) {
    var cA = Math.cos(alpha * rad), sA = Math.sin(alpha * rad);
    var cB = Math.cos(beta * rad), sB = Math.sin(beta * rad);
    var cG = Math.cos(gamma * rad), sG = Math.sin(gamma * rad);
    var east, north;
    if (Math.abs(cB * cG) > 0.5) {            // inclinação < 60°: usa o topo do aparelho
      east = -sA * cB; north = cA * cB;
    } else {                                  // aparelho "em pé": usa a traseira
      east = -(cA * sG + sA * sB * cG);
      north = -(sA * sG - cA * sB * cG);
    }
    var h = Math.atan2(east, north) / rad;
    return (h + 360) % 360;
  }

  function onOrient(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    if (e.type === 'deviceorientation' && e.absolute !== true) return; // precisa ser absoluta (norte magnético)
    var h = headingFromEuler(e.alpha, e.beta, e.gamma);
    var hr = h * rad;
    if (!haveData) { sinS = Math.sin(hr); cosS = Math.cos(hr); haveData = true; }
    else {
      var k = 0.18;                            // suavização no círculo (evita salto 359°→0°)
      sinS += k * (Math.sin(hr) - sinS); cosS += k * (Math.cos(hr) - cosS);
    }
    lastEvt = Date.now();
  }

  var hasAbs = 'ondeviceorientationabsolute' in window;
  if (hasAbs) window.addEventListener('deviceorientationabsolute', onOrient, true);
  else window.addEventListener('deviceorientation', onOrient, true);

  setTimeout(function () {
    if (!haveData) warnEl.textContent = 'Sem dados do sensor magnético. Use o Chrome no Android e permita o acesso a sensores de movimento.';
  }, 2500);

  function frame() {
    if (haveData) {
      var mag = (Math.atan2(sinS, cosS) / rad + 360) % 360;
      var h = state.trueNorth ? (mag + state.dec + 360) % 360 : mag;
      var rounded = Math.round(h) % 360;
      if (rounded !== shown) {
        shown = rounded;
        headingEl.textContent = rounded + '°';
        cardEl.textContent = NOMES[Math.round(h / 45) % 8];
      }
      dial.style.transform = 'rotate(' + (-h).toFixed(2) + 'deg)';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Offline (service worker) ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
