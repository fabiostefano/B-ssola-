/* World Magnetic Model 2025 (WMM2025) - implementação em JavaScript, 100% offline.
 * Coeficientes: NOAA NCEI / BGS (WMM.COF, válido 2025.0-2030.0).
 * Uso: WMM.compute(latGraus, lonGraus, altKm, anoDecimal) -> {dec, inc, h, f, x, y, z}
 * Declinação positiva = leste. */
(function (root) {
  'use strict';
  var EPOCH = 2025.0;
  var VALID_UNTIL = 2030.0;
  // [n, m, g, h, gDot, hDot]
  var RAW = [[1,0,-29351.8,0.0,12.0,0.0],[1,1,-1410.8,4545.4,9.7,-21.5],[2,0,-2556.6,0.0,-11.6,0.0],[2,1,2951.1,-3133.6,-5.2,-27.7],[2,2,1649.3,-815.1,-8.0,-12.1],[3,0,1361.0,0.0,-1.3,0.0],[3,1,-2404.1,-56.6,-4.2,4.0],[3,2,1243.8,237.5,0.4,-0.3],[3,3,453.6,-549.5,-15.6,-4.1],[4,0,895.0,0.0,-1.6,0.0],[4,1,799.5,278.6,-2.4,-1.1],[4,2,55.7,-133.9,-6.0,4.1],[4,3,-281.1,212.0,5.6,1.6],[4,4,12.1,-375.6,-7.0,-4.4],[5,0,-233.2,0.0,0.6,0.0],[5,1,368.9,45.4,1.4,-0.5],[5,2,187.2,220.2,0.0,2.2],[5,3,-138.7,-122.9,0.6,0.4],[5,4,-142.0,43.0,2.2,1.7],[5,5,20.9,106.1,0.9,1.9],[6,0,64.4,0.0,-0.2,0.0],[6,1,63.8,-18.4,-0.4,0.3],[6,2,76.9,16.8,0.9,-1.6],[6,3,-115.7,48.8,1.2,-0.4],[6,4,-40.9,-59.8,-0.9,0.9],[6,5,14.9,10.9,0.3,0.7],[6,6,-60.7,72.7,0.9,0.9],[7,0,79.5,0.0,-0.0,0.0],[7,1,-77.0,-48.9,-0.1,0.6],[7,2,-8.8,-14.4,-0.1,0.5],[7,3,59.3,-1.0,0.5,-0.8],[7,4,15.8,23.4,-0.1,0.0],[7,5,2.5,-7.4,-0.8,-1.0],[7,6,-11.1,-25.1,-0.8,0.6],[7,7,14.2,-2.3,0.8,-0.2],[8,0,23.2,0.0,-0.1,0.0],[8,1,10.8,7.1,0.2,-0.2],[8,2,-17.5,-12.6,0.0,0.5],[8,3,2.0,11.4,0.5,-0.4],[8,4,-21.7,-9.7,-0.1,0.4],[8,5,16.9,12.7,0.3,-0.5],[8,6,15.0,0.7,0.2,-0.6],[8,7,-16.8,-5.2,-0.0,0.3],[8,8,0.9,3.9,0.2,0.2],[9,0,4.6,0.0,-0.0,0.0],[9,1,7.8,-24.8,-0.1,-0.3],[9,2,3.0,12.2,0.1,0.3],[9,3,-0.2,8.3,0.3,-0.3],[9,4,-2.5,-3.3,-0.3,0.3],[9,5,-13.1,-5.2,0.0,0.2],[9,6,2.4,7.2,0.3,-0.1],[9,7,8.6,-0.6,-0.1,-0.2],[9,8,-8.7,0.8,0.1,0.4],[9,9,-12.9,10.0,-0.1,0.1],[10,0,-1.3,0.0,0.1,0.0],[10,1,-6.4,3.3,0.0,0.0],[10,2,0.2,0.0,0.1,-0.0],[10,3,2.0,2.4,0.1,-0.2],[10,4,-1.0,5.3,-0.0,0.1],[10,5,-0.6,-9.1,-0.3,-0.1],[10,6,-0.9,0.4,0.0,0.1],[10,7,1.5,-4.2,-0.1,0.0],[10,8,0.9,-3.8,-0.1,-0.1],[10,9,-2.7,0.9,-0.0,0.2],[10,10,-3.9,-9.1,-0.0,-0.0],[11,0,2.9,0.0,0.0,0.0],[11,1,-1.5,0.0,-0.0,-0.0],[11,2,-2.5,2.9,0.0,0.1],[11,3,2.4,-0.6,0.0,-0.0],[11,4,-0.6,0.2,0.0,0.1],[11,5,-0.1,0.5,-0.1,-0.0],[11,6,-0.6,-0.3,0.0,-0.0],[11,7,-0.1,-1.2,-0.0,0.1],[11,8,1.1,-1.7,-0.1,-0.0],[11,9,-1.0,-2.9,-0.1,0.0],[11,10,-0.2,-1.8,-0.1,0.0],[11,11,2.6,-2.3,-0.1,0.0],[12,0,-2.0,0.0,0.0,0.0],[12,1,-0.2,-1.3,0.0,-0.0],[12,2,0.3,0.7,-0.0,0.0],[12,3,1.2,1.0,-0.0,-0.1],[12,4,-1.3,-1.4,-0.0,0.1],[12,5,0.6,-0.0,-0.0,-0.0],[12,6,0.6,0.6,0.1,-0.0],[12,7,0.5,-0.1,-0.0,-0.0],[12,8,-0.1,0.8,0.0,0.0],[12,9,-0.4,0.1,0.0,-0.0],[12,10,-0.2,-1.0,-0.1,-0.0],[12,11,-1.3,0.1,-0.0,0.0],[12,12,-0.7,0.2,-0.1,-0.1]];
  var N = 12;
  var COF = [];
  for (var n = 0; n <= N; n++) COF.push([]);
  RAW.forEach(function (r) { COF[r[0]][r[1]] = [r[2], r[3], r[4], r[5]]; });

  function compute(latDeg, lonDeg, altKm, year) {
    var rad = Math.PI / 180;
    var a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f), re = 6371.2;
    var lat = latDeg * rad, lon = lonDeg * rad;
    var sl = Math.sin(lat), cl = Math.cos(lat);
    var Rc = a / Math.sqrt(1 - e2 * sl * sl);
    var p = (Rc + altKm) * cl, z = (Rc * (1 - e2) + altKm) * sl;
    var r = Math.sqrt(p * p + z * z);
    var latp = Math.asin(z / r);            // latitude geocêntrica
    var x = Math.sin(latp), c = Math.cos(latp);

    // Funções de Legendre (Schmidt semi-normalizadas) e derivadas em relação a latp
    var P = [], dP = [], i, j;
    for (i = 0; i <= N; i++) {
      P.push(new Array(N + 1).fill(0));
      dP.push(new Array(N + 1).fill(0));
    }
    P[0][0] = 1;
    for (var nn = 1; nn <= N; nn++) {
      for (var m = 0; m <= nn; m++) {
        if (nn === m) {
          var k = nn === 1 ? 1 : Math.sqrt((2 * nn - 1) / (2 * nn));
          P[nn][nn] = k * c * P[nn - 1][nn - 1];
          dP[nn][nn] = k * (c * dP[nn - 1][nn - 1] - x * P[nn - 1][nn - 1]);
        } else {
          var d = Math.sqrt((nn + m) * (nn - m));
          var e = Math.sqrt((nn - 1 + m) * (nn - 1 - m));
          var p2 = nn >= 2 ? P[nn - 2][m] : 0;
          var dp2 = nn >= 2 ? dP[nn - 2][m] : 0;
          P[nn][m] = ((2 * nn - 1) * x * P[nn - 1][m] - e * p2) / d;
          dP[nn][m] = ((2 * nn - 1) * (x * dP[nn - 1][m] + c * P[nn - 1][m]) - e * dp2) / d;
        }
      }
    }

    var dt = year - EPOCH;
    var Xp = 0, Yp = 0, Zp = 0, ratio = re / r;
    for (var n2 = 1; n2 <= N; n2++) {
      var rn = Math.pow(ratio, n2 + 2);
      for (var m2 = 0; m2 <= n2; m2++) {
        var co = COF[n2][m2];
        var g = co[0] + co[2] * dt, h = co[1] + co[3] * dt;
        var cm = Math.cos(m2 * lon), sm = Math.sin(m2 * lon);
        Xp -= rn * (g * cm + h * sm) * dP[n2][m2];
        Yp += rn * m2 * (g * sm - h * cm) * P[n2][m2];
        Zp -= (n2 + 1) * rn * (g * cm + h * sm) * P[n2][m2];
      }
    }
    Yp = Yp / (Math.abs(c) < 1e-9 ? 1e-9 : c);

    var dlat = latp - lat;
    var X = Xp * Math.cos(dlat) - Zp * Math.sin(dlat);
    var Y = Yp;
    var Z = Xp * Math.sin(dlat) + Zp * Math.cos(dlat);
    var H = Math.sqrt(X * X + Y * Y);
    return {
      dec: Math.atan2(Y, X) / rad,
      inc: Math.atan2(Z, H) / rad,
      h: H, f: Math.sqrt(H * H + Z * Z), x: X, y: Y, z: Z
    };
  }

  function decimalYear(date) {
    var y = date.getUTCFullYear();
    var start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
    return y + (date.getTime() - start) / (end - start);
  }

  var api = { compute: compute, decimalYear: decimalYear, EPOCH: EPOCH, VALID_UNTIL: VALID_UNTIL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WMM = api;
})(typeof self !== 'undefined' ? self : this);
