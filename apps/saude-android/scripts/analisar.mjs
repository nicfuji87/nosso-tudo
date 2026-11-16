#!/usr/bin/env node
// Analisa uma sessão da Fase 1: qualidade do IBI, HRV (RMSSD) por janela de 5 min,
// movimento (acelerômetro) e consumo de bateria.
// Uso: node scripts/analisar.mjs dados/files/sessoes/20261115-120000
//      (sem argumento: usa a sessão mais recente)
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
let pasta = process.argv[2];
if (!pasta) {
  const base = path.join(raiz, "dados", "files", "sessoes");
  const todas = fs.existsSync(base) ? fs.readdirSync(base).sort() : [];
  if (!todas.length) { console.error("Nenhuma sessão em dados/files/sessoes. Rode scripts/puxar-dados.ps1 antes."); process.exit(1); }
  pasta = path.join(base, todas.at(-1));
}

function lerCsv(arquivo) {
  const p = path.join(pasta, arquivo);
  if (!fs.existsSync(p)) return null;
  const linhas = fs.readFileSync(p, "utf8").trim().split(/\r?\n/);
  const cab = linhas.shift().split(",");
  return { cab, linhas: linhas.map((l) => l.split(",")) };
}
const col = (cab, re) => cab.findIndex((c) => re.test(c));
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "-" : n.toFixed(d));
const JANELA_MS = 5 * 60 * 1000;

console.log(`\nSessão: ${pasta}\n`);

// ---------- Taxa de amostragem por arquivo ----------
for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith("_continuous.csv"))) {
  const t = lerCsv(arq);
  if (!t || !t.linhas.length) { console.log(`${arq}: vazio`); continue; }
  const ts = t.linhas.map((l) => Number(l[0]));
  const dur = (ts.at(-1) - ts[0]) / 1000;
  console.log(`${arq}: ${t.linhas.length} amostras em ${fmt(dur / 60)} min (≈${fmt(t.linhas.length / dur, 2)} Hz) · colunas: ${t.cab.slice(2).join(" ")}`);
}

// ---------- Movimento por janela ----------
const movimento = new Map();
const acel = lerCsv("accelerometer_continuous.csv");
if (acel) {
  const [ix, iy, iz] = [/_X$/, /_Y$/, /_Z$/].map((re) => col(acel.cab, re));
  const porJanela = new Map();
  for (const l of acel.linhas) {
    const j = Math.floor(Number(l[0]) / JANELA_MS);
    const m = Math.hypot(Number(l[ix]), Number(l[iy]), Number(l[iz]));
    if (!Number.isFinite(m)) continue;
    (porJanela.get(j) ?? porJanela.set(j, []).get(j)).push(m);
  }
  for (const [j, ms] of porJanela) {
    const media = ms.reduce((a, b) => a + b, 0) / ms.length;
    movimento.set(j, Math.sqrt(ms.reduce((a, b) => a + (b - media) ** 2, 0) / ms.length));
  }
}

// ---------- IBI / HRV ----------
const hr = lerCsv("heart_rate_continuous.csv");
const janelas = new Map();
if (hr) {
  const iHr = col(hr.cab, /\.HEART_RATE$/);
  const iIbi = col(hr.cab, /IBI_LIST$/);
  const iIbiSt = col(hr.cab, /IBI_STATUS/);
  let anterior = null, totalIbi = 0, validos = 0;
  for (const l of hr.linhas) {
    const ts = Number(l[0]);
    const j = Math.floor(ts / JANELA_MS);
    const w = janelas.get(j) ?? janelas.set(j, { hr: [], ibi: [], difs: [], total: 0 }).get(j);
    const bpm = Number(l[iHr]);
    if (bpm > 0) w.hr.push(bpm);
    const ibis = iIbi >= 0 && l[iIbi] ? l[iIbi].split("|").map(Number) : [];
    const sts = iIbiSt >= 0 && l[iIbiSt] ? l[iIbiSt].split("|").map(Number) : [];
    ibis.forEach((ibi, k) => {
      totalIbi++; w.total++;
      const ok = (sts.length ? sts[k] === 0 : true) && ibi >= 300 && ibi <= 2000 &&
        (anterior == null || Math.abs(ibi - anterior) / anterior <= 0.2);
      if (!ok) { anterior = null; return; }
      if (anterior != null) w.difs.push(ibi - anterior);
      w.ibi.push(ibi); validos++; anterior = ibi;
    });
  }
  console.log(`\nIBI: ${validos}/${totalIbi} batimentos válidos (${fmt((100 * validos) / Math.max(totalIbi, 1))}%)`);
}

