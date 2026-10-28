/**
 * Aeroportos e grupos de destino do radar de viagens.
 *
 * PURO (sem I/O). O usuário pode digitar códigos IATA soltos ("NRT, HND") ou
 * nomes de grupo ("japao", "europa") — `expandirLocais` resolve tudo para uma
 * lista de IATA, que é o que o seats.aero e o Google Flights aceitam.
 */

export interface GrupoDestino {
  slug: string;
  nome: string;
  aeroportos: string[];
  /** Entra na varredura diária de promoções. */
  varreduraPromo: boolean;
}

export const GRUPOS_DESTINO: GrupoDestino[] = [
  {
    slug: "eua",
    nome: "Estados Unidos",
    aeroportos: ["MIA", "MCO", "FLL", "JFK", "EWR", "BOS", "IAD", "ATL", "ORD", "DFW", "IAH", "LAX", "SFO", "SEA", "LAS"],
    varreduraPromo: true,
  },
  { slug: "canada", nome: "Canadá", aeroportos: ["YYZ", "YUL", "YVR"], varreduraPromo: true },
  {
    slug: "caribe-mexico",
    nome: "Caribe, México e Panamá",
    aeroportos: ["CUN", "MEX", "PUJ", "SDQ", "PTY", "AUA", "CUR", "SJU", "MBJ", "NAS", "SJO"],
    varreduraPromo: true,
  },
  {
    slug: "europa",
    nome: "Europa",
    aeroportos: [
      "LIS", "OPO", "MAD", "BCN", "CDG", "ORY", "LHR", "LGW", "FCO", "MXP", "FRA", "MUC",
      "AMS", "ZRH", "BRU", "DUB", "VIE", "CPH", "ARN", "HEL", "IST", "ATH",
    ],
    varreduraPromo: true,
  },
  { slug: "portugal", nome: "Portugal", aeroportos: ["LIS", "OPO", "FAO"], varreduraPromo: false },
  { slug: "espanha", nome: "Espanha", aeroportos: ["MAD", "BCN"], varreduraPromo: false },
  { slug: "franca", nome: "França", aeroportos: ["CDG", "ORY", "NCE"], varreduraPromo: false },
  { slug: "italia", nome: "Itália", aeroportos: ["FCO", "MXP", "VCE"], varreduraPromo: false },
  { slug: "reino-unido", nome: "Reino Unido", aeroportos: ["LHR", "LGW"], varreduraPromo: false },
  { slug: "japao", nome: "Japão", aeroportos: ["NRT", "HND", "KIX", "NGO"], varreduraPromo: false },
  {
    slug: "asia",
    nome: "Ásia",
    aeroportos: ["NRT", "HND", "KIX", "ICN", "PEK", "PVG", "HKG", "TPE", "BKK", "SIN", "KUL", "DEL", "BOM"],
    varreduraPromo: true,
  },
  { slug: "oriente-medio", nome: "Oriente Médio", aeroportos: ["DXB", "DOH", "AUH", "TLV"], varreduraPromo: true },
  { slug: "africa", nome: "África", aeroportos: ["JNB", "CPT", "ADD", "CMN", "CAI"], varreduraPromo: true },
  { slug: "oceania", nome: "Oceania", aeroportos: ["SYD", "MEL", "AKL"], varreduraPromo: true },
  {
    slug: "america-do-sul",
    nome: "América do Sul",
    aeroportos: ["EZE", "AEP", "SCL", "LIM", "BOG", "MDE", "CTG", "MVD", "ASU", "UIO", "CUZ"],
    varreduraPromo: true,
  },
  {
    slug: "brasil",
    nome: "Brasil",
    aeroportos: [
      "BSB", "GRU", "CGH", "VCP", "GIG", "SDU", "CNF", "SSA", "REC", "FOR", "POA", "CWB",
      "FLN", "NAT", "MCZ", "BEL", "MAO",
    ],
    varreduraPromo: false,
  },
];

