// ═══════════════════════════════════════════════════════════════
// GEODÉSIA DE PLANEJAMENTO — loxodromia (rumo constante) em esfera
// ═══════════════════════════════════════════════════════════════
// As pernas do Plano de Viagem são loxodromias (geometryType="Loxodrome" no RTZ):
// rumo constante, retas na projeção de Mercator. Distâncias em milhas náuticas.
// Esfera de raio médio — precisão de planejamento (erro < 0,5% frente ao elipsoide WGS-84).

export interface LatLon {
  lat: number; // graus, + norte
  lon: number; // graus, + leste
}

/** Raio terrestre médio em milhas náuticas (6 371 km / 1,852). */
export const RAIO_TERRA_NM = 3440.065;

const RAD = Math.PI / 180;

/** Ordenada de Mercator (adimensional) — a loxodromia é reta em (lon, y). */
export function mercatorY(latDeg: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latDeg * RAD) / 2));
}

export function latDeMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
}

/** Ponto a uma fração t ∈ [0,1] da loxodromia a→b. */
export function pontoNaLoxodromia(a: LatLon, b: LatLon, t: number): LatLon {
  if (Math.abs(b.lat - a.lat) < 1e-12) {
    return { lat: a.lat, lon: a.lon + t * (b.lon - a.lon) };
  }
  const ya = mercatorY(a.lat);
  const yb = mercatorY(b.lat);
  return { lat: latDeMercatorY(ya + t * (yb - ya)), lon: a.lon + t * (b.lon - a.lon) };
}

/** Distância loxodrômica (NM) e rumo verdadeiro (graus, 0–360) de a para b. */
export function loxodromia(a: LatLon, b: LatLon): { distanciaNm: number; rumoDeg: number } {
  const f1 = a.lat * RAD;
  const f2 = b.lat * RAD;
  const df = f2 - f1;
  const dl = (b.lon - a.lon) * RAD; // o recorte da costa brasileira não cruza o antimeridiano
  const dpsi = mercatorY(b.lat) - mercatorY(a.lat);
  const q = Math.abs(dpsi) > 1e-12 ? df / dpsi : Math.cos(f1);
  const distancia = Math.sqrt(df * df + q * q * dl * dl) * RAIO_TERRA_NM;
  let rumo = Math.atan2(dl, dpsi) / RAD;
  if (rumo < 0) rumo += 360;
  return { distanciaNm: distancia, rumoDeg: rumo };
}

/** Formata latitude/longitude em graus e minutos decimais (padrão de carta náutica). */
export function formatarLatLonDM(p: LatLon): string {
  const fmt = (v: number, pos: string, neg: string, larg: number) => {
    const hemi = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    let g = Math.floor(abs);
    let m = (abs - g) * 60;
    if (m >= 59.9995) { g += 1; m = 0; }
    return `${String(g).padStart(larg, '0')}°${m.toFixed(3).padStart(6, '0')}'${hemi}`;
  };
  return `${fmt(p.lat, 'N', 'S', 2)} ${fmt(p.lon, 'E', 'W', 3)}`;
}
