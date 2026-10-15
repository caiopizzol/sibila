// Gera app/br-map.js com o contorno de cada UF em SVG, a partir da malha do IBGE (qualidade
// mínima). Projeção equiretangular com a longitude corrigida pela latitude média do Brasil.
// Uso: curl -o br-uf.geojson "<URL_IBGE abaixo>" && node scripts/build_map.mjs br-uf.geojson
// (o servidor do IBGE não envia a cadeia de certificados completa; o curl do macOS lida com
// isso, o fetch do Node não)
import { readFileSync, writeFileSync } from "node:fs";

const URL_IBGE = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF";
const UF = { 11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF" };
const NAMES = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins" };

const geo = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : await (await fetch(URL_IBGE)).json();
const rings = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const f of geo.features) for (const r of rings(f.geometry)) for (const [x, y] of r) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
const W = 600, scale = W / ((maxX - minX) * k), H = Math.ceil((maxY - minY) * scale);
const px = ([x, y]) => [((x - minX) * k * scale).toFixed(1), ((maxY - y) * scale).toFixed(1)];

const paths = {};
for (const f of geo.features) {
  const uf = UF[f.properties.codarea];
  paths[uf] = rings(f.geometry).map((r) => {
    const pts = [];
    for (const p of r.map(px)) if (!pts.length || pts.at(-1)[0] !== p[0] || pts.at(-1)[1] !== p[1]) pts.push(p);
    return "M" + pts.map((p) => p.join(",")).join("L") + "Z";
  }).join("");
}
const out = `// Gerado por scripts/build_map.mjs a partir da malha do IBGE. Não editar à mão.
export const BR_MAP = ${JSON.stringify({ width: W, height: H, names: NAMES, paths })};
`;
writeFileSync(new URL("../app/br-map.js", import.meta.url), out);
console.log(`app/br-map.js: ${Object.keys(paths).length} UFs, ${W}x${H}, ${(out.length / 1024).toFixed(0)} KB`);
