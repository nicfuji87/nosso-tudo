"use client";

import { useState } from "react";
import { Eye, ImageIcon, Info, Sparkles, Trash2, Type, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, NativeSelect } from "@/components/ml/campos";
import { desconectarIntegracao, salvarOpenAI, testarIntegracao } from "@/app/ml/(painel)/integracoes/actions";
import { salvarSecao } from "@/app/ml/(painel)/configuracoes/actions";
import { CartaoIntegracao, Nota } from "./cartao-integracao";
import { CampoSegredo, SoLeitura, useAcao } from "./comum";
import type { IntegracaoView, Permissoes } from "./tipos";

const OUTRO = "__outro__";

/** Select com os modelos da conta + "Outro…" para digitar livremente (fallback quando a lista não tem o modelo). */
function SeletorModelo({
  valor,
  onChange,
  opcoes,
  disabled,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  opcoes: string[];
  disabled?: boolean;
  placeholder: string;
}) {
  const [livre, setLivre] = useState(false);
  if (opcoes.length === 0 || livre) {
    return (
      <div className="flex items-center gap-2">
        <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} spellCheck={false} maxLength={80} className="font-mono" />
        {opcoes.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setLivre(false)} disabled={disabled} className="shrink-0">
            Lista
          </Button>
        )}
      </div>
    );
  }
  const lista = opcoes.includes(valor) || !valor ? opcoes : [valor, ...opcoes];
  return (
    <NativeSelect
      value={valor}
      onChange={(e) => (e.target.value === OUTRO ? setLivre(true) : onChange(e.target.value))}
      disabled={disabled}
      className="w-full"
    >
      {lista.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      <option value={OUTRO}>Outro modelo (digitar)…</option>
    </NativeSelect>
  );
}

/** Um modelo por função (V2 §11.11): rótulo com ícone + seletor. */
function CampoModelo({ titulo, dica, icone, children }: { titulo: string; dica: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-body-sm font-medium [&_svg]:size-4 [&_svg]:text-tech">
        {icone}
        {titulo}
      </span>
      {children}
      <span className="block text-caption text-muted-foreground">{dica}</span>
    </label>
  );
}