const linhasSaida = ["inicio,bpm_medio,ibi_validos,ibi_total,cobertura_pct,rmssd_ms,movimento,qualidade"];
const resumo = { boa: 0, fraca: 0, ruim: 0 };
console.log("\nJanela   bpm   válidos  cobertura  RMSSD  movimento  qualidade");
for (const [j, w] of [...janelas].sort((a, b) => a[0] - b[0])) {
  const cobertura = w.ibi.reduce((a, b) => a + b, 0) / JANELA_MS;
  const rmssd = w.difs.length >= 30 ? Math.sqrt(w.difs.reduce((a, d) => a + d * d, 0) / w.difs.length) : null;
  const qualidade = cobertura >= 0.6 && rmssd != null ? "boa" : cobertura >= 0.3 && rmssd != null ? "fraca" : "ruim";
  resumo[qualidade]++;
  const bpm = w.hr.length ? w.hr.reduce((a, b) => a + b, 0) / w.hr.length : null;
  const hora = new Date(j * JANELA_MS).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mov = movimento.get(j);
  console.log(`${hora}    ${fmt(bpm, 0).padStart(3)}   ${String(w.ibi.length).padStart(5)}    ${fmt(cobertura * 100, 0).padStart(5)}%   ${fmt(rmssd, 0).padStart(4)}   ${fmt(mov, 0).padStart(7)}    ${qualidade}`);
  linhasSaida.push([new Date(j * JANELA_MS).toISOString(), fmt(bpm, 0), w.ibi.length, w.total, fmt(cobertura * 100, 0), fmt(rmssd, 1), fmt(mov, 1), qualidade].join(","));
}
const nJ = resumo.boa + resumo.fraca + resumo.ruim;
if (nJ) console.log(`\nJanelas de 5 min: ${resumo.boa} boas, ${resumo.fraca} fracas, ${resumo.ruim} ruins (${fmt((100 * resumo.boa) / nJ, 0)}% aproveitáveis)`);
fs.writeFileSync(path.join(pasta, "janelas.csv"), linhasSaida.join("\n"));

// ---------- Bateria ----------
const bat = lerCsv("bateria.csv");
if (bat && bat.linhas.length > 1) {
  const pts = bat.linhas.filter((l) => l[2] === "false" && l[1] !== "").map((l) => [Number(l[0]), Number(l[1])]);
  if (pts.length > 1) {
    const horas = (pts.at(-1)[0] - pts[0][0]) / 3.6e6;
    const gasto = pts[0][1] - pts.at(-1)[1];
    console.log(`\nBateria: ${fmt(pts[0][1], 0)}% → ${fmt(pts.at(-1)[1], 0)}% em ${fmt(horas)} h fora do carregador = ${fmt(gasto / horas)} %/h (autonomia estimada ≈ ${fmt(100 / (gasto / horas), 0)} h)`);
  }
}

const ev = lerCsv("eventos.csv");
if (ev) {
  const relevantes = ev.linhas.filter((l) => !["inicio", "ligado", "fim"].includes(l[1]));
  if (relevantes.length) {
    console.log("\nEventos:");
    relevantes.slice(0, 20).forEach((l) => console.log(`  ${new Date(Number(l[0])).toLocaleTimeString("pt-BR")} ${l[1]} ${l[2] ?? ""}`));
  }
}
console.log(`\nDetalhe por janela salvo em ${path.join(pasta, "janelas.csv")}\n`);
