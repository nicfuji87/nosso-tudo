/**
 * Traçado de ECG em "papel milimetrado" (SVG, renderizado no servidor, imprime bem).
 * Escala padrão de papel: 25 mm/s e 10 mm/mV. 1 mm = 4 px aqui (100 px/s, 40 px/mV).
 * Uma faixa por trecho de 10 s. Para não perder os picos (QRS), reduz por mínimo/máximo em cada coluna.
 */
const PX_S = 100;
const PX_MV = 40;
const ALTURA = 120; // 3 mV de faixa

function faixa(amostras: number[], hz: number, iniS: number, duracaoS: number) {
  const ini = Math.floor(iniS * hz);
  const fim = Math.min(amostras.length, Math.floor((iniS + duracaoS) * hz));
  const trecho = amostras.slice(ini, fim);
  if (trecho.length < 10) return null;
  const ordenado = [...trecho].sort((a, b) => a - b);
  const base = ordenado[Math.floor(ordenado.length / 2)]!; // linha de base = mediana
  const largura = Math.round(duracaoS * PX_S);
  const porColuna = trecho.length / largura;
  const pts: string[] = [];
  for (let x = 0; x < largura; x++) {
    const a = Math.floor(x * porColuna), b = Math.max(a + 1, Math.floor((x + 1) * porColuna));
    let mn = Infinity, mx = -Infinity;
    for (let i = a; i < b && i < trecho.length; i++) { const v = trecho[i]!; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!Number.isFinite(mn)) continue;
    const y = (v: number) => Math.max(1, Math.min(ALTURA - 1, ALTURA / 2 - (v - base) * PX_MV));
    pts.push(`${x},${y(mx).toFixed(1)}`, `${x},${y(mn).toFixed(1)}`);
  }
  return { largura, pts: pts.join(" ") };
}

export function EcgTracado({ amostras, hz, duracaoS }: { amostras: number[]; hz: number; duracaoS: number }) {
  if (!hz || amostras.length < hz) return <p className="text-caption text-muted-foreground">Traçado indisponível.</p>;
  const total = Math.min(duracaoS, amostras.length / hz);
  const faixas = Array.from({ length: Math.ceil(total / 10) }, (_, i) => i * 10)
    .map((ini) => ({ ini, f: faixa(amostras, hz, ini, Math.min(10, total - ini)) }))
    .filter((x) => x.f);
  return (
    <div className="space-y-1.5">
      {faixas.map(({ ini, f }) => (
        <div key={ini} className="overflow-x-auto">
          <svg viewBox={`0 0 ${f!.largura} ${ALTURA}`} width="100%" style={{ maxWidth: f!.largura }} role="img"
            aria-label={`ECG de ${ini} a ${ini + 10} segundos`} className="block">
            <defs>
              <pattern id={`mm-${ini}`} width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M 4 0 L 0 0 0 4" fill="none" stroke="#F4C7CF" strokeWidth="0.4" />
              </pattern>
              <pattern id={`cm-${ini}`} width="20" height="20" patternUnits="userSpaceOnUse">
                <rect width="20" height="20" fill={`url(#mm-${ini})`} />
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E79AA8" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width={f!.largura} height={ALTURA} fill="#FFF7F8" />
            <rect width={f!.largura} height={ALTURA} fill={`url(#cm-${ini})`} />
            <polyline points={f!.pts} fill="none" stroke="#1F2328" strokeWidth="1" strokeLinejoin="round" />
            <text x="4" y="12" fontSize="9" fill="#9A4B58">{ini}–{ini + 10} s</text>
          </svg>
        </div>
      ))}
      <p className="text-[0.6875rem] text-muted-foreground">25 mm/s · 10 mm/mV · derivação única do relógio (similar a DI)</p>
    </div>
  );
}