export function IntegracaoOpenAI({
  integ,
  tz,
  permissoes,
  modeloTexto,
  modeloImagem,
  modeloVisao,
}: {
  integ: IntegracaoView;
  tz: string;
  permissoes: Permissoes;
  modeloTexto: string;
  modeloImagem: string;
  modeloVisao: string;
}) {
  const mascara = integ.secret_hints.api_key ?? null;
  const modelosDisponiveis = Array.isArray(integ.config.modelos)
    ? (integ.config.modelos as unknown[]).filter((m): m is string => typeof m === "string")
    : [];
  const modelosImagem = modelosDisponiveis.filter((m) => /image|dall/i.test(m));
  const modelosTexto = modelosDisponiveis.filter((m) => !/image|dall|audio|tts|transcribe|realtime|embedding|search/i.test(m));

  const [chave, setChave] = useState("");
  const [texto, setTexto] = useState(modeloTexto);
  const [imagem, setImagem] = useState(modeloImagem);
  const [visao, setVisao] = useState(modeloVisao);
  const chaveAcao = useAcao();
  const modelosAcao = useAcao();

  const chaveValida = chave.trim().length >= 20 && chave.trim().length <= 300;
  const mudouTextoImagem = texto.trim() !== modeloTexto || imagem.trim() !== modeloImagem;
  const mudouVisao = visao.trim() !== modeloVisao;
  const modelosValidos = [texto, imagem, visao].every((m) => m.trim().length >= 2 && m.trim().length <= 80);
  const modelosMudaram = (mudouTextoImagem || mudouVisao) && modelosValidos;

  return (
    <CartaoIntegracao
      integ={integ}
      tz={tz}
      titulo="OpenAI"
      descricao="Inteligência artificial para analisar produtos e escrever por você."
      icone={<Sparkles className="size-5" />}
      opcional
      rotulos={{ disconnected: "Sem chave", connected: "Chave válida", invalid: "Chave inválida" }}
    >
      <Nota icone={<Info />}>
        <p>
          Usada para: <strong>analisar</strong> o apelo visual dos produtos, sugerir <strong>ângulos</strong> de divulgação, escrever <strong>títulos e
          descrições</strong> dos Pins, gerar <strong>imagens automáticas</strong> e <strong>conferir a fidelidade</strong> das artes ao produto real. Cada
          função pode usar um modelo diferente.
        </p>
        <p className="text-muted-foreground">
          Sem a chave o app continua funcionando: as artes saem por composição (foto real + texto) ou você gera a imagem no ChatGPT e envia.
        </p>
      </Nota>

      {permissoes.administrar ? (
        <>
          <form
            className="space-y-3"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!chaveValida) return;
              const ok = await chaveAcao.executar(() => salvarOpenAI(chave.trim()));
              if (ok) setChave("");
            }}
          >
            <Campo
              label="Chave de API"
              dica={
                <>
                  Crie em{" "}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-tech underline-offset-4 hover:underline">
                    platform.openai.com/api-keys
                  </a>
                  . A chave é testada antes de salvar.
                </>
              }
            >
              <CampoSegredo mascara={mascara} value={chave} onChange={(e) => setChave(e.target.value)} placeholder="sk-…" disabled={chaveAcao.pendente} />
            </Campo>
            <Button type="submit" size="sm" disabled={!chaveValida || chaveAcao.pendente}>
              {mascara ? "Trocar chave" : "Salvar chave"}
            </Button>
          </form>

          <form
            className="space-y-3 border-t border-border/70 pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!modelosMudaram) return;
              await modelosAcao.executar(async () => {
                // texto/imagem pela action da integração; visão é parte da seção "ia" das configurações
                if (mudouTextoImagem) {
                  const r = await salvarOpenAI(null, { texto: texto.trim(), imagem: imagem.trim() });
                  if ("error" in r && r.error) return { error: r.error };
                }
                if (mudouVisao) {
                  const r = await salvarSecao("ia", { modelo_visao: visao.trim() });
                  if ("error" in r && r.error) return { error: mudouTextoImagem ? `Texto e imagem salvos, mas o modelo de visão falhou: ${r.error}` : r.error };
                }
                return { ok: true, mensagem: "Modelos salvos." };
              });
            }}
          >
            <div className="space-y-3">
              <CampoModelo titulo="Texto" dica="Análises de produto, ângulos, headlines e copy dos Pins." icone={<Type />}>
                <SeletorModelo valor={texto} onChange={setTexto} opcoes={modelosTexto} disabled={modelosAcao.pendente} placeholder="Ex.: gpt-…" />
              </CampoModelo>
              <CampoModelo titulo="Visão e análise de fidelidade" dica="Descreve as imagens para o pacote Pinterest e compara a arte gerada com as fotos reais do produto." icone={<Eye />}>
                <SeletorModelo valor={visao} onChange={setVisao} opcoes={modelosTexto} disabled={modelosAcao.pendente} placeholder="Ex.: gpt-…" />
              </CampoModelo>
              <CampoModelo titulo="Imagem" dica="Cenários, geração por referência e artes automáticas." icone={<ImageIcon />}>
                <SeletorModelo valor={imagem} onChange={setImagem} opcoes={modelosImagem} disabled={modelosAcao.pendente} placeholder="Ex.: gpt-image-…" />
              </CampoModelo>
            </div>
            {modelosDisponiveis.length === 0 && (
              <p className="text-caption text-muted-foreground">Clique em “Testar conexão” para carregar a lista de modelos da sua conta.</p>
            )}
            <Button type="submit" size="sm" variant="secondary" disabled={!modelosMudaram || modelosAcao.pendente}>
              Salvar modelos
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-body-sm text-muted-foreground">
            Modelos em uso: texto <strong>{modeloTexto}</strong> · visão <strong>{modeloVisao}</strong> · imagem <strong>{modeloImagem}</strong>
          </p>
          <SoLeitura />
        </>
      )}

      {(permissoes.operar || permissoes.administrar) && integ.status !== "disconnected" && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {permissoes.operar && (
            <AcaoBotao size="sm" variant="secondary" acao={() => testarIntegracao("openai")}>
              <Wifi /> Testar conexão
            </AcaoBotao>
          )}
          {permissoes.administrar && (
            <AcaoBotao
              size="sm"
              variant="ghost"
              className="text-destructive"
              acao={() => desconectarIntegracao("openai")}
              confirmar="Remover a chave da OpenAI? Análises e textos automáticos param; as artes passam a sair por composição ou pelo fluxo manual."
            >
              <Trash2 /> Remover chave
            </AcaoBotao>
          )}
        </div>
      )}
    </CartaoIntegracao>
  );
}
