import { LIMITES_PIN } from "../conteudo/guardrails";
import { validarLinkAfiliado } from "../afiliados/validacao";

/**
 * Validação do pacote Pinterest de uma variante (V2 §9) — pura e testada.
 * "ready" só quando TUDO que vai para a API existe e está dentro das regras.
 */
export interface EntradaPacote {
  titulo: string | null;
  descricao: string | null;
  altText: string | null;
  boardId: string | null;
  linkAfiliado: string | null;
  redirectStatus: string | null; // de ml_affiliate_links
  exigirLink: boolean;
  disclosure: string;
  exigirDisclosure: boolean;
  temImagemFinal: boolean;
}

export interface ResultadoPacote {
  status: "ready" | "incomplete" | "invalid";
  erros: { campo: string; mensagem: string }[];
}

export function validarPacote(e: EntradaPacote): ResultadoPacote {
  const faltando: ResultadoPacote["erros"] = [];
  const invalidos: ResultadoPacote["erros"] = [];
  const vazio = (s: string | null) => !s || !s.trim();

  if (vazio(e.titulo)) faltando.push({ campo: "title", mensagem: "Falta o título." });
  else if (e.titulo!.length > LIMITES_PIN.titulo) invalidos.push({ campo: "title", mensagem: `Título acima de ${LIMITES_PIN.titulo} caracteres.` });

  if (vazio(e.descricao)) faltando.push({ campo: "description", mensagem: "Falta a descrição." });
  else {
    if (e.descricao!.length > LIMITES_PIN.descricao) invalidos.push({ campo: "description", mensagem: `Descrição acima de ${LIMITES_PIN.descricao} caracteres.` });
    if (e.exigirDisclosure && e.disclosure.trim() && !e.descricao!.toLowerCase().includes(e.disclosure.trim().toLowerCase())) {
      invalidos.push({ campo: "disclosure", mensagem: "Descrição sem o aviso de link de afiliado." });
    }
  }

  if (vazio(e.altText)) faltando.push({ campo: "alt_text", mensagem: "Falta o texto alternativo." });
  else if (e.altText!.length > LIMITES_PIN.altText) invalidos.push({ campo: "alt_text", mensagem: `Alt text acima de ${LIMITES_PIN.altText} caracteres.` });

  if (!e.boardId) faltando.push({ campo: "board_id", mensagem: "Escolha um board." });
  if (!e.temImagemFinal) faltando.push({ campo: "image", mensagem: "A imagem final ainda não está pronta." });

  if (e.exigirLink) {
    if (vazio(e.linkAfiliado)) faltando.push({ campo: "affiliate_url", mensagem: "Falta o link de afiliado." });
    else {
      const v = validarLinkAfiliado(e.linkAfiliado!);
      if (!v.ok) invalidos.push({ campo: "affiliate_url", mensagem: v.erros.join(" ") });
      if (e.redirectStatus === "inconsistent") invalidos.push({ campo: "affiliate_url", mensagem: "O link redireciona para um destino inconsistente." });
    }
  }

  const erros = [...invalidos, ...faltando];
  return { status: invalidos.length ? "invalid" : faltando.length ? "incomplete" : "ready", erros };
}

/** Situação de fidelidade que libera aprovação (V2 §5). */
export function fidelidadeLiberaAprovacao(p: {
  modo: string;
  imagemManualOuIa: boolean;
  status: string;
  exigirRevisao: boolean;
  automatico: boolean;
  nivelAutomacao: number;
}): { ok: boolean; motivo?: string } {
  const exige = p.modo === "reference_generation" || p.imagemManualOuIa;
  if (!exige || !p.exigirRevisao) return { ok: true };
  if (p.status === "human_ok") return { ok: true };
  if (p.status === "failed") return { ok: false, motivo: "Fidelidade reprovada — regere a cena ou confirme manualmente que o produto está fiel." };
  if (!p.automatico) {
    // aprovação humana: a pessoa está olhando o criativo; exige ao menos a checagem (IA ou manual) feita
    return p.status === "ok" || p.status === "warning"
      ? { ok: true }
      : { ok: false, motivo: "Confirme a fidelidade do produto (checklist) antes de aprovar." };
  }
  // automação: análise de IA não substitui humano no modo assistido (nível < 3)
  if (p.nivelAutomacao >= 3 && p.status === "ok") return { ok: true };
  return { ok: false, motivo: "Aprovação automática exige fidelidade confirmada por humano (ou nível ≥ 3 com análise OK)." };
}
