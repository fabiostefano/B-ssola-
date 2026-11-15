(function () {
  'use strict';

  var VERSAO = '5';
  var GAP_S = 90;          // acima disso entre dois pontos = trecho sem gravação
  var LOOK_M = 15;         // distância mínima até o ponto-alvo na volta
  var rad = Math.PI / 180;

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
  var bubble = $('bubble'), lvlTxt = $('lvlTxt'), gpsTxt = $('gpsTxt'), gpsBtn = $('gpsBtn');
  var bRec = $('bRec'), bRet = $('bRet'), bPocket = $('bPocket'), bGpx = $('bGpx'), bClr = $('bClr');
  var trkTxt = $('trkTxt'), retTxt = $('retTxt'), cv = $('map');
  var pocketEl = $('pocket'), pocketTxt = $('pocketTxt');
  $('ver').textContent = 'v' + VERSAO + ' · WMM2025';

  // ---------- Geometria (plano local; adequado para trilhas de até algumas dezenas de km) ----------
  function xy(lat0, lon0, lat, lon) { return [(lon - lon0) * Math.cos(lat0 * rad) * 111320, (lat - lat0) * 110574]; }
  function dist(a, b, c, d) { var p = xy(a, b, c, d); return Math.sqrt(p[0] * p[0] + p[1] * p[1]); }
  function bearing(a, b, c, d) { var p = xy(a, b, c, d); return (Math.atan2(p[0], p[1]) / rad + 360) % 360; }
  function segDist(la, lo, A, B) {            // distância do ponto (la,lo) ao segmento A-B
    var a = xy(la, lo, A[0], A[1]), b = xy(la, lo, B[0], B[1]);
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0;
    var px = a[0] + t * dx, py = a[1] + t * dy;
    return Math.sqrt(px * px + py * py);
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(2).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
  function fmtDur(s) {
    s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + 'h ' : '') + (h || m ? m + 'min' : r + 's');
  }

  // ---------- Estado ----------
  // regionIdx: número (capital) | 'manual' | 'gps'
  var state = { regionIdx: 9, fallbackIdx: 9, trueNorth: true, dec: 0, label: '' };
  try {
    var saved = JSON.parse(localStorage.getItem('bussola') || '{}');
    if (typeof saved.regionIdx === 'number' || saved.regionIdx === 'manual' || saved.regionIdx === 'gps') state.regionIdx = saved.regionIdx;
    if (typeof saved.fallbackIdx === 'number') state.fallbackIdx = saved.fallbackIdx;
    else if (typeof saved.regionIdx === 'number') state.fallbackIdx = saved.regionIdx;
    if (typeof saved.trueNorth === 'boolean') state.trueNorth = saved.trueNorth;
    state.lat = saved.lat; state.lon = saved.lon;
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem('bussola', JSON.stringify({
        regionIdx: state.regionIdx, fallbackIdx: state.fallbackIdx, trueNorth: state.trueNorth,
        lat: state.lat, lon: state.lon
      }));
    } catch (e) {}
  }

  // ---------- Trilha (persistida no aparelho) ----------
  // pts: [lat, lon, t(ms), precisão(m), gap]  — gap=1: o trecho anterior→este NÃO foi gravado (linha reta)
  var trk = { pts: [], rec: false, ret: false, retIdx: 0 };
  try {
    var st = JSON.parse(localStorage.getItem('bussolaTrilha') || 'null');
    if (st && Array.isArray(st.pts)) { trk.pts = st.pts; trk.rec = !!st.rec; trk.ret = !!st.ret; trk.retIdx = st.retIdx | 0; }
    if (trk.retIdx >= trk.pts.length) trk.retIdx = Math.max(0, trk.pts.length - 1);
  } catch (e) {}
  var saveTimer = null, saveFail = false;
  function saveTrk() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try {
      localStorage.setItem('bussolaTrilha', JSON.stringify({ pts: trk.pts, rec: trk.rec, ret: trk.ret, retIdx: trk.retIdx }));
      saveFail = false;
    } catch (e) { saveFail = true; }
  }
  function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(saveTrk, 8000); }

  var mapDirty = true;
  function addPoint(f) {
    if (f.acc > 60) return;                                   // ignora fixes muito imprecisos
    var pts = trk.pts, n = pts.length;
    var P = [Math.round(f.lat * 1e6) / 1e6, Math.round(f.lon * 1e6) / 1e6, f.t, Math.round(f.acc), 0];
    if (n) {
      var L = pts[n - 1], d = dist(L[0], L[1], P[0], P[1]), dt = (P[2] - L[2]) / 1000;
      if (dt <= 0) return;
      if (d < 5 && dt < 30) return;                           // parado: 1 ponto a cada 30 s
      if (dt > GAP_S) P[4] = 1;
    }
    pts.push(P);
    scheduleSave(); renderTrk(); mapDirty = true; mapGlDirty = true;
  }

  function trkStats() {
    var pts = trk.pts, n = pts.length, rec = 0, gap = 0, gaps = 0;
    for (var i = 1; i < n; i++) {
      var d = dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (pts[i][4]) { gap += d; gaps++; } else rec += d;
    }
    return { n: n, rec: rec, gap: gap, gaps: gaps, dur: n > 1 ? (pts[n - 1][2] - pts[0][2]) / 1000 : 0 };
  }

  function renderTrk() {
    var s = trkStats(), h;
    if (!s.n) h = '<span class="m">Sem trilha gravada.</span>';
    else {
      h = (trk.rec ? '<span class="w">● gravando</span> · ' : '') + s.n + ' pontos · ' + fmtDist(s.rec) + ' · ' + fmtDur(s.dur);
      if (s.gaps) h += '<br><span class="w">⚠ ' + s.gaps + ' trecho' + (s.gaps > 1 ? 's' : '') + ' sem gravação (~' + fmtDist(s.gap) + ' em linha reta)</span>';
      if (trk.rec) {
        var age = (Date.now() - trk.pts[s.n - 1][2]) / 1000;
        if (age > 60) h += '<br><span class="m">último ponto há ' + fmtDur(age) + '</span>';
      }
    }
    if (saveFail) h += '<br><span class="w">⚠ Não foi possível salvar a trilha no aparelho (sem espaço?). Exporte o GPX.</span>';
    trkTxt.innerHTML = h;
    bRec.textContent = trk.rec ? '■ Parar' : (s.n ? '● Continuar' : '● Gravar');
    bRec.className = 'btn' + (trk.rec ? ' rec' : '');
    bRet.textContent = trk.ret ? '■ Parar volta' : '↩ Voltar';
    bRet.className = 'btn ' + (trk.ret ? 'go' : 'alt');
  }

  bRec.addEventListener('click', function () {
    if (trk.rec) { trk.rec = false; saveTrk(); ensureGps(); renderTrk(); return; }
    trk.rec = true; trk.ret = false; ret = null; saveTrk(); ensureGps(); renderTrk(); renderRet();
    if (gpsFix && gpsStatus === 'ok' && Date.now() - gpsFix.t < 15000) addPoint(gpsFix);
  });

  bRet.addEventListener('click', function () {
    if (trk.ret) { trk.ret = false; ret = null; saveTrk(); ensureGps(); renderTrk(); renderRet(); return; }
    if (trk.pts.length < 2) { retTxt.innerHTML = '<span class="w">Grave uma trilha antes de voltar por ela.</span>'; return; }
    trk.ret = true; trk.rec = false; trk.retIdx = trk.pts.length - 1; ret = null;
    saveTrk(); ensureGps(); renderTrk();
    updateReturn(); renderRet();
  });

  var clrArm = 0;
  bClr.addEventListener('click', function () {
    if (!trk.pts.length) return;
    if (Date.now() - clrArm > 4000) {
      clrArm = Date.now(); bClr.textContent = 'Toque de novo p/ apagar';
      setTimeout(function () { bClr.textContent = 'Limpar trilha'; }, 4000); return;
    }
    clrArm = 0; bClr.textContent = 'Limpar trilha';
    trk.pts = []; trk.rec = false; trk.ret = false; trk.retIdx = 0; ret = null;
    saveTrk(); ensureGps(); renderTrk(); renderRet(); mapDirty = true; mapGlDirty = true;
  });

  bGpx.addEventListener('click', function () {
    if (!trk.pts.length) { trkTxt.innerHTML = '<span class="w">Nada para exportar.</span>'; return; }
    var pts = trk.pts, out = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Bussola" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Trilha ' +
      new Date(pts[0][2]).toISOString().slice(0, 16).replace('T', ' ') + '</name>\n<trkseg>\n';
    for (var i = 0; i < pts.length; i++) {
      if (i > 0 && pts[i][4]) out += '</trkseg>\n<trkseg>\n';     // trecho sem gravação = novo segmento
      out += '<trkpt lat="' + pts[i][0] + '" lon="' + pts[i][1] + '"><time>' + new Date(pts[i][2]).toISOString() + '</time></trkpt>\n';
    }
    out += '</trkseg>\n</trk>\n</gpx>\n';
    var blob = new Blob([out], { type: 'application/gpx+xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trilha-' + new Date(pts[0][2]).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') + '.gpx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  // ---------- Voltar pelo caminho ----------
  var ret = null, lastVib = 0;
  function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  function updateReturn() {
    var pts = trk.pts, n = pts.length;
    if (!trk.ret || !n) { ret = null; return; }
    if (!gpsFix || gpsStatus !== 'ok') { ret = { wait: true }; return; }
    var la = gpsFix.lat, lo = gpsFix.lon, i, d;
    var dd = function (k) { return dist(la, lo, pts[k][0], pts[k][1]); };
    var lo_i = Math.max(0, trk.retIdx - 80), hi_i = Math.min(n - 1, trk.retIdx + 10), bi = -1, bd = 1e12;
    for (i = lo_i; i <= hi_i; i++) { d = dd(i); if (d < bd) { bd = d; bi = i; } }
    if (bd > 60) { for (i = 0; i < n; i++) { d = dd(i); if (d < bd) { bd = d; bi = i; } } }   // perdido: busca na trilha toda
    trk.retIdx = bi;
    var off = bd;
    if (bi > 0) off = Math.min(off, segDist(la, lo, pts[bi - 1], pts[bi]));
    if (bi < n - 1) off = Math.min(off, segDist(la, lo, pts[bi], pts[bi + 1]));
    var t = -1;
    for (i = bi - 1; i >= 0; i--) { if (dd(i) >= LOOK_M) { t = i; break; } }
    var now = Date.now();
    if (t < 0) {
      if (!ret || !ret.arrived) vibrar([400, 150, 400]);
      ret = { arrived: true, off: off }; return;
    }
    var rem = dd(bi), gapNear = false;
    for (i = 1; i <= bi; i++) rem += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    for (i = t + 1; i <= bi; i++) if (pts[i][4]) { gapNear = true; break; }
    ret = { bearing: bearing(la, lo, pts[t][0], pts[t][1]), dist: dd(t), remaining: rem, off: off, gapNear: gapNear, target: t, idx: bi };
    if (off > 50 && now - lastVib > 60000) { lastVib = now; vibrar([200, 100, 200]); }
  }

  var NOMES = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  function renderRet() {
    if (!trk.ret) { retTxt.innerHTML = ''; return; }
    if (!ret || ret.wait || gpsStatus !== 'ok') { retTxt.innerHTML = '<span class="m">Voltando: aguardando posição do GPS…</span>'; return; }
    if (ret.arrived) { retTxt.innerHTML = '<span class="dim">✓ Você chegou ao ponto inicial da trilha.</span>'; return; }
    var h = 'Alvo: <span class="dim">' + Math.round(ret.bearing) + '° ' + NOMES[Math.round(ret.bearing / 45) % 8] + '</span> · ' + fmtDist(ret.dist);
    if (haveData) {
      var headTrue = ((Math.atan2(sinS, cosS) / rad + 360) % 360 + state.dec + 360) % 360;
      var rel = ((ret.bearing - headTrue + 540) % 360) - 180;
      h += '<br>' + (Math.abs(rel) < 10 ? 'Siga em frente' : 'Vire ' + Math.round(Math.abs(rel)) + '° à ' + (rel > 0 ? 'direita' : 'esquerda'));
    }
    h += '<br><span class="m">Até o início: ' + fmtDist(ret.remaining) + '</span>';
    h += '<br>' + (ret.off > 40 ? '<span class="w">⚠ Fora do caminho: ' + fmtDist(ret.off) + '</span>' : '<span class="m">Fora do caminho: ' + fmtDist(ret.off) + '</span>');
    if (ret.gapNear) h += '<br><span class="w">⚠ Trecho sem gravação à frente: siga em linha reta, com cuidado.</span>';
    retTxt.innerHTML = h;
  }

  // ---------- Mapa da trilha (vetor, sem tiles) ----------
  function drawMap() {
    var dpr = window.devicePixelRatio || 1, W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var c = cv.getContext('2d'), pts = trk.pts, n = pts.length;
    c.clearRect(0, 0, W, H);
    var cur = (gpsFix && gpsStatus === 'ok') ? gpsFix : null;
    if (!n && !cur) {
      c.fillStyle = '#56648a'; c.font = (13 * dpr) + 'px sans-serif'; c.textAlign = 'center';
      c.fillText('A trilha aparece aqui', W / 2, H / 2); return;
    }
    var lat0 = 0, lon0 = 0, cnt = 0, i;
    for (i = 0; i < n; i++) { lat0 += pts[i][0]; lon0 += pts[i][1]; cnt++; }
    if (cur) { lat0 += cur.lat; lon0 += cur.lon; cnt++; }
    lat0 /= cnt; lon0 /= cnt;
    var P = [], minX = 1e12, maxX = -1e12, minY = 1e12, maxY = -1e12, q;
    for (i = 0; i < n; i++) { q = xy(lat0, lon0, pts[i][0], pts[i][1]); P.push(q); }
    var all = P.slice(); var qc = null;
    if (cur) { qc = xy(lat0, lon0, cur.lat, cur.lon); all.push(qc); }
    all.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var pad = 16 * dpr, spanX = Math.max(maxX - minX, 60), spanY = Math.max(maxY - minY, 60);
    var sc = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var X = function (p) { return W / 2 + (p[0] - cx) * sc; }, Y = function (p) { return H / 2 - (p[1] - cy) * sc; };
    c.lineWidth = 2.5 * dpr; c.lineCap = 'round';
    for (i = 1; i < n; i++) {
      c.beginPath();
      if (pts[i][4]) { c.setLineDash([6 * dpr, 6 * dpr]); c.strokeStyle = '#ffb020'; } else { c.setLineDash([]); c.strokeStyle = '#4da3ff'; }
      c.moveTo(X(P[i - 1]), Y(P[i - 1])); c.lineTo(X(P[i]), Y(P[i])); c.stroke();
    }
    c.setLineDash([]);
    var dot = function (p, r, fill, stroke) {
      c.beginPath(); c.arc(X(p), Y(p), r * dpr, 0, 7); c.fillStyle = fill; c.fill();
      if (stroke) { c.lineWidth = 2 * dpr; c.strokeStyle = stroke; c.stroke(); }
    };
    if (n) { dot(P[0], 5, '#3ddc84', '#0b1220'); if (n > 1) dot(P[n - 1], 4, '#ff4d4d', '#0b1220'); }
    if (ret && ret.target != null && P[ret.target]) { c.beginPath(); c.arc(X(P[ret.target]), Y(P[ret.target]), 7 * dpr, 0, 7); c.lineWidth = 2 * dpr; c.strokeStyle = '#fff'; c.stroke(); }
    if (qc) dot(qc, 6, '#4da3ff', '#fff');
    c.fillStyle = '#8fa0bd'; c.font = (12 * dpr) + 'px sans-serif'; c.textAlign = 'left'; c.fillText('N ↑', 8 * dpr, 16 * dpr);
    c.textAlign = 'right'; c.fillText('largura ≈ ' + fmtDist((W - 2 * pad) / sc), W - 8 * dpr, 16 * dpr);
  }

  // ---------- Modo bolso ----------
  var pocketOn = false, wl = null, pTimer = null;
  function lockScreen() {
    try {
      if ('wakeLock' in navigator) {
        return navigator.wakeLock.request('screen').then(function (l) {
          wl = l; l.addEventListener('release', function () { wl = null; }); return true;
        }).catch(function () { return false; });
      }
    } catch (e) {}
    return Promise.resolve(false);
  }
  function pocketText() {
    pocketTxt.textContent = 'Modo bolso · ' + (trk.rec ? 'gravando ' + trk.pts.length + ' pontos' : (trk.ret ? 'voltando' : 'sem gravação')) +
      ' · segure 2 s para sair';
  }
  function enterPocket() {
    pocketOn = true; pocketEl.style.display = 'block'; pocketText();
    lockScreen().then(function (ok) { if (!ok) warnEl.textContent = 'Este navegador não conseguiu manter a tela acesa: o modo bolso não vai funcionar.'; });
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
  }
  function exitPocket() {
    pocketOn = false; pocketEl.style.display = 'none';
    try { if (wl) wl.release(); } catch (e) {} wl = null;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
  }
  bPocket.addEventListener('click', enterPocket);
  pocketEl.addEventListener('pointerdown', function (e) { e.preventDefault(); clearTimeout(pTimer); pTimer = setTimeout(exitPocket, 2000); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { pocketEl.addEventListener(ev, function () { clearTimeout(pTimer); }); });
  pocketEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- GPS ----------
  var gpsId = null, gpsStatus = 'off', gpsFix = null;
  try {
    var c0 = JSON.parse(localStorage.getItem('bussolaGps') || 'null');
    if (c0 && isFinite(c0.lat) && isFinite(c0.lon)) gpsFix = { lat: c0.lat, lon: c0.lon, t: c0.t, cached: true };
  } catch (e) {}

  function gpsWanted() { return state.regionIdx === 'gps' || trk.rec || trk.ret; }
  function ensureGps() {
    if (gpsWanted() && !document.hidden) startGps();
    else { stopGps(); if (!gpsWanted()) gpsStatus = 'off'; }
    renderGps();
  }
  function startGps() {
    if (!('geolocation' in navigator)) { gpsStatus = 'unavailable'; renderGps(); return; }
    if (gpsId !== null) return;
    gpsStatus = 'wait';
    // enableHighAccuracy força o chip GNSS (necessário para funcionar sem internet)
    gpsId = navigator.geolocation.watchPosition(onGps, onGpsErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 60000 });
    renderGps();
  }
  function stopGps() {
    if (gpsId !== null) { navigator.geolocation.clearWatch(gpsId); gpsId = null; }
  }
  function onGps(p) {
    var k = p.coords;
    gpsFix = { lat: k.latitude, lon: k.longitude, acc: k.accuracy, alt: k.altitude, speed: k.speed, t: p.timestamp || Date.now(), cached: false };
    gpsStatus = 'ok';
    try { localStorage.setItem('bussolaGps', JSON.stringify({ lat: gpsFix.lat, lon: gpsFix.lon, t: gpsFix.t })); } catch (e) {}
    if (trk.rec) addPoint(gpsFix);
    if (trk.ret) { updateReturn(); renderRet(); scheduleSave(); }
    mapDirty = true; mapGlDirty = true;
    updateDeclination();
    renderGps();
  }
  function onGpsErr(e) {
    gpsStatus = e.code === 1 ? 'denied' : (e.code === 2 ? 'nofix' : 'timeout');
    renderGps();
    updateDeclination();
  }

  function f5(v) { return v.toFixed(5).replace('.', ','); }
  function renderGps() {
    var h = '', live = gpsFix && !gpsFix.cached && gpsStatus === 'ok';
    if (gpsStatus === 'off') h = '<span class="m">Desligado</span>';
    else if (gpsStatus === 'unavailable') h = 'GPS indisponível neste navegador.';
    else if (gpsStatus === 'denied') h = 'Permissão negada. Libere a localização para este site no Chrome.';
    else if (!live) {
      h = (gpsStatus === 'nofix' ? 'Sem sinal.' : 'Procurando satélites…') + '<br><span class="m">Vá para um local aberto; pode levar 1 min.</span>';
    }
    if (live) {
      h = 'Lat ' + f5(gpsFix.lat) + '<br>Lon ' + f5(gpsFix.lon) +
        '<br><span class="m">±' + Math.round(gpsFix.acc) + ' m' +
        (gpsFix.alt != null ? ' · alt ' + Math.round(gpsFix.alt) + ' m' : '') + '</span>';
      if (gpsFix.speed != null && gpsFix.speed > 0.5) h += '<br><span class="m">' + (gpsFix.speed * 3.6).toFixed(1).replace('.', ',') + ' km/h</span>';
    }
    gpsTxt.innerHTML = h;
    gpsBtn.style.display = gpsWanted() ? 'none' : 'block';
  }
  gpsBtn.addEventListener('click', function () { setRegion('gps'); });

  function relock() { if (pocketOn && !wl) lockScreen(); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { saveTrk(); stopGps(); if (gpsStatus === 'ok' || gpsStatus === 'wait') gpsStatus = 'off'; renderGps(); }
    else { ensureGps(); relock(); }
  });
  window.addEventListener('pagehide', saveTrk);

  // ---------- Região / declinação ----------
  var oG = document.createElement('option'); oG.value = 'gps'; oG.textContent = '📍 GPS (automático)'; sel.appendChild(oG);
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
    } else if (state.regionIdx === 'gps') {
      if (gpsFix) {
        lat = gpsFix.lat; lon = gpsFix.lon;
        label = gpsFix.cached ? 'última posição GPS salva' : 'posição do GPS';
      } else {
        var rf = REGIOES[state.fallbackIdx]; lat = rf[1]; lon = rf[2];
        label = (gpsStatus === 'denied' ? 'GPS negado' : 'aguardando GPS') + ' — usando ' + rf[0];
      }
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
    infoEl.innerHTML = 'Declinação: <span class="dim">' + fmt(state.dec) + '</span> (' +
      (state.dec < 0 ? 'oeste' : 'leste') + ') · ' + state.label;
  }

  function setRegion(v) {
    state.regionIdx = v;
    if (typeof v === 'number') state.fallbackIdx = v;
    sel.value = String(v);
    manual.style.display = v === 'manual' ? 'flex' : 'none';
    ensureGps();
    updateDeclination();
  }

  sel.addEventListener('change', function () {
    var v = sel.value;
    setRegion(v === 'manual' || v === 'gps' ? v : parseInt(v, 10));
  });
  latIn.addEventListener('input', updateDeclination);
  lonIn.addEventListener('input', updateDeclination);
  if (state.regionIdx === 'manual') { latIn.value = state.lat || ''; lonIn.value = state.lon || ''; }

  function setMode(t) {
    state.trueNorth = t;
    bTrue.classList.toggle('on', t); bMag.classList.toggle('on', !t);
    save();
  }
  bTrue.addEventListener('click', function () { setMode(true); });
  bMag.addEventListener('click', function () { setMode(false); });
  setMode(state.trueNorth);

  // ---------- Mostrador ----------
  var tgtG;
  (function drawDial() {
    var s = '';
    s += '<circle r="196" fill="#101a2e" stroke="#26324d" stroke-width="3"/>';
    for (var a = 0; a < 360; a += 5) {
      var big = a % 30 === 0, mid = a % 10 === 0;
      var r1 = 190, r2 = big ? 168 : (mid ? 176 : 182);
      var rd = a * rad, sx = Math.sin(rd), cy = -Math.cos(rd);
      s += '<line x1="' + (sx * r1).toFixed(2) + '" y1="' + (cy * r1).toFixed(2) + '" x2="' + (sx * r2).toFixed(2) +
        '" y2="' + (cy * r2).toFixed(2) + '" stroke="' + (big ? '#e8eef9' : '#5b6b8c') + '" stroke-width="' + (big ? 3 : 1.5) + '"/>';
    }
    [['N', 0, '#ff4d4d'], ['L', 90, '#e8eef9'], ['S', 180, '#e8eef9'], ['O', 270, '#e8eef9']].forEach(function (p) {
      var rd = p[1] * rad, x = Math.sin(rd) * 138, y = -Math.cos(rd) * 138;
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 12).toFixed(1) + '" text-anchor="middle" font-size="36" font-weight="700" fill="' + p[2] + '">' + p[0] + '</text>';
    });
    [30, 60, 120, 150, 210, 240, 300, 330].forEach(function (a) {
      var rd = a * rad, x = Math.sin(rd) * 138, y = -Math.cos(rd) * 138;
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 6).toFixed(1) + '" text-anchor="middle" font-size="16" fill="#8fa0bd">' + a + '</text>';
    });
    s += '<polygon points="0,-100 9,0 -9,0" fill="#ff4d4d"/><polygon points="0,100 9,0 -9,0" fill="#5b6b8c"/><circle r="6" fill="#e8eef9"/>';
    // marcador do alvo na volta (verde), girado até o rumo do próximo ponto
    s += '<g id="tgt" visibility="hidden"><polygon points="0,-199 14,-170 -14,-170" fill="#3ddc84" stroke="#0b1220" stroke-width="2"/>' +
      '<line x1="0" y1="-168" x2="0" y2="-110" stroke="#3ddc84" stroke-width="3" stroke-dasharray="4 5"/></g>';
    dial.innerHTML = s;
    tgtG = dial.querySelector('#tgt');
  })();

  // ---------- Sensor de orientação ----------
  var sinS = 0, cosS = 1, haveData = false, shown = null;
  var tb = 0, tg = 0, haveTilt = false;   // beta/gamma suavizados (nível)

  // Rumo magnético a partir de alpha/beta/gamma (convenção W3C: Z-X'-Y'').
  // Horizontal: usa o topo do aparelho (eixo +Y). Muito inclinado/em pé: usa a traseira (eixo -Z).
  function headingFromEuler(alpha, beta, gamma) {
    var cA = Math.cos(alpha * rad), sA = Math.sin(alpha * rad);
    var cB = Math.cos(beta * rad), sB = Math.sin(beta * rad);
    var cG = Math.cos(gamma * rad), sG = Math.sin(gamma * rad);
    var east, north;
    if (Math.abs(cB * cG) > 0.5) {
      east = -sA * cB; north = cA * cB;
    } else {
      east = -(cA * sG + sA * sB * cG);
      north = -(sA * sG - cA * sB * cG);
    }
    var h = Math.atan2(east, north) / rad;
    return (h + 360) % 360;
  }

  function onOrient(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    if (e.type === 'deviceorientation' && e.absolute !== true) return;
    var h = headingFromEuler(e.alpha, e.beta, e.gamma);
    var hr = h * rad;
    if (!haveData) { sinS = Math.sin(hr); cosS = Math.cos(hr); haveData = true; }
    else {
      var k = 0.18;
      sinS += k * (Math.sin(hr) - sinS); cosS += k * (Math.cos(hr) - cosS);
    }
    if (!haveTilt) { tb = e.beta; tg = e.gamma; haveTilt = true; }
    else { tb += 0.2 * (e.beta - tb); tg += 0.2 * (e.gamma - tg); }
  }

  var hasAbs = 'ondeviceorientationabsolute' in window;
  if (hasAbs) window.addEventListener('deviceorientationabsolute', onOrient, true);
  else window.addEventListener('deviceorientation', onOrient, true);

  setTimeout(function () {
    if (!haveData) warnEl.textContent = 'Sem dados do sensor magnético. Use o Chrome no Android e permita o acesso a sensores de movimento.';
  }, 2500);

  // ---------- Nível de bolha ----------
  // beta>0: topo do aparelho levantado -> bolha sobe. gamma>0: lado direito abaixo -> bolha vai para a esquerda.
  var LVL_ESCALA = 4.6;      // unidades do SVG por grau (10° = borda)
  var lvlShown = '';
  function renderLevel() {
    if (!haveTilt) return;
    var cosT = Math.cos(tb * rad) * Math.cos(tg * rad);
    var tilt = Math.acos(Math.max(-1, Math.min(1, cosT))) / rad;
    var faceUp = cosT > 0;
    var x = -tg * LVL_ESCALA, y = -tb * LVL_ESCALA;
    var d = Math.sqrt(x * x + y * y), lim = 46;
    if (d > lim) { x *= lim / d; y *= lim / d; }
    bubble.setAttribute('cx', x.toFixed(1)); bubble.setAttribute('cy', y.toFixed(1));
    var ok = faceUp && tilt < 1;
    bubble.setAttribute('fill', ok ? '#3ddc84' : '#ff4d4d');
    var txt = !faceUp || tilt > 45 ? 'Deite o aparelho, tela para cima'
      : (ok ? 'Nivelado ✓' : 'Inclinação ' + tilt.toFixed(1).replace('.', ',') + '°');
    if (txt !== lvlShown) { lvlShown = txt; lvlTxt.textContent = txt; lvlTxt.className = ok ? 'ok' : ''; }
  }

  var lastSlow = 0;
  function frame(ts) {
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
    renderLevel();
    if (ts - lastSlow > 700) {                    // tarefas lentas: ~1,4 vezes por segundo
      lastSlow = ts;
      if (ret && ret.bearing != null && trk.ret && gpsStatus === 'ok') {
        var ang = state.trueNorth ? ret.bearing : (ret.bearing - state.dec + 360) % 360;
        tgtG.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ')'); tgtG.setAttribute('visibility', 'visible');
      } else tgtG.setAttribute('visibility', 'hidden');
      if (trk.ret) renderRet();
      if (trk.rec) renderTrk();
      if (pocketOn) pocketText();
      if (mapDirty) { mapDirty = false; drawMap(); }
      if (mapObj && mapGlDirty) { mapGlDirty = false; updateOverlays(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);


  // ---------- Mapa offline (MapLibre + PMTiles) ----------
  // O arquivo do mapa (vetorial, Nordeste até zoom 10) é baixado UMA vez, guardado no aparelho (Cache Storage)
  // e lido da memória. Nenhuma chamada de rede é feita para desenhar o mapa.
  var MAPA_URL = new URL('mapas/nordeste_z10.pmtiles', location.href).href;
  var MAPA_BYTES = 22380675, MAPA_CACHE = 'bussola-mapa-v1';
  var mapStatus = $('mapStatus'), bMapDl = $('bMapDl'), bMapOpen = $('bMapOpen'), bMapFollow = $('bMapFollow');
  var bMapFit = $('bMapFit'), bMapDel = $('bMapDel'), mapEl = $('mapGl'), mapBar2 = $('mapBar2');
  var mapState = 'unknown';     // unknown | none | downloading | ready | error
  var mapObj = null, mapFollow = true, mapGlDirty = true, mapProto = null, lblMarkers = [], lblKey = '', mapMsg = '', lastFollow = '';

  function webglOk() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('falha ao carregar ' + src)); }; document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
  function memSource(buf) {
    return { getKey: function () { return 'nordeste'; }, getBytes: function (o, l) { return Promise.resolve({ data: buf.slice(o, o + l) }); } };
  }

  function renderMap() {
    var open = !!mapObj;
    bMapDl.style.display = (mapState === 'none' || mapState === 'error') ? 'block' : 'none';
    bMapOpen.style.display = mapState === 'ready' ? 'block' : 'none';
    bMapOpen.textContent = open ? 'Fechar mapa' : 'Abrir mapa';
    bMapFollow.style.display = open ? 'block' : 'none';
    bMapFollow.textContent = 'Seguir: ' + (mapFollow ? 'sim' : 'não');
    mapBar2.style.display = mapState === 'ready' ? 'flex' : 'none';
    bMapFit.style.display = open ? 'block' : 'none';
    var t = mapMsg;
    if (!t) {
      if (mapState === 'none') t = 'Mapa não baixado. Baixe com internet (de preferência Wi-Fi); depois funciona sem rede.';
      else if (mapState === 'ready') t = open ? 'Mapa do Nordeste (offline). Detalhe de ruas locais não incluído; mapa até o zoom 10.' : 'Mapa do Nordeste baixado ✓ (funciona sem internet).';
      else if (mapState === 'unknown') t = 'Verificando…';
    }
    mapStatus.textContent = t;
  }

  function refreshMap() {
    if (!('caches' in window)) { mapState = 'error'; mapMsg = 'Este navegador não permite guardar o mapa no aparelho.'; renderMap(); return Promise.resolve(); }
    return caches.open(MAPA_CACHE).then(function (c) { return c.match(MAPA_URL); }).then(function (r) {
      mapState = r ? 'ready' : 'none'; renderMap();
    }).catch(function () { mapState = 'none'; renderMap(); });
  }

  function baixarMapa() {
    if (mapState === 'downloading') return;
    mapState = 'downloading'; mapMsg = 'Baixando o mapa… 0%'; renderMap(); bMapDl.style.display = 'none';
    fetch(MAPA_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('servidor respondeu ' + res.status);
      var rd = res.body.getReader(), chunks = [], got = 0;
      return (function pump() {
        return rd.read().then(function (x) {
          if (x.done) return;
          chunks.push(x.value); got += x.value.length;
          mapMsg = 'Baixando o mapa… ' + Math.min(99, Math.round(got * 100 / MAPA_BYTES)) + '%'; mapStatus.textContent = mapMsg;
          return pump();
        });
      })().then(function () {
        if (got !== MAPA_BYTES) throw new Error('tamanho inesperado (' + got + ' bytes)');
        var blob = new Blob(chunks, { type: 'application/octet-stream' });
        return blob.slice(0, 7).arrayBuffer().then(function (h) {
          if (new TextDecoder().decode(h) !== 'PMTiles') throw new Error('arquivo inválido');
          return caches.open(MAPA_CACHE);
        }).then(function (c) { return c.put(MAPA_URL, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } })); });
      });
    }).then(function () {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      mapMsg = ''; mapState = 'ready'; renderMap(); abrirMapa();
    }).catch(function (e) {
      mapState = 'none'; mapMsg = 'Falha ao baixar o mapa (' + (e && e.message ? e.message : e) + '). Verifique a internet e tente de novo.'; renderMap();
      bMapDl.style.display = 'block';
    });
  }

  function mapStyle() {
    var Z = function (a, b) { return ['interpolate', ['linear'], ['zoom'], 3, a, 12, b]; };
    var S = 'nordeste';
    return {
      version: 8,
      sources: { nordeste: { type: 'vector', url: 'pmtiles://nordeste', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#efece4' } },
        { id: 'earth', type: 'fill', source: S, 'source-layer': 'earth', paint: { 'fill-color': '#efece4' } },
        { id: 'landcover', type: 'fill', source: S, 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'kind'],
          'forest', '#c9e2b8', 'farmland', '#ecf1d2', 'grassland', '#dcebc3', 'scrub', '#d8e5b6', 'barren', '#e8e0c9', 'urban_area', '#e2ded6', '#efece4'] } },
        { id: 'landuse', type: 'fill', source: S, 'source-layer': 'landuse', paint: { 'fill-opacity': 0.9, 'fill-color': ['match', ['get', 'kind'],
          ['wood', 'forest'], '#c3deb0', ['national_park', 'nature_reserve', 'park', 'protected_area'], '#d3e8c4', 'wetland', '#cfe5df',
          ['sand', 'beach'], '#f3e7bf', ['residential', 'commercial', 'retail', 'university', 'hospital'], '#e4dfd6',
          ['industrial', 'military', 'railway', 'aerodrome'], '#e3dde8', ['farmland', 'meadow', 'grass', 'grassland', 'village_green', 'recreation_ground'], '#e6efcc',
          'scrub', '#dbe7bb', '#efece4'] } },
        { id: 'water', type: 'fill', source: S, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#a7cfe8' } },
        { id: 'water-line', type: 'line', source: S, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#8dbfe0', 'line-width': Z(0.6, 2.5) } },
        { id: 'boundaries', type: 'line', source: S, 'source-layer': 'boundaries', paint: { 'line-color': '#9a8fa8', 'line-dasharray': [3, 2], 'line-width': 0.9 } },
        { id: 'roads', type: 'line', source: S, 'source-layer': 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
          'line-color': ['match', ['get', 'kind'], 'highway', '#e8913a', 'major_road', '#f0bf55', 'medium_road', '#f4d98a', 'minor_road', '#ffffff',
            'path', '#a9805f', 'rail', '#777777', 'aeroway', '#c9c9c9', '#bbbbbb'],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            3, ['match', ['get', 'kind'], 'highway', 1.2, 'major_road', 0.8, 'medium_road', 0.6, 'aeroway', 0.8, 0.4],
            12, ['match', ['get', 'kind'], 'highway', 4.5, 'major_road', 3.5, 'medium_road', 3, 'aeroway', 3, 2]] } }
      ]
    };
  }

  var EMPTY = { type: 'FeatureCollection', features: [] };
  function addOverlayLayers() {
    mapObj.addSource('trk', { type: 'geojson', data: EMPTY });
    mapObj.addSource('pts', { type: 'geojson', data: EMPTY });
    mapObj.addLayer({ id: 'trk-solid', type: 'line', source: 'trk', filter: ['==', ['get', 'g'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1565ff', 'line-width': 4 } });
    mapObj.addLayer({ id: 'trk-gap', type: 'line', source: 'trk', filter: ['==', ['get', 'g'], 1], paint: { 'line-color': '#ff8c00', 'line-width': 3, 'line-dasharray': [2, 2] } });
    mapObj.addLayer({ id: 'pts-c', type: 'circle', source: 'pts', paint: {
      'circle-radius': ['match', ['get', 't'], 'pos', 8, 'start', 7, 'tgt', 9, 5],
      'circle-color': ['match', ['get', 't'], 'pos', '#0a84ff', 'start', '#2ecc71', 'tgt', 'rgba(61,220,132,0.25)', '#ff4d4d'],
      'circle-stroke-color': ['match', ['get', 't'], 'tgt', '#1f7a4a', '#ffffff'],
      'circle-stroke-width': ['match', ['get', 't'], 'pos', 3, 2] } });
  }

  function updateOverlays() {
    if (!mapObj || !mapObj.getSource('trk') || !mapObj.getSource('pts')) return;
    var pts = trk.pts, n = pts.length, solid = [], gap = [], cur = null, i, pt, prev = null, feats = [];
    for (i = 0; i < n; i++) {
      pt = [pts[i][1], pts[i][0]];
      if (i === 0 || pts[i][4]) { if (i > 0) gap.push([prev, pt]); cur = [pt]; solid.push(cur); } else cur.push(pt);
      prev = pt;
    }
    var lines = [];
    var sl = solid.filter(function (l) { return l.length > 1; });
    if (sl.length) lines.push({ type: 'Feature', properties: { g: 0 }, geometry: { type: 'MultiLineString', coordinates: sl } });
    if (gap.length) lines.push({ type: 'Feature', properties: { g: 1 }, geometry: { type: 'MultiLineString', coordinates: gap } });
    mapObj.getSource('trk').setData({ type: 'FeatureCollection', features: lines });
    if (n) feats.push({ type: 'Feature', properties: { t: 'start' }, geometry: { type: 'Point', coordinates: [pts[0][1], pts[0][0]] } });
    if (n > 1) feats.push({ type: 'Feature', properties: { t: 'end' }, geometry: { type: 'Point', coordinates: [pts[n - 1][1], pts[n - 1][0]] } });
    if (trk.ret && ret && ret.target != null && pts[ret.target]) feats.push({ type: 'Feature', properties: { t: 'tgt' }, geometry: { type: 'Point', coordinates: [pts[ret.target][1], pts[ret.target][0]] } });
    var live = gpsFix && !gpsFix.cached && gpsStatus === 'ok';
    if (live) feats.push({ type: 'Feature', properties: { t: 'pos' }, geometry: { type: 'Point', coordinates: [gpsFix.lon, gpsFix.lat] } });
    mapObj.getSource('pts').setData({ type: 'FeatureCollection', features: feats });
    if (mapFollow && live) {
      var k = gpsFix.lat.toFixed(5) + ',' + gpsFix.lon.toFixed(5);
      if (k !== lastFollow) { lastFollow = k; mapObj.easeTo({ center: [gpsFix.lon, gpsFix.lat], duration: 500 }); }
    }
  }

  // Nomes de lugares como rótulos HTML (fonte do sistema): evita baixar arquivos de fonte do mapa.
  function updateLabels() {
    if (!mapObj || !mapObj.isStyleLoaded()) return;
    var c = mapObj.getCenter(), z = mapObj.getZoom(), key = z.toFixed(2) + '|' + c.lng.toFixed(3) + '|' + c.lat.toFixed(3);
    if (key === lblKey) return; lblKey = key;
    lblLoop();
  }
  function lblLoop() {
    lblMarkers.forEach(function (m) { m.remove(); }); lblMarkers = [];
    var z = mapObj.getZoom(), b = mapObj.getBounds(), seen = {}, cand = [];
    var fs = [];
    try { fs = mapObj.querySourceFeatures('nordeste', { sourceLayer: 'places' }); } catch (e) {}
    fs.forEach(function (f) {
      var p = f.properties || {}, k = p.kind;
      if (!p.name || seen[p.name]) return;
      if (k === 'region') { if (z > 7.5) return; }
      else if (k === 'macrohood') { if (z < 11) return; }
      else if (k === 'locality') { if (p.min_zoom != null && p.min_zoom > z + 0.5) return; }
      else return;
      var co = f.geometry && f.geometry.coordinates; if (!co || !b.contains(co)) return;
      seen[p.name] = 1; cand.push({ n: p.name, c: co, r: (p.population_rank || 0) + (k === 'region' ? 100 : 0), k: k });
    });
    cand.sort(function (a, b2) { return b2.r - a.r; });
    var boxes = [], cnt = 0;
    for (var i = 0; i < cand.length && cnt < 24; i++) {
      var o = cand[i], px = mapObj.project(o.c), w = o.n.length * 7 + 14, h = 16;
      var box = [px.x, px.y - h / 2, px.x + w, px.y + h / 2], clash = false;
      for (var j = 0; j < boxes.length; j++) { var q = boxes[j]; if (box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) { clash = true; break; } }
      if (clash) continue;
      boxes.push(box); cnt++;
      var el = document.createElement('div'); el.className = 'plbl' + (o.k === 'region' ? ' reg' : ' dot'); el.textContent = o.n;
      lblMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(o.c).addTo(mapObj));
    }
  }

  function fitInicial() {
    var pts = trk.pts, live = gpsFix && !gpsFix.cached && gpsStatus === 'ok';
    if (live) { mapObj.jumpTo({ center: [gpsFix.lon, gpsFix.lat], zoom: 12 }); return; }
    if (pts.length > 1) { fitTrilha(0); return; }
    if (gpsFix) { mapObj.jumpTo({ center: [gpsFix.lon, gpsFix.lat], zoom: 9 }); return; }
    var r = typeof state.regionIdx === 'number' ? REGIOES[state.regionIdx] : null;
    if (r) mapObj.jumpTo({ center: [r[2], r[1]], zoom: 8 }); else mapObj.jumpTo({ center: [-41.75, -9.7], zoom: 4.5 });
  }
  function fitTrilha(dur) {
    var pts = trk.pts; if (!mapObj || pts.length < 2) return;
    var b = new maplibregl.LngLatBounds([pts[0][1], pts[0][0]], [pts[0][1], pts[0][0]]);
    pts.forEach(function (p) { b.extend([p[1], p[0]]); });
    mapObj.fitBounds(b, { padding: 40, maxZoom: 13, duration: dur });
  }

  function abrirMapa() {
    if (mapObj) return;
    if (!webglOk()) { mapMsg = 'Este navegador não suporta WebGL: use o mapa simples da trilha (acima).'; renderMap(); return; }
    mapMsg = 'Abrindo mapa…'; renderMap();
    caches.open(MAPA_CACHE).then(function (c) { return c.match(MAPA_URL); }).then(function (r) {
      if (!r) { mapState = 'none'; mapMsg = ''; renderMap(); return null; }
      return r.arrayBuffer();
    }).then(function (buf) {
      if (!buf) return;
      loadCss('libs/maplibre-gl.css');
      return (window.maplibregl ? Promise.resolve() : loadScript('libs/maplibre-gl.js'))
        .then(function () { return window.pmtiles ? null : loadScript('libs/pmtiles.js'); })
        .then(function () {
          if (!mapProto) { mapProto = new pmtiles.Protocol(); maplibregl.addProtocol('pmtiles', mapProto.tile); }
          mapProto.add(new pmtiles.PMTiles(memSource(buf)));
          mapEl.style.display = 'block';
          mapObj = new maplibregl.Map({ container: mapEl, style: mapStyle(), center: [-41.75, -9.7], zoom: 4.5, minZoom: 3, maxZoom: 13,
            dragRotate: false, attributionControl: { compact: true }, fadeDuration: 0 });
          mapObj.touchZoomRotate.disableRotation();
          mapObj.on('load', function () { addOverlayLayers(); fitInicial(); mapGlDirty = true; mapMsg = ''; renderMap(); updateLabels(); });
          mapObj.on('moveend', updateLabels);
          mapObj.on('idle', updateLabels);
          mapObj.on('dragstart', function () { if (mapFollow) { mapFollow = false; renderMap(); } });
          mapObj.on('error', function (e) { if (e && e.error && !/AbortError/.test(String(e.error))) { mapMsg = 'Erro no mapa: ' + (e.error.message || e.error); renderMap(); } });
          try { localStorage.setItem('bussolaMapaAberto', '1'); } catch (e) {}
          mapMsg = ''; renderMap();
        });
    }).catch(function (e) { mapMsg = 'Não foi possível abrir o mapa (' + (e && e.message ? e.message : e) + ').'; renderMap(); });
  }
  function fecharMapa() {
    if (!mapObj) return;
    lblMarkers.forEach(function (m) { m.remove(); }); lblMarkers = []; lblKey = '';
    mapObj.remove(); mapObj = null; mapEl.style.display = 'none'; mapMsg = '';
    try { localStorage.setItem('bussolaMapaAberto', '0'); } catch (e) {}
    renderMap();
  }
  var delArm = 0;
  function removerMapa() {
    if (Date.now() - delArm > 4000) {
      delArm = Date.now(); bMapDel.textContent = 'Toque de novo p/ remover';
      setTimeout(function () { bMapDel.textContent = 'Remover mapa'; }, 4000); return;
    }
    delArm = 0; bMapDel.textContent = 'Remover mapa';
    fecharMapa();
    caches.delete(MAPA_CACHE).then(function () { mapState = 'none'; mapMsg = ''; renderMap(); });
  }

  bMapDl.addEventListener('click', baixarMapa);
  bMapOpen.addEventListener('click', function () { if (mapObj) fecharMapa(); else abrirMapa(); });
  bMapFollow.addEventListener('click', function () { mapFollow = !mapFollow; lastFollow = ''; renderMap(); mapGlDirty = true; });
  bMapFit.addEventListener('click', function () { mapFollow = false; renderMap(); fitTrilha(600); });
  bMapDel.addEventListener('click', removerMapa);
  refreshMap().then(function () {
    try { if (mapState === 'ready' && localStorage.getItem('bussolaMapaAberto') === '1') abrirMapa(); } catch (e) {}
  });

  // ---------- Inicialização ----------
  setRegion(state.regionIdx);
  renderTrk(); renderRet();
  if (trk.ret) { updateReturn(); renderRet(); }

  // ---------- Offline (service worker) ----------
  if ('serviceWorker' in navigator) {
    var hadCtl = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadCtl && !reloaded) { reloaded = true; location.reload(); }   // nova versão assumiu: recarrega uma vez
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