/** Nomes curtos dos aeroportos mais comuns, para a UI e a mensagem de WhatsApp. */
export const NOME_AEROPORTO: Record<string, string> = {
  BSB: "Brasília", GRU: "São Paulo (Guarulhos)", CGH: "São Paulo (Congonhas)", VCP: "Campinas",
  GIG: "Rio (Galeão)", SDU: "Rio (Santos Dumont)", CNF: "Belo Horizonte", SSA: "Salvador",
  REC: "Recife", FOR: "Fortaleza", POA: "Porto Alegre", CWB: "Curitiba", FLN: "Florianópolis",
  NAT: "Natal", MCZ: "Maceió", BEL: "Belém", MAO: "Manaus",
  MIA: "Miami", MCO: "Orlando", FLL: "Fort Lauderdale", JFK: "Nova York (JFK)", EWR: "Nova York (Newark)",
  BOS: "Boston", IAD: "Washington", ATL: "Atlanta", ORD: "Chicago", DFW: "Dallas", IAH: "Houston",
  LAX: "Los Angeles", SFO: "San Francisco", SEA: "Seattle", LAS: "Las Vegas",
  YYZ: "Toronto", YUL: "Montreal", YVR: "Vancouver",
  CUN: "Cancún", MEX: "Cidade do México", PUJ: "Punta Cana", SDQ: "Santo Domingo", PTY: "Panamá",
  AUA: "Aruba", CUR: "Curaçao", SJU: "San Juan", MBJ: "Montego Bay", NAS: "Nassau", SJO: "San José",
  LIS: "Lisboa", OPO: "Porto", FAO: "Faro", MAD: "Madri", BCN: "Barcelona", CDG: "Paris (CDG)",
  ORY: "Paris (Orly)", NCE: "Nice", LHR: "Londres (Heathrow)", LGW: "Londres (Gatwick)", FCO: "Roma",
  MXP: "Milão", VCE: "Veneza", FRA: "Frankfurt", MUC: "Munique", AMS: "Amsterdã", ZRH: "Zurique",
  BRU: "Bruxelas", DUB: "Dublin", VIE: "Viena", CPH: "Copenhague", ARN: "Estocolmo", HEL: "Helsinque",
  IST: "Istambul", ATH: "Atenas",
  NRT: "Tóquio (Narita)", HND: "Tóquio (Haneda)", KIX: "Osaka", NGO: "Nagoya", ICN: "Seul",
  PEK: "Pequim", PVG: "Xangai", HKG: "Hong Kong", TPE: "Taipé", BKK: "Bangkok", SIN: "Singapura",
  KUL: "Kuala Lumpur", DEL: "Nova Délhi", BOM: "Mumbai",
  DXB: "Dubai", DOH: "Doha", AUH: "Abu Dhabi", TLV: "Tel Aviv",
  JNB: "Joanesburgo", CPT: "Cidade do Cabo", ADD: "Adis Abeba", CMN: "Casablanca", CAI: "Cairo",
  SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland",
  EZE: "Buenos Aires (Ezeiza)", AEP: "Buenos Aires (Aeroparque)", SCL: "Santiago", LIM: "Lima",
  BOG: "Bogotá", MDE: "Medellín", CTG: "Cartagena", MVD: "Montevidéu", ASU: "Assunção", UIO: "Quito",
  CUZ: "Cusco",
};

const IATA = /^[A-Z]{3}$/;

export function nomeAeroporto(iata: string): string {
  return NOME_AEROPORTO[iata] ?? iata;
}

/** Região (grupo de varredura) a que um aeroporto pertence, para agrupar promoções. */
export function regiaoDoAeroporto(iata: string): string | null {
  const g = GRUPOS_DESTINO.find((x) => x.varreduraPromo && x.aeroportos.includes(iata));
  return g?.nome ?? null;
}

function normalizarSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

export interface LocaisExpandidos {
  aeroportos: string[];
  /** Entradas que não são IATA nem grupo conhecido — a UI mostra como erro. */
  invalidos: string[];
}

/**
 * Aceita códigos IATA e nomes de grupo (com ou sem acento, em qualquer caixa),
 * separados por vírgula, espaço ou quebra de linha. Remove duplicatas e mantém
 * a ordem em que apareceram.
 */
export function expandirLocais(entrada: string | string[]): LocaisExpandidos {
  const partes = (Array.isArray(entrada) ? entrada : entrada.split(/[,;\n]+/))
    .map((p) => p.trim())
    .filter(Boolean);
  const vistos = new Set<string>();
  const aeroportos: string[] = [];
  const invalidos: string[] = [];
  const add = (iata: string) => {
    if (!vistos.has(iata)) {
      vistos.add(iata);
      aeroportos.push(iata);
    }
  };
  for (const parte of partes) {
    const up = parte.toUpperCase();
    if (IATA.test(up)) {
      add(up);
      continue;
    }
    const slug = normalizarSlug(parte);
    const grupo = GRUPOS_DESTINO.find((g) => g.slug === slug || normalizarSlug(g.nome) === slug);
    if (grupo) grupo.aeroportos.forEach(add);
    else invalidos.push(parte);
  }
  return { aeroportos, invalidos };
}
