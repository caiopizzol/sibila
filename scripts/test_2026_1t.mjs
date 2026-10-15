// Teste fora da amostra e base da demonstração: o confronto Lula x Flávio no 1º turno de 2026,
// projetado a partir dos resultados de 2022 por seção, na ordem real de apuração de 2026.
//  - alvo: votos de 13 e 22 no 1º turno de 2026 (dados abertos do TSE)
//  - base: % de Lula na seção em 2022 (--base 2t: Lula/(Lula+Bolsonaro) no 2º turno;
//    --base 1t: Lula/todos os votos no 1º turno), casada por UF, município, zona e seção;
//    seções novas recebem a média da zona, do município ou da UF em 2022
//  - tamanho esperado: eleitores aptos de 2026, conhecidos antes da eleição
//  - ordem: horário da primeira totalização de cada seção (DT_PRIM_TOT_PARCIAL_HOR_TSE)
// Entrada: data/2026/secoes_1t.csv, gerado dos dados abertos de 2026 (votacao_secao_2026_BR e
// detalhe_votacao_secao_2026; ver README). Saída no layout do motor, em --out.
// Uso: node scripts/test_2026_1t.mjs --base 2t [--out data/test-2026-1t-2t/]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadData } from "../app/engine.js";

const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = opt("base", "2t");
const ROOT = new URL("../", import.meta.url).pathname;
const OUT = opt("out", ROOT + `data/test-2026-1t-${BASE}/`).replace(/\/?$/, "/");
const key = (uf, mun, zona, sec) => `${uf.toLowerCase()}|${Number(mun)}|${Number(zona)}|${Number(sec)}`;

// 2022: % de Lula por seção
const buf = readFileSync(ROOT + "app/data/sections.bin");
const D = loadData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), JSON.parse(readFileSync(ROOT + "app/data/meta.json", "utf8")));
const base22 = new Map();
for (let s = 0; s < D.N; s++) {
  const z = D.anc[3][s], m = D.parent[3][z], uf = D.ufNames[D.parent[2][m]];
  const w = BASE === "2t" ? D.lula[s] + D.bolso[s] : D.t1[s];
  if (w > 0) base22.set(key(uf, D.muniCode[m], D.zoneNr[z], D.secNr[s]), { x: (BASE === "2t" ? D.lula[s] : D.t1lula[s]) / w, w });
}

// 2026: uma linha por seção (uf, mun, zona, secao, lv, lula, flavio, aptos, sec)
const lines = readFileSync(ROOT + "data/2026/secoes_1t.csv", "utf8").trim().split("\n");
const head = lines.shift().split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], head[i] === "uf" || head[i] === "mun" ? v : Number(v)])));

// Base de 2022 para seções novas: média da zona, do município ou da UF
const acc = (m, k, x, w) => { const a = m.get(k) ?? [0, 0]; a[0] += x * w; a[1] += w; m.set(k, a); };
const byZone = new Map(), byMun = new Map(), byUf = new Map();
let matched = 0;
for (const r of rows) {
  r.base = base22.get(key(r.uf, r.mun, r.zona, r.secao));
  if (!r.base) continue;
  matched++;
  acc(byZone, `${r.uf}|${r.mun}|${r.zona}`, r.base.x, r.base.w); acc(byMun, `${r.uf}|${r.mun}`, r.base.x, r.base.w); acc(byUf, r.uf, r.base.x, r.base.w);
}
const avg = (m, k) => { const a = m.get(k); return a && a[1] > 0 ? a[0] / a[1] : null; };

// Monta a base no layout do motor
rows.sort((a, b) => (a.uf < b.uf ? -1 : a.uf > b.uf ? 1 : a.mun < b.mun ? -1 : a.mun > b.mun ? 1 : a.zona - b.zona || a.lv - b.lv || a.secao - b.secao));
const ufs = [], munis = [], zoneMuni = [], zoneNr = [], localZone = [];
const ufIdx = new Map(), muniIdx = new Map(), zoneIdx = new Map(), localIdx = new Map();
const N = rows.length, clip = (v) => Math.max(0, Math.min(65535, Math.round(v)));
const secLocal = new Uint32Array(N), arrival = new Uint32Array(N);
const t1 = new Uint16Array(N), t1a = new Uint16Array(N), lula = new Uint16Array(N), bolso = new Uint16Array(N), aptos = new Uint16Array(N), secNr = new Uint16Array(N);
const lastArr = rows.reduce((m, r) => Math.max(m, r.sec || 0), 0);
rows.forEach((r, s) => {
  const U = r.uf.toUpperCase();
  if (!ufIdx.has(U)) { ufIdx.set(U, ufs.length); ufs.push(U); }
  const mk = `${r.uf}|${r.mun}`;
  if (!muniIdx.has(mk)) { muniIdx.set(mk, munis.length); munis.push([r.mun, ufIdx.get(U), r.mun]); }
  const zk = `${mk}|${r.zona}`;
  if (!zoneIdx.has(zk)) { zoneIdx.set(zk, zoneMuni.length); zoneMuni.push(muniIdx.get(mk)); zoneNr.push(r.zona); }
  const lk = `${zk}|${r.lv}`;
  if (!localIdx.has(lk)) { localIdx.set(lk, localZone.length); localZone.push(zoneIdx.get(zk)); }
  secLocal[s] = localIdx.get(lk);
  const x = r.base?.x ?? avg(byZone, `${r.uf}|${r.mun}|${r.zona}`) ?? avg(byMun, `${r.uf}|${r.mun}`) ?? avg(byUf, r.uf) ?? 0.5;
  t1[s] = clip(r.aptos); t1a[s] = clip(x * r.aptos); // tamanho = aptos de 2026; x = % de Lula em 2022
  lula[s] = clip(r.lula); bolso[s] = clip(r.flavio); aptos[s] = clip(r.aptos); secNr[s] = r.secao;
  arrival[s] = Number.isFinite(r.sec) && r.sec > 0 ? r.sec : lastArr + 60;
});
mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "sections.bin", Buffer.concat([secLocal, arrival, t1, t1a, lula, bolso, aptos, secNr].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
const L = rows.reduce((a, r) => a + r.lula, 0), B = rows.reduce((a, r) => a + r.flavio, 0);
writeFileSync(OUT + "meta.json", JSON.stringify({ nSections: N, ufs, munis, zoneMuni, zoneNr, localZone, final: { lula: L, bolso: B } }));
console.log(`base ${BASE}: ${N} seções, ${matched} casadas com 2022 (${((100 * matched) / N).toFixed(1)}%) | Lula ${((100 * L) / (L + B)).toFixed(2)}% do confronto -> ${OUT}`);
