import { Activity, Dumbbell, Footprints, Grab, Swords, Waves } from "lucide-react";

/** Modalidades que você pratica (a ordem é a dos botões). */
export const MODALIDADES = [
  { nome: "Musculação", icone: Dumbbell },
  { nome: "Natação", icone: Waves },
  { nome: "Judô", icone: Swords },
  { nome: "Jiu-jitsu", icone: Grab },
  { nome: "Caminhada", icone: Footprints },
  { nome: "Outro", icone: Activity },
] as const;

export const iconeModalidade = (nome: string | null) => MODALIDADES.find((m) => m.nome === nome)?.icone ?? Activity;

/** No pulso, a FC do PPG erra mais com pegada/força no punho ou água. */
export const BAIXA_CONFIANCA = new Set(["Judô", "Jiu-jitsu", "Musculação", "Natação"]);

export const motivoBaixaConfianca = (m: string) =>
  m === "Natação" ? "água e movimento do braço" : m === "Musculação" ? "contração do antebraço; costuma subestimar logo após as séries" : "pegada e pressão no punho";

/** Escala de esforço percebido (CR-10). */
export const ESFORCO = ["Repouso", "Muito leve", "Leve", "Moderado", "Um pouco forte", "Forte", "Forte+", "Muito forte", "Muito forte+", "Quase máximo", "Máximo"];
