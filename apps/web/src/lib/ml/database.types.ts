export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      anuncios: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          fim_em: string | null
          id: string
          imagem_url: string | null
          inicio_em: string | null
          posicao: string
          prioridade: number | null
          texto: string | null
          titulo: string
          url_destino: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          fim_em?: string | null
          id?: string
          imagem_url?: string | null
          inicio_em?: string | null
          posicao: string
          prioridade?: number | null
          texto?: string | null
          titulo: string
          url_destino?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          fim_em?: string | null
          id?: string
          imagem_url?: string | null
          inicio_em?: string | null
          posicao?: string
          prioridade?: number | null
          texto?: string | null
          titulo?: string
          url_destino?: string | null
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          asaas_event_id: string | null
          erro: string | null
          event_type: string
          id: string
          ip_origem: unknown
          pagamento_id: string | null
          payload: Json
          processado: boolean | null
          processado_em: string | null
          received_at: string | null
          tentativas: number | null
          workspace_id: string | null
        }
        Insert: {
          asaas_event_id?: string | null
          erro?: string | null
          event_type: string
          id?: string
          ip_origem?: unknown
          pagamento_id?: string | null
          payload: Json
          processado?: boolean | null
          processado_em?: string | null
          received_at?: string | null
          tentativas?: number | null
          workspace_id?: string | null
        }
        Update: {
          asaas_event_id?: string | null
          erro?: string | null
          event_type?: string
          id?: string
          ip_origem?: unknown
          pagamento_id?: string | null
          payload?: Json
          processado?: boolean | null
          processado_em?: string | null
          received_at?: string | null
          tentativas?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_webhook_events_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          alterado_por: string | null
          created_at: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          registro_id: string
          tabela: string
          workspace_id: string
        }
        Insert: {
          acao: string
          alterado_por?: string | null
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id: string
          tabela: string
          workspace_id: string
        }
        Update: {
          acao?: string
          alterado_por?: string | null
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id?: string
          tabela?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_acesso: {
        Row: {
          acao: string
          created_at: string | null
          id: string
          ip: unknown
          metadados: Json | null
          profile_id: string | null
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          id?: string
          ip?: unknown
          metadados?: Json | null
          profile_id?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          id?: string
          ip?: unknown
          metadados?: Json | null
          profile_id?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_acesso_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_acesso_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes: {
        Row: {
          apelido: string
          ativo: boolean | null
          banco: string
          bandeira: string | null
          conta_pagamento_id: string | null
          created_at: string | null
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          limite: number | null
          titular_id: string
          ultimos_digitos: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          apelido: string
          ativo?: boolean | null
          banco: string
          bandeira?: string | null
          conta_pagamento_id?: string | null
          created_at?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number | null
          titular_id: string
          ultimos_digitos?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          apelido?: string
          ativo?: boolean | null
          banco?: string
          bandeira?: string | null
          conta_pagamento_id?: string | null
          created_at?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number | null
          titular_id?: string
          ultimos_digitos?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_conta_pagamento_id_fkey"
            columns: ["conta_pagamento_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_templates: {
        Row: {
          canonico: boolean
          comportamento:
            | Database["public"]["Enums"]["comportamento_categoria"]
            | null
          cor: string | null
          essencialidade_padrao:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone: string | null
          id: string
          nome: string
          ordem: number | null
          parent_slug: string | null
          slug: string
        }
        Insert: {
          canonico?: boolean
          comportamento?:
            | Database["public"]["Enums"]["comportamento_categoria"]
            | null
          cor?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number | null
          parent_slug?: string | null
          slug: string
        }
        Update: {
          canonico?: boolean
          comportamento?:
            | Database["public"]["Enums"]["comportamento_categoria"]
            | null
          cor?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          parent_slug?: string | null
          slug?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          ativa: boolean | null
          categoria_pai_id: string | null
          comportamento: Database["public"]["Enums"]["comportamento_categoria"]
          cor: string | null
          created_at: string | null
          essencialidade_padrao:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone: string | null
          id: string
          nome: string
          ordem: number | null
          slug: string
          workspace_id: string
        }
        Insert: {
          ativa?: boolean | null
          categoria_pai_id?: string | null
          comportamento?: Database["public"]["Enums"]["comportamento_categoria"]
          cor?: string | null
          created_at?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number | null
          slug: string
          workspace_id: string
        }
        Update: {
          ativa?: boolean | null
          categoria_pai_id?: string | null
          comportamento?: Database["public"]["Enums"]["comportamento_categoria"]
          cor?: string | null
          created_at?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          slug?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      colecoes: {
        Row: {
          categoria_id: string
          cor: string | null
          created_at: string | null
          data_confirmacao: string | null
          data_entrega_real: string | null
          data_estimada_entrega: string | null
          data_fim: string | null
          data_inicio: string | null
          data_pagamento: string | null
          data_pedido: string | null
          descricao: string | null
          icone: string | null
          id: string
          metadados: Json | null
          midia_capa_id: string | null
          moeda: string | null
          nome: string
          orcamento_previsto: number | null
          organizador: string | null
          participantes: string[] | null
          responsavel_id: string | null
          status_compromisso:
            | Database["public"]["Enums"]["status_colecao_compromisso"]
            | null
          status_projeto:
            | Database["public"]["Enums"]["status_colecao_projeto"]
            | null
          updated_at: string | null
          valor_estimado: number | null
          valor_final: number | null
          workspace_id: string
        }
        Insert: {
          categoria_id: string
          cor?: string | null
          created_at?: string | null
          data_confirmacao?: string | null
          data_entrega_real?: string | null
          data_estimada_entrega?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_pagamento?: string | null
          data_pedido?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          metadados?: Json | null
          midia_capa_id?: string | null
          moeda?: string | null
          nome: string
          orcamento_previsto?: number | null
          organizador?: string | null
          participantes?: string[] | null
          responsavel_id?: string | null
          status_compromisso?:
            | Database["public"]["Enums"]["status_colecao_compromisso"]
            | null
          status_projeto?:
            | Database["public"]["Enums"]["status_colecao_projeto"]
            | null
          updated_at?: string | null
          valor_estimado?: number | null
          valor_final?: number | null
          workspace_id: string
        }
        Update: {
          categoria_id?: string
          cor?: string | null
          created_at?: string | null
          data_confirmacao?: string | null
          data_entrega_real?: string | null
          data_estimada_entrega?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_pagamento?: string | null
          data_pedido?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          metadados?: Json | null
          midia_capa_id?: string | null
          moeda?: string | null
          nome?: string
          orcamento_previsto?: number | null
          organizador?: string | null
          participantes?: string[] | null
          responsavel_id?: string | null
          status_compromisso?:
            | Database["public"]["Enums"]["status_colecao_compromisso"]
            | null
          status_projeto?:
            | Database["public"]["Enums"]["status_colecao_projeto"]
            | null
          updated_at?: string | null
          valor_estimado?: number | null
          valor_final?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "colecoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colecoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colecoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_colecao_capa"
            columns: ["midia_capa_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          apelido: string
          ativa: boolean | null
          banco: string
          created_at: string | null
          eh_conta_compartilhada: boolean | null
          id: string
          numero: string | null
          tipo: Database["public"]["Enums"]["tipo_conta_bancaria"] | null
          titular_id: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          agencia?: string | null
          apelido: string
          ativa?: boolean | null
          banco: string
          created_at?: string | null
          eh_conta_compartilhada?: boolean | null
          id?: string
          numero?: string | null
          tipo?: Database["public"]["Enums"]["tipo_conta_bancaria"] | null
          titular_id: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          agencia?: string | null
          apelido?: string
          ativa?: boolean | null
          banco?: string
          created_at?: string | null
          eh_conta_compartilhada?: boolean | null
          id?: string
          numero?: string | null
          tipo?: Database["public"]["Enums"]["tipo_conta_bancaria"] | null
          titular_id?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contextos: {
        Row: {
          arquivado: boolean
          cor: string | null
          created_at: string | null
          data_referencia: string | null
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          tipo: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          arquivado?: boolean
          cor?: string | null
          created_at?: string | null
          data_referencia?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          tipo?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          arquivado?: boolean
          cor?: string | null
          created_at?: string | null
          data_referencia?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          tipo?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contextos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_ia: {
        Row: {
          arquivada: boolean | null
          contexto: Json | null
          created_at: string | null
          id: string
          profile_id: string
          titulo: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          arquivada?: boolean | null
          contexto?: Json | null
          created_at?: string | null
          id?: string
          profile_id: string
          titulo?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          arquivada?: boolean | null
          contexto?: Json | null
          created_at?: string | null
          id?: string
          profile_id?: string
          titulo?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_ia_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_ia_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entidades: {
        Row: {
          ativa: boolean | null
          cor: string | null
          created_at: string | null
          icone: string | null
          id: string
          nome: string
          profile_id: string | null
          tipo: Database["public"]["Enums"]["tipo_entidade"]
          workspace_id: string
        }
        Insert: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          icone?: string | null
          id?: string
          nome: string
          profile_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_entidade"]
          workspace_id: string
        }
        Update: {
          ativa?: boolean | null
          cor?: string | null
          created_at?: string | null
          icone?: string | null
          id?: string
          nome?: string
          profile_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_entidade"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entidades_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entidades_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      estabelecimentos: {
        Row: {
          apelidos: string[] | null
          categoria_sugerida_id: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string | null
          id: string
          nome: string
          nome_normalizado: string
          observacoes: string | null
          origem_criacao: Database["public"]["Enums"]["origem_transacao"] | null
          status_revisao: Database["public"]["Enums"]["status_revisao"] | null
          workspace_id: string
        }
        Insert: {
          apelidos?: string[] | null
          categoria_sugerida_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          nome: string
          nome_normalizado: string
          observacoes?: string | null
          origem_criacao?:
            | Database["public"]["Enums"]["origem_transacao"]
            | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          workspace_id: string
        }
        Update: {
          apelidos?: string[] | null
          categoria_sugerida_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string
          observacoes?: string | null
          origem_criacao?:
            | Database["public"]["Enums"]["origem_transacao"]
            | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_categoria_sugerida_id_fkey"
            columns: ["categoria_sugerida_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estabelecimentos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas_cartao: {
        Row: {
          cartao_id: string
          created_at: string | null
          data_fechamento: string | null
          data_vencimento: string | null
          id: string
          mes_referencia: string
          midia_id: string | null
          observacoes: string | null
          status: Database["public"]["Enums"]["status_fatura"] | null
          updated_at: string | null
          valor_pago: number | null
          valor_total: number | null
          workspace_id: string
        }
        Insert: {
          cartao_id: string
          created_at?: string | null
          data_fechamento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia: string
          midia_id?: string | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_fatura"] | null
          updated_at?: string | null
          valor_pago?: number | null
          valor_total?: number | null
          workspace_id: string
        }
        Update: {
          cartao_id?: string
          created_at?: string | null
          data_fechamento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia?: string
          midia_id?: string | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_fatura"] | null
          updated_at?: string | null
          valor_pago?: number | null
          valor_total?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_midia_id_fkey"
            columns: ["midia_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          key: string
          secrets: Json
          updated_at: string | null
          updated_by: string | null
          valor: Json
        }
        Insert: {
          key: string
          secrets?: Json
          updated_at?: string | null
          updated_by?: string | null
          valor?: Json
        }
        Update: {
          key?: string
          secrets?: Json
          updated_at?: string | null
          updated_by?: string | null
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investimentos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          data_aplicacao_inicial: string | null
          data_ultima_atualizacao: string | null
          data_vencimento: string | null
          descricao: string
          id: string
          instituicao: string | null
          liquidez: string | null
          observacoes: string | null
          rentabilidade_esperada: string | null
          tipo: Database["public"]["Enums"]["tipo_investimento"]
          titular_id: string
          updated_at: string | null
          valor_aplicado_total: number | null
          valor_atual: number | null
          workspace_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          data_aplicacao_inicial?: string | null
          data_ultima_atualizacao?: string | null
          data_vencimento?: string | null
          descricao: string
          id?: string
          instituicao?: string | null
          liquidez?: string | null
          observacoes?: string | null
          rentabilidade_esperada?: string | null
          tipo: Database["public"]["Enums"]["tipo_investimento"]
          titular_id: string
          updated_at?: string | null
          valor_aplicado_total?: number | null
          valor_atual?: number | null
          workspace_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          data_aplicacao_inicial?: string | null
          data_ultima_atualizacao?: string | null
          data_vencimento?: string | null
          descricao?: string
          id?: string
          instituicao?: string | null
          liquidez?: string | null
          observacoes?: string | null
          rentabilidade_esperada?: string | null
          tipo?: Database["public"]["Enums"]["tipo_investimento"]
          titular_id?: string
          updated_at?: string | null
          valor_aplicado_total?: number | null
          valor_atual?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investimentos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investimentos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          entidade_alvo_id: string | null
          expires_at: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          entidade_alvo_id?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          entidade_alvo_id?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_colecao: {
        Row: {
          atributos: Json | null
          colecao_id: string
          created_at: string | null
          descricao: string
          id: string
          ordem: number | null
          quantidade: number | null
          valor_unitario_estimado: number | null
          valor_unitario_final: number | null
          workspace_id: string
        }
        Insert: {
          atributos?: Json | null
          colecao_id: string
          created_at?: string | null
          descricao: string
          id?: string
          ordem?: number | null
          quantidade?: number | null
          valor_unitario_estimado?: number | null
          valor_unitario_final?: number | null
          workspace_id: string
        }
        Update: {
          atributos?: Json | null
          colecao_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          ordem?: number | null
          quantidade?: number | null
          valor_unitario_estimado?: number | null
          valor_unitario_final?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_colecao_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "colecoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_colecao_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "v_colecoes_em_aberto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_colecao_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_transacao: {
        Row: {
          categoria_id: string | null
          contexto_id: string | null
          created_at: string | null
          desconto: number | null
          descricao_original: string
          essencialidade: Database["public"]["Enums"]["essencialidade"]
          id: string
          ordem_na_nota: number | null
          produto_id: string | null
          quantidade: number | null
          score_confianca: number | null
          status_revisao: Database["public"]["Enums"]["status_revisao"] | null
          tipo_item: string | null
          transacao_id: string
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
          workspace_id: string
        }
        Insert: {
          categoria_id?: string | null
          contexto_id?: string | null
          created_at?: string | null
          desconto?: number | null
          descricao_original: string
          essencialidade?: Database["public"]["Enums"]["essencialidade"]
          id?: string
          ordem_na_nota?: number | null
          produto_id?: string | null
          quantidade?: number | null
          score_confianca?: number | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tipo_item?: string | null
          transacao_id: string
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
          workspace_id: string
        }
        Update: {
          categoria_id?: string | null
          contexto_id?: string | null
          created_at?: string | null
          desconto?: number | null
          descricao_original?: string
          essencialidade?: Database["public"]["Enums"]["essencialidade"]
          id?: string
          ordem_na_nota?: number | null
          produto_id?: string | null
          quantidade?: number | null
          score_confianca?: number | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tipo_item?: string | null
          transacao_id?: string
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_transacao_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_transacao_contexto_id_fkey"
            columns: ["contexto_id"]
            isOneToOne: false
            referencedRelation: "contextos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_transacao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_transacao_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_transacao_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "v_pendentes_revisao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_transacao_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_ia: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string | null
          custo_estimado: number | null
          ferramentas_usadas: Json | null
          id: string
          latencia_ms: number | null
          midias: Json | null
          modelo: string | null
          papel: Database["public"]["Enums"]["papel_ia"]
          provedor: string | null
          tokens_cache: number | null
          tokens_input: number | null
          tokens_output: number | null
          widgets: Json | null
          workspace_id: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string | null
          custo_estimado?: number | null
          ferramentas_usadas?: Json | null
          id?: string
          latencia_ms?: number | null
          midias?: Json | null
          modelo?: string | null
          papel: Database["public"]["Enums"]["papel_ia"]
          provedor?: string | null
          tokens_cache?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          widgets?: Json | null
          workspace_id: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string | null
          custo_estimado?: number | null
          ferramentas_usadas?: Json | null
          id?: string
          latencia_ms?: number | null
          midias?: Json | null
          modelo?: string | null
          papel?: Database["public"]["Enums"]["papel_ia"]
          provedor?: string | null
          tokens_cache?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          widgets?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_ia_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_ia_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_financeiras: {
        Row: {
          created_at: string | null
          data_alvo: string | null
          descricao: string | null
          id: string
          investimento_id: string | null
          nome: string
          responsavel_id: string | null
          status: string | null
          updated_at: string | null
          valor_alvo: number
          valor_atual: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          data_alvo?: string | null
          descricao?: string | null
          id?: string
          investimento_id?: string | null
          nome: string
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          valor_alvo: number
          valor_atual?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          data_alvo?: string | null
          descricao?: string | null
          id?: string
          investimento_id?: string | null
          nome?: string
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          valor_alvo?: number
          valor_atual?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_financeiras_investimento_id_fkey"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_financeiras_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_financeiras_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      midias: {
        Row: {
          bucket: string
          created_at: string | null
          enviado_por: string | null
          id: string
          metadados: Json | null
          mime_type: string | null
          nome_original: string | null
          origem: string | null
          processado: boolean | null
          storage_path: string
          tamanho_bytes: number | null
          texto_extraido: string | null
          tipo: Database["public"]["Enums"]["tipo_midia"]
          whatsapp_telefone: string | null
          workspace_id: string
        }
        Insert: {
          bucket: string
          created_at?: string | null
          enviado_por?: string | null
          id?: string
          metadados?: Json | null
          mime_type?: string | null
          nome_original?: string | null
          origem?: string | null
          processado?: boolean | null
          storage_path: string
          tamanho_bytes?: number | null
          texto_extraido?: string | null
          tipo: Database["public"]["Enums"]["tipo_midia"]
          whatsapp_telefone?: string | null
          workspace_id: string
        }
        Update: {
          bucket?: string
          created_at?: string | null
          enviado_por?: string | null
          id?: string
          metadados?: Json | null
          mime_type?: string | null
          nome_original?: string | null
          origem?: string | null
          processado?: boolean | null
          storage_path?: string
          tamanho_bytes?: number | null
          texto_extraido?: string | null
          tipo?: Database["public"]["Enums"]["tipo_midia"]
          whatsapp_telefone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "midias_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midias_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_affiliate_links: {
        Row: {
          active: boolean
          affiliate_url: string
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          id: string
          label: string | null
          original_url: string | null
          product_id: string
          source: string
          validated_at: string | null
          validation: Json | null
        }
        Insert: {
          active?: boolean
          affiliate_url: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          label?: string | null
          original_url?: string | null
          product_id: string
          source?: string
          validated_at?: string | null
          validation?: Json | null
        }
        Update: {
          active?: boolean
          affiliate_url?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          label?: string | null
          original_url?: string | null
          product_id?: string
          source?: string
          validated_at?: string | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_affiliate_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_api_calls: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: number
          job_id: string | null
          method: string
          operation: string
          provider: string
          request_id: string | null
          status: number | null
          url: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: never
          job_id?: string | null
          method: string
          operation: string
          provider: string
          request_id?: string | null
          status?: number | null
          url: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: never
          job_id?: string | null
          method?: string
          operation?: string
          provider?: string
          request_id?: string | null
          status?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_api_calls_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ml_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_categories: {
        Row: {
          commission_pct: number | null
          created_at: string
          has_children: boolean | null
          id: string
          last_discovered_at: string | null
          last_trends_at: string | null
          max_products: number | null
          name: string
          parent_id: string | null
          path: Json
          priority: number
          prohibited: boolean
          site_id: string
          synced_at: string | null
          tracked: boolean
          updated_at: string
        }
        Insert: {
          commission_pct?: number | null
          created_at?: string
          has_children?: boolean | null
          id: string
          last_discovered_at?: string | null
          last_trends_at?: string | null
          max_products?: number | null
          name: string
          parent_id?: string | null
          path?: Json
          priority?: number
          prohibited?: boolean
          site_id?: string
          synced_at?: string | null
          tracked?: boolean
          updated_at?: string
        }
        Update: {
          commission_pct?: number | null
          created_at?: string
          has_children?: boolean | null
          id?: string
          last_discovered_at?: string | null
          last_trends_at?: string | null
          max_products?: number | null
          name?: string
          parent_id?: string | null
          path?: Json
          priority?: number
          prohibited?: boolean
          site_id?: string
          synced_at?: string | null
          tracked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ml_commissions: {
        Row: {
          clicks: number | null
          commission: number
          created_at: string
          created_by: string | null
          external_ref: string | null
          gmv: number | null
          id: string
          note: string | null
          orders: number | null
          period_end: string
          period_start: string
          pin_id: string | null
          product_id: string | null
          source: string
        }
        Insert: {
          clicks?: number | null
          commission?: number
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          gmv?: number | null
          id?: string
          note?: string | null
          orders?: number | null
          period_end: string
          period_start: string
          pin_id?: string | null
          product_id?: string | null
          source?: string
        }
        Update: {
          clicks?: number | null
          commission?: number
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          gmv?: number | null
          id?: string
          note?: string | null
          orders?: number | null
          period_end?: string
          period_start?: string
          pin_id?: string | null
          product_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_commissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_commissions_pin_id_fkey"
            columns: ["pin_id"]
            isOneToOne: false
            referencedRelation: "ml_pins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_commissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_creative_angles: {
        Row: {
          audience: string | null
          batch: number
          created_at: string
          hook: string
          id: string
          keyword: string | null
          model: string | null
          product_id: string
          prompt_version: string | null
          rationale: string | null
          score: number | null
          source: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          batch?: number
          created_at?: string
          hook: string
          id?: string
          keyword?: string | null
          model?: string | null
          product_id: string
          prompt_version?: string | null
          rationale?: string | null
          score?: number | null
          source?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          batch?: number
          created_at?: string
          hook?: string
          id?: string
          keyword?: string | null
          model?: string | null
          product_id?: string
          prompt_version?: string | null
          rationale?: string | null
          score?: number | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_creative_angles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_creative_assets: {
        Row: {
          bytes: number | null
          created_at: string
          created_by: string | null
          creative_id: string
          height: number | null
          id: string
          mime: string | null
          mode: string
          model: string | null
          prompt: string | null
          public_url: string
          sha256: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          creative_id: string
          height?: number | null
          id?: string
          mime?: string | null
          mode: string
          model?: string | null
          prompt?: string | null
          public_url: string
          sha256?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          creative_id?: string
          height?: number | null
          id?: string
          mime?: string | null
          mode?: string
          model?: string | null
          prompt?: string | null
          public_url?: string
          sha256?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_creative_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creative_assets_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ml_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_creative_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          creative_id: string
          id: number
          reason: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creative_id: string
          id?: never
          reason: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creative_id?: string
          id?: never
          reason?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ml_creative_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creative_revisions_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ml_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_creatives: {
        Row: {
          alt_text: string | null
          angle_id: string | null
          approved_at: string | null
          approved_by: string | null
          board_id: string | null
          copy_status: string
          created_at: string
          created_by: string | null
          cta: string | null
          current_asset_id: string | null
          description: string | null
          format: string
          headline: string | null
          id: string
          image_mode: string
          image_prompt: string | null
          image_status: string
          keywords: string[]
          last_error: string | null
          model: string | null
          product_id: string
          prompt_version: string | null
          quality_notes: Json | null
          quality_score: number | null
          reference_image_url: string | null
          rejection_reason: string | null
          status: string
          title: string | null
          updated_at: string
          variant_of: string | null
        }
        Insert: {
          alt_text?: string | null
          angle_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          board_id?: string | null
          copy_status?: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          current_asset_id?: string | null
          description?: string | null
          format?: string
          headline?: string | null
          id?: string
          image_mode?: string
          image_prompt?: string | null
          image_status?: string
          keywords?: string[]
          last_error?: string | null
          model?: string | null
          product_id: string
          prompt_version?: string | null
          quality_notes?: Json | null
          quality_score?: number | null
          reference_image_url?: string | null
          rejection_reason?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          variant_of?: string | null
        }
        Update: {
          alt_text?: string | null
          angle_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          board_id?: string | null
          copy_status?: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          current_asset_id?: string | null
          description?: string | null
          format?: string
          headline?: string | null
          id?: string
          image_mode?: string
          image_prompt?: string | null
          image_status?: string
          keywords?: string[]
          last_error?: string | null
          model?: string | null
          product_id?: string
          prompt_version?: string | null
          quality_notes?: Json | null
          quality_score?: number | null
          reference_image_url?: string | null
          rejection_reason?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          variant_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_creatives_angle_id_fkey"
            columns: ["angle_id"]
            isOneToOne: false
            referencedRelation: "ml_creative_angles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_asset_fk"
            columns: ["current_asset_id"]
            isOneToOne: false
            referencedRelation: "ml_creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "ml_pinterest_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_creatives_variant_of_fkey"
            columns: ["variant_of"]
            isOneToOne: false
            referencedRelation: "ml_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_feedback: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          kind: string
          note: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          kind: string
          note?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          kind?: string
          note?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_integrations: {
        Row: {
          access_expires_at: string | null
          account_id: string | null
          account_name: string | null
          config: Json
          connected_at: string | null
          last_checked_at: string | null
          last_error: string | null
          last_refresh_at: string | null
          lock_until: string | null
          provider: string
          refresh_expires_at: string | null
          scopes: string[]
          secret_hints: Json
          status: string
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          account_id?: string | null
          account_name?: string | null
          config?: Json
          connected_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_refresh_at?: string | null
          lock_until?: string | null
          provider: string
          refresh_expires_at?: string | null
          scopes?: string[]
          secret_hints?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          account_id?: string | null
          account_name?: string | null
          config?: Json
          connected_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_refresh_at?: string | null
          lock_until?: string | null
          provider?: string
          refresh_expires_at?: string | null
          scopes?: string[]
          secret_hints?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ml_job_logs: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          job_id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: never
          job_id: string
          level?: string
          message: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: never
          job_id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ml_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_jobs: {
        Row: {
          attempts: number
          cancel_requested: boolean
          concurrency_key: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          entity_id: string | null
          entity_type: string | null
          error_detail: Json | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          lock_expires_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_id: string | null
          payload: Json
          priority: number
          progress: Json | null
          result: Json | null
          run_at: string
          schedule_id: string | null
          started_at: string | null
          status: string
          timeout_seconds: number
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          cancel_requested?: boolean
          concurrency_key?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_detail?: Json | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          parent_id?: string | null
          payload?: Json
          priority?: number
          progress?: Json | null
          result?: Json | null
          run_at?: string
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          timeout_seconds?: number
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          cancel_requested?: boolean
          concurrency_key?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_detail?: Json | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          parent_id?: string | null
          payload?: Json
          priority?: number
          progress?: Json | null
          result?: Json | null
          run_at?: string
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          timeout_seconds?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_jobs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ml_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_jobs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "ml_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_members: {
        Row: {
          created_at: string
          created_by: string | null
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          profile_id: string
          role: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          expires_at: string
          profile_id: string | null
          provider: string
          return_to: string | null
          state: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          profile_id?: string | null
          provider: string
          return_to?: string | null
          state: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          profile_id?: string | null
          provider?: string
          return_to?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_oauth_states_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_performance_stats: {
        Row: {
          commission: number
          computed_at: string
          ctr: number | null
          dimension: string
          impressions: number
          key: string
          outbound_clicks: number
          perf_score: number | null
          period_days: number
          pin_clicks: number
          pins: number
          saves: number
        }
        Insert: {
          commission?: number
          computed_at?: string
          ctr?: number | null
          dimension: string
          impressions?: number
          key: string
          outbound_clicks?: number
          perf_score?: number | null
          period_days: number
          pin_clicks?: number
          pins?: number
          saves?: number
        }
        Update: {
          commission?: number
          computed_at?: string
          ctr?: number | null
          dimension?: string
          impressions?: number
          key?: string
          outbound_clicks?: number
          perf_score?: number | null
          period_days?: number
          pin_clicks?: number
          pins?: number
          saves?: number
        }
        Relationships: []
      }
      ml_pin_metrics: {
        Row: {
          date: string
          fetched_at: string
          impressions: number
          outbound_clicks: number
          pin_clicks: number
          pin_id: string
          raw: Json | null
          saves: number
        }
        Insert: {
          date: string
          fetched_at?: string
          impressions?: number
          outbound_clicks?: number
          pin_clicks?: number
          pin_id: string
          raw?: Json | null
          saves?: number
        }
        Update: {
          date?: string
          fetched_at?: string
          impressions?: number
          outbound_clicks?: number
          pin_clicks?: number
          pin_id?: string
          raw?: Json | null
          saves?: number
        }
        Relationships: [
          {
            foreignKeyName: "ml_pin_metrics_pin_id_fkey"
            columns: ["pin_id"]
            isOneToOne: false
            referencedRelation: "ml_pins"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_pins: {
        Row: {
          affiliate_link_id: string | null
          alt_text: string | null
          attempts: number
          board_id: string | null
          created_at: string
          created_by: string | null
          creative_id: string
          description: string | null
          duplicated_from: string | null
          environment: string | null
          external_pin_id: string | null
          external_url: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          link_url: string | null
          media_url: string | null
          product_id: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          timezone: string | null
          title: string | null
          updated_at: string
          validated_at: string | null
          validation: Json | null
        }
        Insert: {
          affiliate_link_id?: string | null
          alt_text?: string | null
          attempts?: number
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          creative_id: string
          description?: string | null
          duplicated_from?: string | null
          environment?: string | null
          external_pin_id?: string | null
          external_url?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          link_url?: string | null
          media_url?: string | null
          product_id: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
          validated_at?: string | null
          validation?: Json | null
        }
        Update: {
          affiliate_link_id?: string | null
          alt_text?: string | null
          attempts?: number
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          creative_id?: string
          description?: string | null
          duplicated_from?: string | null
          environment?: string | null
          external_pin_id?: string | null
          external_url?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          link_url?: string | null
          media_url?: string | null
          product_id?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
          validated_at?: string | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_pins_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "ml_affiliate_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_pins_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "ml_pinterest_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_pins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_pins_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ml_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_pins_duplicated_from_fkey"
            columns: ["duplicated_from"]
            isOneToOne: false
            referencedRelation: "ml_pins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_pins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_pinterest_boards: {
        Row: {
          active: boolean
          category_ids: string[]
          created_at: string
          description: string | null
          external_id: string
          follower_count: number | null
          id: string
          image_url: string | null
          is_default: boolean
          name: string
          pin_count: number | null
          privacy: string | null
          removed_at: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_ids?: string[]
          created_at?: string
          description?: string | null
          external_id: string
          follower_count?: number | null
          id?: string
          image_url?: string | null
          is_default?: boolean
          name: string
          pin_count?: number | null
          privacy?: string | null
          removed_at?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_ids?: string[]
          created_at?: string
          description?: string | null
          external_id?: string
          follower_count?: number | null
          id?: string
          image_url?: string | null
          is_default?: boolean
          name?: string
          pin_count?: number | null
          privacy?: string | null
          removed_at?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ml_product_rankings: {
        Row: {
          category_id: string
          collected_at: string
          collected_on: string
          external_id: string
          id: number
          item_type: string | null
          position: number
          product_id: string | null
        }
        Insert: {
          category_id: string
          collected_at?: string
          collected_on: string
          external_id: string
          id?: never
          item_type?: string | null
          position: number
          product_id?: string | null
        }
        Update: {
          category_id?: string
          collected_at?: string
          collected_on?: string
          external_id?: string
          id?: never
          item_type?: string | null
          position?: number
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_product_rankings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_product_scores: {
        Row: {
          alerts: Json
          components: Json
          confidence: number
          created_at: string
          eligible: boolean
          formula_version: number
          hard_rule_failures: string[]
          id: string
          missing_data: string[]
          model: string | null
          positives: Json
          product_id: string
          prompt_version: string | null
          reason: string | null
          score: number
          weights: Json
        }
        Insert: {
          alerts?: Json
          components: Json
          confidence: number
          created_at?: string
          eligible: boolean
          formula_version: number
          hard_rule_failures?: string[]
          id?: string
          missing_data?: string[]
          model?: string | null
          positives?: Json
          product_id: string
          prompt_version?: string | null
          reason?: string | null
          score: number
          weights: Json
        }
        Update: {
          alerts?: Json
          components?: Json
          confidence?: number
          created_at?: string
          eligible?: boolean
          formula_version?: number
          hard_rule_failures?: string[]
          id?: string
          missing_data?: string[]
          model?: string | null
          positives?: Json
          product_id?: string
          prompt_version?: string | null
          reason?: string | null
          score?: number
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ml_product_scores_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_product_snapshots: {
        Row: {
          available: boolean | null
          captured_at: string
          discount_pct: number | null
          id: number
          original_price: number | null
          price: number | null
          product_id: string
          rank_category_id: string | null
          rank_position: number | null
          rating: number | null
          raw: Json | null
          reviews_count: number | null
          sold_quantity: number | null
          source: string
        }
        Insert: {
          available?: boolean | null
          captured_at?: string
          discount_pct?: number | null
          id?: never
          original_price?: number | null
          price?: number | null
          product_id: string
          rank_category_id?: string | null
          rank_position?: number | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          sold_quantity?: number | null
          source: string
        }
        Update: {
          available?: boolean | null
          captured_at?: string
          discount_pct?: number | null
          id?: never
          original_price?: number | null
          price?: number | null
          product_id?: string
          rank_category_id?: string | null
          rank_position?: number | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          sold_quantity?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_product_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ml_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_products: {
        Row: {
          ai_analysis: Json | null
          ai_analyzed_at: string | null
          approved_at: string | null
          approved_by: string | null
          attributes: Json
          availability_reason: string | null
          available: boolean | null
          best_rank: number | null
          brand: string | null
          category_id: string | null
          condition: string | null
          cooldown_until: string | null
          created_at: string
          currency: string
          current_price: number | null
          current_rank: number | null
          description: string | null
          discount_pct: number | null
          domain_id: string | null
          eligible: boolean | null
          enriched_at: string | null
          enrichment: Json | null
          external_id: string
          external_type: string
          first_seen_at: string
          free_shipping: boolean | null
          id: string
          item_id: string | null
          last_checked_at: string | null
          last_promoted_at: string | null
          last_seen_at: string
          original_price: number | null
          paused_from: string | null
          permalink: string | null
          pictures: Json
          previous_rank: number | null
          rank_delta: number | null
          rating: number | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_note: string | null
          rejection_reason: string | null
          reviews_count: number | null
          score: number | null
          score_confidence: number | null
          score_id: string | null
          seller: Json | null
          sold_quantity: number | null
          sources: string[]
          status: string
          status_changed_at: string
          status_reason: string | null
          thumbnail: string | null
          times_promoted: number
          times_seen: number
          title: string
          trend_keywords: string[]
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          availability_reason?: string | null
          available?: boolean | null
          best_rank?: number | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cooldown_until?: string | null
          created_at?: string
          currency?: string
          current_price?: number | null
          current_rank?: number | null
          description?: string | null
          discount_pct?: number | null
          domain_id?: string | null
          eligible?: boolean | null
          enriched_at?: string | null
          enrichment?: Json | null
          external_id: string
          external_type?: string
          first_seen_at?: string
          free_shipping?: boolean | null
          id?: string
          item_id?: string | null
          last_checked_at?: string | null
          last_promoted_at?: string | null
          last_seen_at?: string
          original_price?: number | null
          paused_from?: string | null
          permalink?: string | null
          pictures?: Json
          previous_rank?: number | null
          rank_delta?: number | null
          rating?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          rejection_reason?: string | null
          reviews_count?: number | null
          score?: number | null
          score_confidence?: number | null
          score_id?: string | null
          seller?: Json | null
          sold_quantity?: number | null
          sources?: string[]
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          thumbnail?: string | null
          times_promoted?: number
          times_seen?: number
          title: string
          trend_keywords?: string[]
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          availability_reason?: string | null
          available?: boolean | null
          best_rank?: number | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cooldown_until?: string | null
          created_at?: string
          currency?: string
          current_price?: number | null
          current_rank?: number | null
          description?: string | null
          discount_pct?: number | null
          domain_id?: string | null
          eligible?: boolean | null
          enriched_at?: string | null
          enrichment?: Json | null
          external_id?: string
          external_type?: string
          first_seen_at?: string
          free_shipping?: boolean | null
          id?: string
          item_id?: string | null
          last_checked_at?: string | null
          last_promoted_at?: string | null
          last_seen_at?: string
          original_price?: number | null
          paused_from?: string | null
          permalink?: string | null
          pictures?: Json
          previous_rank?: number | null
          rank_delta?: number | null
          rating?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          rejection_reason?: string | null
          reviews_count?: number | null
          score?: number | null
          score_confidence?: number | null
          score_id?: string | null
          seller?: Json | null
          sold_quantity?: number | null
          sources?: string[]
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          thumbnail?: string | null
          times_promoted?: number
          times_seen?: number
          title?: string
          trend_keywords?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_products_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ml_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_products_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_products_score_fk"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "ml_product_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_schedule_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string | null
          note: string | null
          outcome: string
          schedule_id: string
          trigger: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          note?: string | null
          outcome: string
          schedule_id: string
          trigger: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          note?: string | null
          outcome?: string
          schedule_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_schedule_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_schedule_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ml_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "ml_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_schedules: {
        Row: {
          config: Json
          created_at: string
          cron_expression: string
          description: string | null
          enabled: boolean
          id: string
          job_type: string
          key: string
          last_duration_ms: number | null
          last_job_id: string | null
          last_run_at: string | null
          last_status: string | null
          locked_until: string | null
          name: string
          next_run_at: string | null
          overlap_policy: string
          timezone: string
          ui: Json | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          cron_expression: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type: string
          key: string
          last_duration_ms?: number | null
          last_job_id?: string | null
          last_run_at?: string | null
          last_status?: string | null
          locked_until?: string | null
          name: string
          next_run_at?: string | null
          overlap_policy?: string
          timezone?: string
          ui?: Json | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          cron_expression?: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type?: string
          key?: string
          last_duration_ms?: number | null
          last_job_id?: string | null
          last_run_at?: string | null
          last_status?: string | null
          locked_until?: string | null
          name?: string
          next_run_at?: string | null
          overlap_policy?: string
          timezone?: string
          ui?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      ml_scoring_versions: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          params: Json
          version: number
          weights: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          params?: Json
          version: number
          weights: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          params?: Json
          version?: number
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ml_scoring_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
          version: number
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ml_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_status_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string
          entity_type: string
          from_status: string | null
          id: number
          metadata: Json | null
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: never
          metadata?: Json | null
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: never
          metadata?: Json | null
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_tasks: {
        Row: {
          created_at: string
          dedupe_key: string | null
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          priority: number
          resolved_at: string | null
          resolved_by: string | null
          snoozed_until: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          priority?: number
          resolved_at?: string | null
          resolved_by?: string | null
          snoozed_until?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          priority?: number
          resolved_at?: string | null
          resolved_by?: string | null
          snoozed_until?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_trends: {
        Row: {
          captured_on: string
          category_id: string | null
          created_at: string
          id: number
          keyword: string
          position: number | null
          source_url: string | null
          trend_type: string
          url: string | null
          week_start: string
        }
        Insert: {
          captured_on?: string
          category_id?: string | null
          created_at?: string
          id?: never
          keyword: string
          position?: number | null
          source_url?: string | null
          trend_type?: string
          url?: string | null
          week_start: string
        }
        Update: {
          captured_on?: string
          category_id?: string | null
          created_at?: string
          id?: never
          keyword?: string
          position?: number | null
          source_url?: string | null
          trend_type?: string
          url?: string | null
          week_start?: string
        }
        Relationships: []
      }
      nia_acoes: {
        Row: {
          confianca: number | null
          confirmado_em: string | null
          conversa_id: string | null
          criado_em: string | null
          ferramenta: string
          id: string
          mensagem_id: string | null
          nivel_confirmacao: string
          payload_proposto: Json
          profile_id: string | null
          registro_id: string | null
          resultado: Json | null
          status: string
          workspace_id: string
        }
        Insert: {
          confianca?: number | null
          confirmado_em?: string | null
          conversa_id?: string | null
          criado_em?: string | null
          ferramenta: string
          id?: string
          mensagem_id?: string | null
          nivel_confirmacao?: string
          payload_proposto?: Json
          profile_id?: string | null
          registro_id?: string | null
          resultado?: Json | null
          status?: string
          workspace_id: string
        }
        Update: {
          confianca?: number | null
          confirmado_em?: string | null
          conversa_id?: string | null
          criado_em?: string | null
          ferramenta?: string
          id?: string
          mensagem_id?: string | null
          nivel_confirmacao?: string
          payload_proposto?: Json
          profile_id?: string | null
          registro_id?: string | null
          resultado?: Json | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nia_acoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_acoes_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "mensagens_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_acoes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_acoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_alertas: {
        Row: {
          ativo: boolean
          canal: string
          created_at: string
          created_by: string | null
          dia_mes: number | null
          dia_semana: number | null
          frequencia: string
          hora: number
          id: string
          nome: string
          parametros: Json
          publico_alvo: string
          template: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: string
          created_at?: string
          created_by?: string | null
          dia_mes?: number | null
          dia_semana?: number | null
          frequencia?: string
          hora?: number
          id?: string
          nome: string
          parametros?: Json
          publico_alvo?: string
          template?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: string
          created_at?: string
          created_by?: string | null
          dia_mes?: number | null
          dia_semana?: number | null
          frequencia?: string
          hora?: number
          id?: string
          nome?: string
          parametros?: Json
          publico_alvo?: string
          template?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nia_alertas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_alertas_alvos: {
        Row: {
          alerta_id: string
          id: string
          profile_id: string | null
          workspace_id: string
        }
        Insert: {
          alerta_id: string
          id?: string
          profile_id?: string | null
          workspace_id: string
        }
        Update: {
          alerta_id?: string
          id?: string
          profile_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nia_alertas_alvos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "nia_alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_alertas_alvos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_alertas_alvos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_alertas_envios: {
        Row: {
          alerta_id: string | null
          chave_dedup: string
          enviado_em: string
          erro: string | null
          id: string
          mensagem: string | null
          profile_id: string | null
          status: string
          telefone: string | null
          workspace_id: string | null
        }
        Insert: {
          alerta_id?: string | null
          chave_dedup: string
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          profile_id?: string | null
          status?: string
          telefone?: string | null
          workspace_id?: string | null
        }
        Update: {
          alerta_id?: string | null
          chave_dedup?: string
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          profile_id?: string | null
          status?: string
          telefone?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nia_alertas_envios_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "nia_alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_config: {
        Row: {
          ativo: boolean
          criado_em: string | null
          criado_por: string | null
          escopo: string
          escopo_ref: string | null
          id: string
          modelo: string
          parametros: Json
          provedor: string
          system_prompt: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string | null
          criado_por?: string | null
          escopo?: string
          escopo_ref?: string | null
          id?: string
          modelo: string
          parametros?: Json
          provedor: string
          system_prompt: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string | null
          criado_por?: string | null
          escopo?: string
          escopo_ref?: string | null
          id?: string
          modelo?: string
          parametros?: Json
          provedor?: string
          system_prompt?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nia_config_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_contexto: {
        Row: {
          atualizado_em: string | null
          fatos: Json
          perfil: Json
          pre_autorizacoes: Json
          preferencias: Json
          rotina: Json
          workspace_id: string
        }
        Insert: {
          atualizado_em?: string | null
          fatos?: Json
          perfil?: Json
          pre_autorizacoes?: Json
          preferencias?: Json
          rotina?: Json
          workspace_id: string
        }
        Update: {
          atualizado_em?: string | null
          fatos?: Json
          perfil?: Json
          pre_autorizacoes?: Json
          preferencias?: Json
          rotina?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nia_contexto_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_feedback: {
        Row: {
          comentario: string | null
          criado_em: string | null
          id: string
          mensagem_id: string
          profile_id: string | null
          voto: string
          workspace_id: string
        }
        Insert: {
          comentario?: string | null
          criado_em?: string | null
          id?: string
          mensagem_id: string
          profile_id?: string | null
          voto: string
          workspace_id: string
        }
        Update: {
          comentario?: string | null
          criado_em?: string | null
          id?: string
          mensagem_id?: string
          profile_id?: string | null
          voto?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nia_feedback_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "mensagens_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nia_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nia_precos: {
        Row: {
          modelo: string
          preco_entrada_cache_por_milhao: number | null
          preco_entrada_por_milhao: number
          preco_saida_por_milhao: number
          provedor: string
          vigente_desde: string | null
        }
        Insert: {
          modelo: string
          preco_entrada_cache_por_milhao?: number | null
          preco_entrada_por_milhao: number
          preco_saida_por_milhao: number
          provedor: string
          vigente_desde?: string | null
        }
        Update: {
          modelo?: string
          preco_entrada_cache_por_milhao?: number | null
          preco_entrada_por_milhao?: number
          preco_saida_por_milhao?: number
          provedor?: string
          vigente_desde?: string | null
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          categoria_id: string
          created_at: string | null
          entidade_id: string | null
          id: string
          mes_referencia: string
          updated_at: string | null
          valor_planejado: number
          workspace_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          entidade_id?: string | null
          id?: string
          mes_referencia: string
          updated_at?: string | null
          valor_planejado: number
          workspace_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          entidade_id?: string | null
          id?: string
          mes_referencia?: string
          updated_at?: string | null
          valor_planejado?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          asaas_bank_slip_url: string | null
          asaas_invoice_number: string | null
          asaas_invoice_url: string | null
          asaas_payment_id: string
          asaas_pix_qr_code: string | null
          asaas_subscription_id: string | null
          created_at: string | null
          data_credito: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string | null
          id: string
          metadados: Json | null
          metodo: Database["public"]["Enums"]["metodo_cobranca"] | null
          referencia_externa: string | null
          status: Database["public"]["Enums"]["status_pagamento"]
          updated_at: string | null
          valor: number
          valor_liquido: number | null
          workspace_id: string
        }
        Insert: {
          asaas_bank_slip_url?: string | null
          asaas_invoice_number?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id: string
          asaas_pix_qr_code?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          data_credito?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao?: string | null
          id?: string
          metadados?: Json | null
          metodo?: Database["public"]["Enums"]["metodo_cobranca"] | null
          referencia_externa?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor: number
          valor_liquido?: number | null
          workspace_id: string
        }
        Update: {
          asaas_bank_slip_url?: string | null
          asaas_invoice_number?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string
          asaas_pix_qr_code?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          data_credito?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string | null
          id?: string
          metadados?: Json | null
          metodo?: Database["public"]["Enums"]["metodo_cobranca"] | null
          referencia_externa?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor?: number
          valor_liquido?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          exibe_anuncios: boolean | null
          features: Json | null
          id: string
          limites: Json | null
          nome: string
          ordem: number | null
          preco_anual_brl: number | null
          preco_mensal_brl: number | null
          slug: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          exibe_anuncios?: boolean | null
          features?: Json | null
          id?: string
          limites?: Json | null
          nome: string
          ordem?: number | null
          preco_anual_brl?: number | null
          preco_mensal_brl?: number | null
          slug: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          exibe_anuncios?: boolean | null
          features?: Json | null
          id?: string
          limites?: Json | null
          nome?: string
          ordem?: number | null
          preco_anual_brl?: number | null
          preco_mensal_brl?: number | null
          slug?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          apelidos: string[] | null
          categoria_sugerida_id: string | null
          codigo_barras: string | null
          created_at: string | null
          essencialidade_padrao:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          id: string
          marca: string | null
          medida_unidade: string | null
          medida_valor: number | null
          nome: string
          nome_base: string | null
          nome_normalizado: string
          observacoes: string | null
          status_revisao: Database["public"]["Enums"]["status_revisao"] | null
          tipo_padrao: string | null
          ultima_compra_em: string | null
          ultimo_estabelecimento_id: string | null
          ultimo_preco_unitario: number | null
          unidade_padrao: string | null
          updated_at: string | null
          vezes_comprado: number | null
          workspace_id: string
        }
        Insert: {
          apelidos?: string[] | null
          categoria_sugerida_id?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          id?: string
          marca?: string | null
          medida_unidade?: string | null
          medida_valor?: number | null
          nome: string
          nome_base?: string | null
          nome_normalizado: string
          observacoes?: string | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tipo_padrao?: string | null
          ultima_compra_em?: string | null
          ultimo_estabelecimento_id?: string | null
          ultimo_preco_unitario?: number | null
          unidade_padrao?: string | null
          updated_at?: string | null
          vezes_comprado?: number | null
          workspace_id: string
        }
        Update: {
          apelidos?: string[] | null
          categoria_sugerida_id?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          essencialidade_padrao?:
            | Database["public"]["Enums"]["essencialidade"]
            | null
          id?: string
          marca?: string | null
          medida_unidade?: string | null
          medida_valor?: number | null
          nome?: string
          nome_base?: string | null
          nome_normalizado?: string
          observacoes?: string | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tipo_padrao?: string | null
          ultima_compra_em?: string | null
          ultimo_estabelecimento_id?: string | null
          ultimo_preco_unitario?: number | null
          unidade_padrao?: string | null
          updated_at?: string | null
          vezes_comprado?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_sugerida_id_fkey"
            columns: ["categoria_sugerida_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_ultimo_estabelecimento_id_fkey"
            columns: ["ultimo_estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aceitou_privacidade_em: string | null
          aceitou_termos_em: string | null
          avatar_url: string | null
          created_at: string | null
          default_workspace_id: string | null
          email: string | null
          id: string
          nome: string
          onboarding_concluido: boolean | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          aceitou_privacidade_em?: string | null
          aceitou_termos_em?: string | null
          avatar_url?: string | null
          created_at?: string | null
          default_workspace_id?: string | null
          email?: string | null
          id: string
          nome: string
          onboarding_concluido?: boolean | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          aceitou_privacidade_em?: string | null
          aceitou_termos_em?: string | null
          avatar_url?: string | null
          created_at?: string | null
          default_workspace_id?: string | null
          email?: string | null
          id?: string
          nome?: string
          onboarding_concluido?: boolean | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_profile_default_workspace"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bloqueado_ate: string | null
          contagem: number | null
          created_at: string | null
          id: string
          identificador: string
          janela_inicio: string | null
          tipo: string
        }
        Insert: {
          bloqueado_ate?: string | null
          contagem?: number | null
          created_at?: string | null
          id?: string
          identificador: string
          janela_inicio?: string | null
          tipo: string
        }
        Update: {
          bloqueado_ate?: string | null
          contagem?: number | null
          created_at?: string | null
          id?: string
          identificador?: string
          janela_inicio?: string | null
          tipo?: string
        }
        Relationships: []
      }
      recorrencias: {
        Row: {
          ativa: boolean | null
          beneficiario_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          conta_id: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string
          dia_vencimento: number | null
          estabelecimento_id: string | null
          frequencia: Database["public"]["Enums"]["frequencia_recorrencia"]
          id: string
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"] | null
          pagador_id: string | null
          proxima_geracao: string | null
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          ultima_geracao: string | null
          updated_at: string | null
          valor_previsto: number
          variacao_aceitavel_pct: number | null
          workspace_id: string
        }
        Insert: {
          ativa?: boolean | null
          beneficiario_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          descricao: string
          dia_vencimento?: number | null
          estabelecimento_id?: string | null
          frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          id?: string
          meio_pagamento?: Database["public"]["Enums"]["meio_pagamento"] | null
          pagador_id?: string | null
          proxima_geracao?: string | null
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          ultima_geracao?: string | null
          updated_at?: string | null
          valor_previsto: number
          variacao_aceitavel_pct?: number | null
          workspace_id: string
        }
        Update: {
          ativa?: boolean | null
          beneficiario_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          dia_vencimento?: number | null
          estabelecimento_id?: string | null
          frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          id?: string
          meio_pagamento?: Database["public"]["Enums"]["meio_pagamento"] | null
          pagador_id?: string | null
          proxima_geracao?: string | null
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          ultima_geracao?: string | null
          updated_at?: string | null
          valor_previsto?: number
          variacao_aceitavel_pct?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_pagador_id_fkey"
            columns: ["pagador_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes_match: {
        Row: {
          created_at: string | null
          decidido_em: string | null
          decidido_por: string | null
          decisao: string | null
          id: string
          origem: Database["public"]["Enums"]["origem_transacao"] | null
          registro_origem_id: string
          registro_sugerido_id: string
          resolvida: boolean | null
          score_confianca: number
          texto_origem: string
          texto_sugerido: string
          tipo: Database["public"]["Enums"]["tipo_entidade_sugestao"]
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          id?: string
          origem?: Database["public"]["Enums"]["origem_transacao"] | null
          registro_origem_id: string
          registro_sugerido_id: string
          resolvida?: boolean | null
          score_confianca: number
          texto_origem: string
          texto_sugerido: string
          tipo: Database["public"]["Enums"]["tipo_entidade_sugestao"]
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          id?: string
          origem?: Database["public"]["Enums"]["origem_transacao"] | null
          registro_origem_id?: string
          registro_sugerido_id?: string
          resolvida?: boolean | null
          score_confianca?: number
          texto_origem?: string
          texto_sugerido?: string
          tipo?: Database["public"]["Enums"]["tipo_entidade_sugestao"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_match_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_match_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          beneficiario_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          colecao_id: string | null
          conta_id: string | null
          contexto_id: string | null
          created_at: string | null
          criado_por: string | null
          data_lancamento: string | null
          data_transacao: string
          descricao: string
          eh_parcelado: boolean | null
          estabelecimento_id: string | null
          fatura_id: string | null
          id: string
          investimento_id: string | null
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"] | null
          midia_id: string | null
          moeda: string | null
          numero_parcela: number | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_transacao"] | null
          pagador_id: string | null
          recorrencia_id: string | null
          score_confianca: number | null
          status_conciliacao:
            | Database["public"]["Enums"]["status_conciliacao"]
            | null
          status_revisao: Database["public"]["Enums"]["status_revisao"] | null
          tags: string[] | null
          taxa_cambio: number | null
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          total_parcelas: number | null
          transacao_pai_id: string | null
          updated_at: string | null
          valor: number
          valor_brl: number | null
          workspace_id: string
        }
        Insert: {
          beneficiario_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          colecao_id?: string | null
          conta_id?: string | null
          contexto_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_lancamento?: string | null
          data_transacao: string
          descricao: string
          eh_parcelado?: boolean | null
          estabelecimento_id?: string | null
          fatura_id?: string | null
          id?: string
          investimento_id?: string | null
          meio_pagamento?: Database["public"]["Enums"]["meio_pagamento"] | null
          midia_id?: string | null
          moeda?: string | null
          numero_parcela?: number | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_transacao"] | null
          pagador_id?: string | null
          recorrencia_id?: string | null
          score_confianca?: number | null
          status_conciliacao?:
            | Database["public"]["Enums"]["status_conciliacao"]
            | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tags?: string[] | null
          taxa_cambio?: number | null
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          total_parcelas?: number | null
          transacao_pai_id?: string | null
          updated_at?: string | null
          valor: number
          valor_brl?: number | null
          workspace_id: string
        }
        Update: {
          beneficiario_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          colecao_id?: string | null
          conta_id?: string | null
          contexto_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_lancamento?: string | null
          data_transacao?: string
          descricao?: string
          eh_parcelado?: boolean | null
          estabelecimento_id?: string | null
          fatura_id?: string | null
          id?: string
          investimento_id?: string | null
          meio_pagamento?: Database["public"]["Enums"]["meio_pagamento"] | null
          midia_id?: string | null
          moeda?: string | null
          numero_parcela?: number | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_transacao"] | null
          pagador_id?: string | null
          recorrencia_id?: string | null
          score_confianca?: number | null
          status_conciliacao?:
            | Database["public"]["Enums"]["status_conciliacao"]
            | null
          status_revisao?: Database["public"]["Enums"]["status_revisao"] | null
          tags?: string[] | null
          taxa_cambio?: number | null
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          total_parcelas?: number | null
          transacao_pai_id?: string | null
          updated_at?: string | null
          valor?: number
          valor_brl?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_investimento"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "colecoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "v_colecoes_em_aberto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_contexto_id_fkey"
            columns: ["contexto_id"]
            isOneToOne: false
            referencedRelation: "contextos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_midia_id_fkey"
            columns: ["midia_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_pagador_id_fkey"
            columns: ["pagador_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_pai_id_fkey"
            columns: ["transacao_pai_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_pai_id_fkey"
            columns: ["transacao_pai_id"]
            isOneToOne: false
            referencedRelation: "v_pendentes_revisao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_assinaturas: {
        Row: {
          ativa: boolean
          created_at: string
          custo_anual_cents: number
          custo_por_mil_cents: number | null
          fim: string | null
          id: string
          inicio: string
          nome: string
          observacoes: string | null
          padrao_extrato: string | null
          pontos_ano: number
          programa_id: string
          titular_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          custo_anual_cents: number
          custo_por_mil_cents?: number | null
          fim?: string | null
          id?: string
          inicio: string
          nome: string
          observacoes?: string | null
          padrao_extrato?: string | null
          pontos_ano: number
          programa_id: string
          titular_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          custo_anual_cents?: number
          custo_por_mil_cents?: number | null
          fim?: string | null
          id?: string
          inicio?: string
          nome?: string
          observacoes?: string | null
          padrao_extrato?: string | null
          pontos_ano?: number
          programa_id?: string
          titular_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_assinaturas_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_assinaturas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_assinaturas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_extratos: {
        Row: {
          id: string
          importado_em: string
          importado_por: string | null
          midia_id: string | null
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          programa_id: string | null
          saldo_declarado: number | null
          titular_id: string | null
          workspace_id: string
        }
        Insert: {
          id?: string
          importado_em?: string
          importado_por?: string | null
          midia_id?: string | null
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          programa_id?: string | null
          saldo_declarado?: number | null
          titular_id?: string | null
          workspace_id: string
        }
        Update: {
          id?: string
          importado_em?: string
          importado_por?: string | null
          midia_id?: string | null
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          programa_id?: string | null
          saldo_declarado?: number | null
          titular_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_extratos_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_extratos_midia_id_fkey"
            columns: ["midia_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_extratos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_extratos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_extratos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_lotes: {
        Row: {
          assinatura_id: string | null
          created_at: string
          custo_cents: number
          data: string
          descricao: string | null
          expira_em: string | null
          extrato_id: string | null
          id: string
          lote_origem_id: string | null
          origem: string
          programa_id: string
          quantidade: number
          quantidade_restante: number
          titular_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assinatura_id?: string | null
          created_at?: string
          custo_cents?: number
          data: string
          descricao?: string | null
          expira_em?: string | null
          extrato_id?: string | null
          id?: string
          lote_origem_id?: string | null
          origem: string
          programa_id: string
          quantidade: number
          quantidade_restante: number
          titular_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assinatura_id?: string | null
          created_at?: string
          custo_cents?: number
          data?: string
          descricao?: string | null
          expira_em?: string | null
          extrato_id?: string | null
          id?: string
          lote_origem_id?: string | null
          origem?: string
          programa_id?: string
          quantidade?: number
          quantidade_restante?: number
          titular_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_lotes_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "viagem_assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "viagem_extratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_lote_origem_id_fkey"
            columns: ["lote_origem_id"]
            isOneToOne: false
            referencedRelation: "viagem_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_programas: {
        Row: {
          alianca: string | null
          ativo: boolean
          created_at: string
          fonte_seats_aero: string | null
          id: string
          nome: string
          observacoes: string | null
          pais: string | null
          slug: string
          tipo: string
          updated_at: string
          valor_por_mil_cents: number | null
        }
        Insert: {
          alianca?: string | null
          ativo?: boolean
          created_at?: string
          fonte_seats_aero?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          pais?: string | null
          slug: string
          tipo: string
          updated_at?: string
          valor_por_mil_cents?: number | null
        }
        Update: {
          alianca?: string | null
          ativo?: boolean
          created_at?: string
          fonte_seats_aero?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          pais?: string | null
          slug?: string
          tipo?: string
          updated_at?: string
          valor_por_mil_cents?: number | null
        }
        Relationships: []
      }
      viagem_transferencias: {
        Row: {
          ativa: boolean
          bonus_percent: number
          bonus_valido_ate: string | null
          created_at: string
          destino_id: string
          fonte_url: string | null
          id: string
          minimo_transferencia: number
          multiplo: number
          observacoes: string | null
          origem_id: string
          prazo_dias_max: number
          prazo_dias_min: number
          ratio_destino: number
          ratio_origem: number
          updated_at: string
          verificado_em: string | null
        }
        Insert: {
          ativa?: boolean
          bonus_percent?: number
          bonus_valido_ate?: string | null
          created_at?: string
          destino_id: string
          fonte_url?: string | null
          id?: string
          minimo_transferencia?: number
          multiplo?: number
          observacoes?: string | null
          origem_id: string
          prazo_dias_max?: number
          prazo_dias_min?: number
          ratio_destino: number
          ratio_origem: number
          updated_at?: string
          verificado_em?: string | null
        }
        Update: {
          ativa?: boolean
          bonus_percent?: number
          bonus_valido_ate?: string | null
          created_at?: string
          destino_id?: string
          fonte_url?: string | null
          id?: string
          minimo_transferencia?: number
          multiplo?: number
          observacoes?: string | null
          origem_id?: string
          prazo_dias_max?: number
          prazo_dias_min?: number
          ratio_destino?: number
          ratio_origem?: number
          updated_at?: string
          verificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viagem_transferencias_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_transferencias_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ingest_log: {
        Row: {
          created_at: string | null
          idempotency_key: string
          transacao_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          idempotency_key: string
          transacao_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          idempotency_key?: string
          transacao_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ingest_log_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ingest_log_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "v_pendentes_revisao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ingest_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_routing: {
        Row: {
          codigo_verificacao: string | null
          created_at: string | null
          profile_id: string
          telefone: string
          verificado: boolean | null
          verificado_em: string | null
          workspace_id: string
        }
        Insert: {
          codigo_verificacao?: string | null
          created_at?: string | null
          profile_id: string
          telefone: string
          verificado?: boolean | null
          verificado_em?: string | null
          workspace_id: string
        }
        Update: {
          codigo_verificacao?: string | null
          created_at?: string | null
          profile_id?: string
          telefone?: string
          verificado?: boolean | null
          verificado_em?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_routing_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_routing_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          invited_by: string | null
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string | null
          current_period_end: string | null
          id: string
          moeda_principal: string | null
          nome: string
          owner_id: string
          plan_id: string
          settings: Json | null
          slug: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          moeda_principal?: string | null
          nome: string
          owner_id: string
          plan_id: string
          settings?: Json | null
          slug: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          moeda_principal?: string | null
          nome?: string
          owner_id?: string
          plan_id?: string
          settings?: Json | null
          slug?: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_colecoes_em_aberto: {
        Row: {
          categoria_id: string | null
          categoria_nome: string | null
          comportamento:
            | Database["public"]["Enums"]["comportamento_categoria"]
            | null
          cor: string | null
          created_at: string | null
          data_confirmacao: string | null
          data_entrega_real: string | null
          data_estimada_entrega: string | null
          data_fim: string | null
          data_inicio: string | null
          data_pagamento: string | null
          data_pedido: string | null
          descricao: string | null
          icone: string | null
          id: string | null
          metadados: Json | null
          midia_capa_id: string | null
          moeda: string | null
          nome: string | null
          orcamento_previsto: number | null
          organizador: string | null
          participantes: string[] | null
          responsavel_id: string | null
          status_compromisso:
            | Database["public"]["Enums"]["status_colecao_compromisso"]
            | null
          status_projeto:
            | Database["public"]["Enums"]["status_colecao_projeto"]
            | null
          updated_at: string | null
          valor_estimado: number | null
          valor_final: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colecoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colecoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colecoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_colecao_capa"
            columns: ["midia_capa_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inbox_revisao: {
        Row: {
          created_at: string | null
          data_referencia: string | null
          item_id: string | null
          origem: Database["public"]["Enums"]["origem_transacao"] | null
          score_confianca: number | null
          status: string | null
          texto: string | null
          tipo_item: string | null
          valor: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_nia_uso_usuario: {
        Row: {
          custo: number | null
          dia: string | null
          mensagens: number | null
          profile_id: string | null
          tokens_entrada: number | null
          tokens_saida: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_ia_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_ia_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_nia_uso_workspace: {
        Row: {
          custo: number | null
          dia: string | null
          mensagens: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_ia_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pendentes_revisao: {
        Row: {
          beneficiario_id: string | null
          cartao_apelido: string | null
          cartao_id: string | null
          categoria_id: string | null
          categoria_nome: string | null
          colecao_id: string | null
          conta_id: string | null
          created_at: string | null
          criado_por: string | null
          data_lancamento: string | null
          data_transacao: string | null
          descricao: string | null
          eh_parcelado: boolean | null
          estabelecimento_id: string | null
          estabelecimento_nome: string | null
          fatura_id: string | null
          id: string | null
          investimento_id: string | null
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"] | null
          midia_id: string | null
          moeda: string | null
          numero_parcela: number | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_transacao"] | null
          pagador_id: string | null
          recorrencia_id: string | null
          score_confianca: number | null
          status_conciliacao:
            | Database["public"]["Enums"]["status_conciliacao"]
            | null
          status_revisao: Database["public"]["Enums"]["status_revisao"] | null
          tags: string[] | null
          taxa_cambio: number | null
          tipo: Database["public"]["Enums"]["tipo_transacao"] | null
          total_parcelas: number | null
          transacao_pai_id: string | null
          updated_at: string | null
          valor: number | null
          valor_brl: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_investimento"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "colecoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_colecao_id_fkey"
            columns: ["colecao_id"]
            isOneToOne: false
            referencedRelation: "v_colecoes_em_aberto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_midia_id_fkey"
            columns: ["midia_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_pagador_id_fkey"
            columns: ["pagador_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_pai_id_fkey"
            columns: ["transacao_pai_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_pai_id_fkey"
            columns: ["transacao_pai_id"]
            isOneToOne: false
            referencedRelation: "v_pendentes_revisao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_viagem_carteira: {
        Row: {
          custo_por_mil_cents: number | null
          custo_restante_cents: number | null
          lotes_ativos: number | null
          programa_id: string | null
          programa_nome: string | null
          programa_slug: string | null
          proxima_expiracao: string | null
          saldo: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viagem_lotes_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "viagem_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagem_lotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_recorrencias_run_now: { Args: never; Returns: number }
      admin_recorrencias_set_active: {
        Args: { p_active: boolean }
        Returns: boolean
      }
      admin_recorrencias_status: { Args: never; Returns: Json }
      arquivar_contextos_vazios: { Args: never; Returns: number }
      buscar_match_categoria: {
        Args: { p_nome: string; p_threshold?: number; p_workspace_id: string }
        Returns: {
          id: string
          nome: string
          score: number
          slug: string
        }[]
      }
      buscar_match_estabelecimento: {
        Args: { p_nome: string; p_threshold?: number; p_workspace_id: string }
        Returns: {
          id: string
          nome: string
          score: number
        }[]
      }
      buscar_match_produto: {
        Args: {
          p_codigo_barras?: string
          p_nome: string
          p_threshold?: number
          p_workspace_id: string
        }
        Returns: {
          id: string
          nome: string
          score: number
        }[]
      }
      canonizar_unidade: { Args: { p_u: string }; Returns: string }
      combina_conta_fixa: {
        Args: {
          p_descricao_conta: string
          p_descricao_pago: string
          p_valor_pago: number
          p_valor_previsto: number
          p_variacao_pct: number
        }
        Returns: boolean
      }
      comparativo_slugs: {
        Args: {
          p_fim: string
          p_grupos?: string[]
          p_inicio: string
          p_slugs_a: string[]
          p_slugs_b: string[]
          p_workspace_id: string
        }
        Returns: {
          lado: string
          mes: string
          n_transacoes: number
          total: number
        }[]
      }
      compras_pequenas_periodo: {
        Args: {
          p_fim: string
          p_inicio: string
          p_limite: number
          p_workspace_id: string
        }
        Returns: {
          n: number
          total: number
        }[]
      }
      conciliar_conta_fixa: {
        Args: { p_transacao_id: string }
        Returns: string
      }
      conciliar_vencimento: {
        Args: { p_ocorrencia_id: string }
        Returns: string
      }
      confirmar_match: {
        Args: { p_decisao: string; p_sugestao_id: string }
        Returns: undefined
      }
      consultar_item: {
        Args: {
          p_fim?: string
          p_inicio?: string
          p_termo: string
          p_workspace_id: string
        }
        Returns: {
          n_compras: number
          preco_medio: number
          primeira_data: string
          qtd_total: number
          total: number
          ultima_data: string
          ultimo_local: string
          ultimo_valor: number
        }[]
      }
      consultar_transacoes: {
        Args: {
          p_beneficiario_id?: string
          p_fim?: string
          p_inicio?: string
          p_limite?: number
          p_termo?: string
          p_tipo?: string
          p_workspace_id: string
        }
        Returns: {
          data: string
          descricao: string
          id: string
          local: string
          n_geral: number
          total_geral: number
          valor: number
        }[]
      }
      dar_baixa_conta_fixa: {
        Args: {
          p_ocorrencia_id: string
          p_pagamento_id: string
          p_recorrencia_id: string
        }
        Returns: undefined
      }
      desvincular_conta_fixa: {
        Args: { p_transacao_id: string }
        Returns: boolean
      }
      dinheiro_sem_dono: {
        Args: { p_fim: string; p_inicio: string; p_workspace_id: string }
        Returns: {
          n: number
          total: number
        }[]
      }
      fundir_produtos_por_nome_base: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      gastos_por_categoria: {
        Args: { p_mes?: string; p_workspace_id: string }
        Returns: {
          categoria_id: string
          categoria_nome: string
          cor: string
          icone: string
          total: number
        }[]
      }
      gastos_por_categoria_periodo: {
        Args: {
          p_beneficiario?: string
          p_fim: string
          p_inicio: string
          p_workspace_id: string
        }
        Returns: {
          categoria_id: string
          categoria_nome: string
          cor: string
          icone: string
          total: number
        }[]
      }
      gastos_por_categoria_v2: {
        Args: {
          p_beneficiario?: string
          p_mes?: string
          p_workspace_id: string
        }
        Returns: {
          categoria_id: string
          categoria_nome: string
          cor: string
          icone: string
          total: number
        }[]
      }
      gastos_por_contexto: {
        Args: { p_workspace_id: string }
        Returns: {
          contexto_id: string
          cor: string
          data_referencia: string
          icone: string
          n_transacoes: number
          nome: string
          primeira_data: string
          tipo: string
          total: number
          ultima_data: string
        }[]
      }
      gastos_por_essencialidade: {
        Args: {
          p_beneficiario?: string
          p_mes?: string
          p_workspace_id: string
        }
        Returns: {
          essencialidade: Database["public"]["Enums"]["essencialidade"]
          total: number
        }[]
      }
      gastos_por_essencialidade_periodo: {
        Args: {
          p_beneficiario?: string
          p_fim: string
          p_inicio: string
          p_workspace_id: string
        }
        Returns: {
          essencialidade: Database["public"]["Enums"]["essencialidade"]
          total: number
        }[]
      }
      gastos_por_fornecedor: {
        Args: { p_fim: string; p_inicio: string; p_workspace_id: string }
        Returns: {
          id: string
          n: number
          nome: string
          total: number
        }[]
      }
      gastos_por_pessoa: {
        Args: { p_mes?: string; p_workspace_id: string }
        Returns: {
          id: string
          nome: string
          total: number
        }[]
      }
      gastos_por_slugs_periodo: {
        Args: {
          p_fim: string
          p_inicio: string
          p_slugs: string[]
          p_workspace_id: string
        }
        Returns: {
          categoria_id: string
          categoria_nome: string
          icone: string
          n_transacoes: number
          slug: string
          total: number
        }[]
      }
      gastos_por_subcategoria_periodo: {
        Args: {
          p_beneficiario?: string
          p_categoria: string
          p_fim: string
          p_inicio: string
          p_workspace_id: string
        }
        Returns: {
          categoria_id: string
          categoria_nome: string
          cor: string
          icone: string
          total: number
        }[]
      }
      gerar_recorrencias_due: { Args: never; Returns: number }
      is_platform_admin: { Args: never; Returns: boolean }
      medida_regex: { Args: never; Returns: string }
      medida_unidade: { Args: { p_texto: string }; Returns: string }
      medida_valor: { Args: { p_texto: string }; Returns: number }
      meses_com_dados: {
        Args: { p_fim: string; p_inicio: string; p_workspace_id: string }
        Returns: {
          mes: string
          n_transacoes: number
        }[]
      }
      ml_analytics_breakdown: {
        Args: {
          p_dimension?: string
          p_filters?: Json
          p_from: string
          p_to: string
        }
        Returns: {
          commission: number
          ctr: number
          dimension: string
          impressions: number
          key: string
          label: string
          outbound_clicks: number
          pin_clicks: number
          pins: number
          saves: number
        }[]
      }
      ml_analytics_summary: {
        Args: { p_filters?: Json; p_from: string; p_to: string }
        Returns: Json
      }
      ml_claim_due_schedules: {
        Args: { p_limit?: number }
        Returns: {
          config: Json
          created_at: string
          cron_expression: string
          description: string | null
          enabled: boolean
          id: string
          job_type: string
          key: string
          last_duration_ms: number | null
          last_job_id: string | null
          last_run_at: string | null
          last_status: string | null
          locked_until: string | null
          name: string
          next_run_at: string | null
          overlap_policy: string
          timezone: string
          ui: Json | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ml_schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ml_claim_jobs: {
        Args: { p_limit?: number; p_types?: string[]; p_worker: string }
        Returns: {
          attempts: number
          cancel_requested: boolean
          concurrency_key: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          entity_id: string | null
          entity_type: string | null
          error_detail: Json | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          lock_expires_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_id: string | null
          payload: Json
          priority: number
          progress: Json | null
          result: Json | null
          run_at: string
          schedule_id: string | null
          started_at: string | null
          status: string
          timeout_seconds: number
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ml_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ml_cron_tick: { Args: never; Returns: undefined }
      ml_dashboard: { Args: never; Returns: Json }
      ml_faixa_preco: { Args: { p: number }; Returns: string }
      ml_has_role: { Args: { p_min: string }; Returns: boolean }
      ml_integration_try_lock: {
        Args: { p_provider: string; p_seconds?: number }
        Returns: boolean
      }
      ml_integration_unlock: {
        Args: { p_provider: string }
        Returns: undefined
      }
      ml_members_list: {
        Args: never
        Returns: {
          created_at: string
          email: string
          nome: string
          profile_id: string
          role: string
        }[]
      }
      ml_pins_filtrados: {
        Args: { p_filters?: Json }
        Returns: {
          angle_type: string
          board_id: string
          board_name: string
          category_id: string
          category_name: string
          creative_id: string
          headline: string
          pin_id: string
          price: number
          price_band: string
          product_id: string
          published_at: string
          title: string
        }[]
      }
      ml_pode_ler: { Args: never; Returns: boolean }
      ml_product_status_counts: {
        Args: { p_categoria?: string; p_q?: string }
        Returns: Json
      }
      ml_reap_jobs: { Args: never; Returns: number }
      ml_role: { Args: never; Returns: string }
      ml_secret_get: { Args: { p_name: string }; Returns: string }
      ml_secret_set: {
        Args: { p_name: string; p_value: string }
        Returns: undefined
      }
      nia_cron_disparar: { Args: never; Returns: undefined }
      nome_base_produto: { Args: { p_texto: string }; Returns: string }
      normalizar_texto: { Args: { p_texto: string }; Returns: string }
      parcelas_duplicadas: {
        Args: { p_workspace_id: string }
        Returns: {
          categoria_nome: string
          descricao: string
          excedente: number
          n_lancamentos: number
          numero_parcela: number
          primeira_data: string
          total_parcelas: number
          ultima_data: string
          valor_medio: number
        }[]
      }
      provisionar_workspace: {
        Args: { p_nome: string; p_owner_id: string; p_slug?: string }
        Returns: string
      }
      resolve_whatsapp: {
        Args: { p_telefone: string }
        Returns: {
          profile_id: string
          verificado: boolean
          workspace_id: string
        }[]
      }
      resumo_mes: {
        Args: { p_mes?: string; p_workspace_id: string }
        Returns: {
          despesas: number
          receitas: number
          saldo: number
          total_transacoes: number
        }[]
      }
      resumo_periodo: {
        Args: { p_fim: string; p_inicio: string; p_workspace_id: string }
        Returns: {
          despesas: number
          receitas: number
          saldo: number
          total_transacoes: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      similaridade_conta_fixa: {
        Args: { p_a: string; p_b: string }
        Returns: number
      }
      so_digitos: { Args: { p: string }; Returns: string }
      sync_categorias_canonicas: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      total_categoria_mes: {
        Args: { p_categoria_id: string; p_mes?: string; p_workspace_id: string }
        Returns: number
      }
      total_pessoa_mes: {
        Args: {
          p_beneficiario_id: string
          p_mes?: string
          p_workspace_id: string
        }
        Returns: number
      }
      unaccent: { Args: { "": string }; Returns: string }
      user_workspaces: { Args: never; Returns: string[] }
    }
    Enums: {
      comportamento_categoria: "basico" | "projeto" | "compromisso"
      essencialidade: "essencial" | "necessario" | "superfluo" | "investimento"
      frequencia_recorrencia:
        | "diaria"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
      meio_pagamento:
        | "cartao_credito"
        | "cartao_debito"
        | "pix"
        | "dinheiro"
        | "transferencia"
        | "boleto"
        | "vr"
        | "va"
        | "cartao_escola"
        | "outro"
      metodo_cobranca: "CREDIT_CARD" | "BOLETO" | "PIX" | "UNDEFINED"
      origem_transacao:
        | "whatsapp"
        | "fatura_cartao"
        | "manual"
        | "recorrente"
        | "importacao"
        | "app"
      papel_ia: "user" | "assistant" | "system" | "tool"
      status_colecao_compromisso:
        | "aberto"
        | "confirmado"
        | "aguardando_envio"
        | "recebido"
        | "pago"
        | "cancelado"
      status_colecao_projeto:
        | "planejado"
        | "em_andamento"
        | "concluido"
        | "cancelado"
      status_conciliacao: "nao_conciliado" | "conciliado" | "pendente_revisao"
      status_fatura:
        | "aberta"
        | "fechada"
        | "paga"
        | "em_processamento"
        | "atrasada"
      status_pagamento:
        | "pending"
        | "confirmed"
        | "received"
        | "overdue"
        | "refunded"
        | "received_in_cash"
        | "refund_requested"
        | "chargeback_requested"
        | "chargeback_dispute"
        | "awaiting_chargeback_reversal"
        | "dunning_requested"
        | "dunning_received"
        | "awaiting_risk_analysis"
      status_revisao: "confirmado" | "sugerido" | "novo" | "rejeitado"
      subscription_status: "trial" | "active" | "past_due" | "canceled" | "free"
      tipo_conta_bancaria:
        | "corrente"
        | "poupanca"
        | "salario"
        | "pagamento"
        | "investimento"
      tipo_entidade: "pessoa" | "grupo"
      tipo_entidade_sugestao:
        | "estabelecimento"
        | "produto"
        | "categoria"
        | "entidade"
      tipo_investimento:
        | "renda_fixa"
        | "tesouro"
        | "acoes"
        | "fundos"
        | "previdencia"
        | "cripto"
        | "imovel"
        | "outros"
      tipo_midia: "imagem" | "pdf" | "audio" | "video" | "texto" | "documento"
      tipo_transacao:
        | "despesa"
        | "receita"
        | "transferencia"
        | "investimento_aporte"
        | "investimento_resgate"
      workspace_role: "owner" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      comportamento_categoria: ["basico", "projeto", "compromisso"],
      essencialidade: ["essencial", "necessario", "superfluo", "investimento"],
      frequencia_recorrencia: [
        "diaria",
        "semanal",
        "quinzenal",
        "mensal",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
      ],
      meio_pagamento: [
        "cartao_credito",
        "cartao_debito",
        "pix",
        "dinheiro",
        "transferencia",
        "boleto",
        "vr",
        "va",
        "cartao_escola",
        "outro",
      ],
      metodo_cobranca: ["CREDIT_CARD", "BOLETO", "PIX", "UNDEFINED"],
      origem_transacao: [
        "whatsapp",
        "fatura_cartao",
        "manual",
        "recorrente",
        "importacao",
        "app",
      ],
      papel_ia: ["user", "assistant", "system", "tool"],
      status_colecao_compromisso: [
        "aberto",
        "confirmado",
        "aguardando_envio",
        "recebido",
        "pago",
        "cancelado",
      ],
      status_colecao_projeto: [
        "planejado",
        "em_andamento",
        "concluido",
        "cancelado",
      ],
      status_conciliacao: ["nao_conciliado", "conciliado", "pendente_revisao"],
      status_fatura: [
        "aberta",
        "fechada",
        "paga",
        "em_processamento",
        "atrasada",
      ],
      status_pagamento: [
        "pending",
        "confirmed",
        "received",
        "overdue",
        "refunded",
        "received_in_cash",
        "refund_requested",
        "chargeback_requested",
        "chargeback_dispute",
        "awaiting_chargeback_reversal",
        "dunning_requested",
        "dunning_received",
        "awaiting_risk_analysis",
      ],
      status_revisao: ["confirmado", "sugerido", "novo", "rejeitado"],
      subscription_status: ["trial", "active", "past_due", "canceled", "free"],
      tipo_conta_bancaria: [
        "corrente",
        "poupanca",
        "salario",
        "pagamento",
        "investimento",
      ],
      tipo_entidade: ["pessoa", "grupo"],
      tipo_entidade_sugestao: [
        "estabelecimento",
        "produto",
        "categoria",
        "entidade",
      ],
      tipo_investimento: [
        "renda_fixa",
        "tesouro",
        "acoes",
        "fundos",
        "previdencia",
        "cripto",
        "imovel",
        "outros",
      ],
      tipo_midia: ["imagem", "pdf", "audio", "video", "texto", "documento"],
      tipo_transacao: [
        "despesa",
        "receita",
        "transferencia",
        "investimento_aporte",
        "investimento_resgate",
      ],
      workspace_role: ["owner", "member"],
    },
  },
} as const
