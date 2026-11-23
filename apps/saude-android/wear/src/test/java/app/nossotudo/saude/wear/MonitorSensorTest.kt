package app.nossotudo.saude.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cenários da coleta noturna (v0.9.7) com relógio simulado — sem Android, sem Samsung. */
class MonitorSensorTest {
    private var t = 1_000_000_000L
    private val min = 60_000L
    private fun avancar(ms: Long) { t += ms }
    private fun monitor(ultimoValidoAnterior: Long = 0L) = MonitorSensor({ t }, ultimoValidoAnteriorMs = ultimoValidoAnterior)

    /** Conecta, inscreve e recebe 1 batimento válido. Devolve a geração. */
    private fun conectarEReceber(m: MonitorSensor, motivo: String? = null): Int {
        val g = m.iniciarConexao(motivo)
        assertTrue(m.conectado(g))
        m.inscrito(g)
        m.lote(g, validos = 1, foraDoPulso = false)
        return g
    }

    @Test fun fluxoNormal_recebendo_naoFazNada() {
        val m = monitor()
        val g = conectarEReceber(m)
        assertEquals(EstadoSensor.RECEIVING, m.estado)
        repeat(10) { avancar(30_000); m.lote(g, 1, false); assertEquals(Decisao.Nada, m.avaliar()) }
        assertTrue(m.retirarLacunas().isEmpty())
    }

    @Test fun listenerRegistrado_naoEhRecuperacao_ateOPrimeiroValido() {
        val m = monitor()
        conectarEReceber(m)
        avancar(8 * min)
        assertTrue(m.avaliar() is Decisao.Religar)                 // parou de chegar lote
        val g = m.iniciarConexao("sem lotes")
        m.inscrito(g)
        assertEquals(EstadoSensor.SUBSCRIBED, m.estado)
        assertTrue("ainda recuperando: a trava não pode sair", m.recuperando)
        avancar(3_000)
        assertFalse("lote inválido não prova recuperação", m.lote(g, validos = 0, foraDoPulso = false))
        assertTrue(m.recuperando)
        avancar(2_000)
        assertTrue("primeiro válido = solta a trava", m.lote(g, validos = 1, foraDoPulso = false))
        assertFalse(m.recuperando)
        assertFalse("segundo válido não é 'primeiro'", m.lote(g, 1, false))
    }

    @Test fun doze_alarmeAtrasado_religaNaHora_eRegistraLacuna() {
        val m = monitor()
        conectarEReceber(m)
        val inicioLacuna = t
        avancar(37 * min)                                           // alarme disparou com 27 min de atraso
        val d = m.avaliar()
        assertTrue(d is Decisao.Religar)
        val g = m.iniciarConexao((d as Decisao.Religar).motivo)
        m.inscrito(g)
        avancar(8_000)
        m.lote(g, 1, false)
        val l = m.retirarLacunas().single()
        assertEquals(inicioLacuna, l.inicioMs)
        assertEquals("sem_lotes", l.causa)
        assertEquals(1, l.reconexoes)
        assertEquals(8_000L, l.recuperacaoMs)
    }

    @Test fun soDadosInvalidos_noPulso_religa() {
        val m = monitor()
        val g = conectarEReceber(m)
        repeat(10) { avancar(min); m.lote(g, validos = 0, foraDoPulso = false) }  // lotes chegam, sem batimento
        val d = m.avaliar()
        assertTrue("lotes inválidos não podem passar por medição normal", d is Decisao.Religar)
        assertEquals(EstadoSensor.STALE, m.estado)
    }

    @Test fun foraDoPulso_naoReligar_eLacunaJustificada() {
        val m = monitor()
        val g = conectarEReceber(m)
        repeat(20) { avancar(min); m.lote(g, validos = 0, foraDoPulso = true); assertEquals(Decisao.Nada, m.avaliar()) }
        avancar(min)
        m.lote(g, 1, false)
        assertEquals("fora_do_pulso", m.retirarLacunas().single().causa)
        assertEquals(0, m.reconexoesTotal)
    }

    @Test fun carregando_naoReligar_eLacunaCarregando() {
        val m = monitor()
        conectarEReceber(m)
        m.definirCarregando(true)
        avancar(60 * min)
        assertEquals(Decisao.Nada, m.avaliar())
        m.definirCarregando(false)
        val g = m.geracao
        m.lote(g, 1, false)
        assertEquals("carregando", m.retirarLacunas().single().causa)
    }

    @Test fun reconexaoFalha_backoffCrescente_semConcorrencia() {
        val m = monitor()
        conectarEReceber(m)
        avancar(8 * min)
        var d = m.avaliar(); assertTrue(d is Decisao.Religar)       // 1ª tentativa imediata
        var g = m.iniciarConexao("sem lotes")
        m.falhaConexao(g, permanente = false, descricao = "erro 1")
        d = m.avaliar(); assertTrue(d is Decisao.Aguardar)          // 30 s
        assertEquals(t + 30_000L, (d as Decisao.Aguardar).ateMs)
        avancar(30_000)
        assertTrue(m.avaliar() is Decisao.Religar)
        g = m.iniciarConexao("falha")
        m.falhaConexao(g, false, "erro 2")
        d = m.avaliar(); assertEquals(t + 2 * min, (d as Decisao.Aguardar).ateMs)
        avancar(2 * min)
        g = m.iniciarConexao("falha")
        m.falhaConexao(g, false, "erro 3")
        d = m.avaliar(); assertEquals(t + 5 * min, (d as Decisao.Aguardar).ateMs)
        avancar(5 * min)
        repeat(3) {                                                  // o teto é 10 min
            g = m.iniciarConexao("falha"); m.falhaConexao(g, false, "erro")
            d = m.avaliar(); assertEquals(t + 10 * min, (d as Decisao.Aguardar).ateMs)
            avancar(10 * min)
        }
        // sucesso zera o backoff
        g = m.iniciarConexao("falha"); m.inscrito(g); m.lote(g, 1, false)
        assertEquals(0, m.tentativasSeguidas)
    }

    @Test fun conexaoAntigaEncerrando_duranteRecuperacao_eIgnorada() {
        val m = monitor()
        val g0 = conectarEReceber(m)
        avancar(8 * min)
        m.avaliar()
        val g1 = m.iniciarConexao("sem lotes")                     // ao religar, desconectamos g0
        m.conexaoEncerrada(g0)                                      // callback da desconexão intencional
        assertEquals("callback antigo não muda o estado", EstadoSensor.RECOVERING, m.estado)
        assertFalse("lote da conexão antiga é ignorado", m.lote(g0, 1, false))
        assertFalse(m.conectado(g0))
        assertTrue(m.conectado(g1))
        m.conexaoEncerrada(g1)                                      // caiu durante a recuperação
        assertEquals(EstadoSensor.DISCONNECTED, m.estado)
        assertTrue("2ª tentativa respeita o backoff", m.avaliar() is Decisao.Aguardar)
    }

    @Test fun timeoutDeConexao_tentaDeNovo() {
        val m = monitor()
        m.iniciarConexao(null)
        avancar(59_000); assertEquals(Decisao.Nada, m.avaliar())
        avancar(2_000);  assertTrue(m.avaliar() is Decisao.Religar)
    }

    @Test fun erroPermanente_bloqueia_naoInsiste() {
        val m = monitor()
        val g = conectarEReceber(m)
        m.erroRastreador(g, "PERMISSION_ERROR")
        assertEquals(EstadoSensor.BLOCKED, m.estado)
        repeat(20) { avancar(10 * min); assertEquals(Decisao.Nada, m.avaliar()) }
        assertEquals(0, m.reconexoesTotal)
        m.desbloquear()
        assertTrue(m.avaliar() is Decisao.Religar)
    }

    @Test fun falhaDeConexaoComResolucao_bloqueia() {
        val m = monitor()
        val g = m.iniciarConexao(null)
        m.falhaConexao(g, permanente = true, descricao = "erro 2 (tem resolução)")
        assertEquals(EstadoSensor.BLOCKED, m.estado)
        assertEquals(Decisao.Nada, m.avaliar())
    }

    @Test fun erroRecuperavel_doRastreador_religa() {
        val m = monitor()
        val g = conectarEReceber(m)
        m.erroRastreador(g, "OUTRO_ERRO")
        assertEquals(EstadoSensor.STALE, m.estado)
        assertTrue(m.avaliar() is Decisao.Religar)
    }

    @Test fun processoEncerrado_reinicio_viraLacunaServicoReiniciado() {
        val antes = t
        avancar(42 * min)                                           // processo morto / relógio reiniciou
        val m = monitor(ultimoValidoAnterior = antes)
        val g = m.iniciarConexao(null)
        m.inscrito(g)
        m.lote(g, 1, false)
        val l = m.retirarLacunas().single()
        assertEquals(antes, l.inicioMs)
        assertEquals("servico_reiniciado", l.causa)
        assertNull(l.recuperacaoMs)
    }

    @Test fun lacunaCurta_naoERegistrada() {
        val m = monitor()
        val g = conectarEReceber(m)
        avancar(90_000)
        m.lote(g, 1, false)
        assertTrue(m.retirarLacunas().isEmpty())
    }

    @Test fun vigia_decisao() {
        assertEquals(VigiaAlarme.Acao.VIGIAR, VigiaAlarme.decidir(servicoVivo = true, automaticoAtivo = true))
        assertEquals("processo encerrado: religa o serviço", VigiaAlarme.Acao.RELIGAR_SERVICO, VigiaAlarme.decidir(false, true))
        assertEquals(VigiaAlarme.Acao.PARAR, VigiaAlarme.decidir(true, false))
        assertEquals(VigiaAlarme.Acao.PARAR, VigiaAlarme.decidir(false, false))
    }

    /** Tela apagada (medido no Watch6 em 23/11): o SDK entrega lotes a cada ~3 min com leituras contínuas. */
    @Test fun lotesAtrasados_comLeiturasContinuas_naoSaoLacuna_nemReligam() {
        val m = monitor()
        val g = conectarEReceber(m)
        var ultimaLeitura = t
        repeat(20) {
            avancar(3 * min)                                        // chegada do lote
            m.lote(g, validos = 170, foraDoPulso = false, primeiraAmostraMs = ultimaLeitura + 1_000, ultimaAmostraMs = t - 2_000)
            ultimaLeitura = t - 2_000
            assertEquals("lote a cada 3 min não pode disparar religação", Decisao.Nada, m.avaliar())
        }
        assertTrue("leituras contínuas: nenhuma lacuna", m.retirarLacunas().isEmpty())
        assertEquals(0, m.reconexoesTotal)
    }

    @Test fun lacuna_usaHorarioDaLeitura_naoDaChegada() {
        val m = monitor()
        val g = conectarEReceber(m)
        val ultimaLeitura = t
        avancar(20 * min)                                           // o lote chega 20 min depois...
        m.lote(g, 30, false, primeiraAmostraMs = ultimaLeitura + 12 * min, ultimaAmostraMs = t)  // ...mas as leituras voltaram aos 12 min
        val l = m.retirarLacunas().single()
        assertEquals(ultimaLeitura, l.inicioMs)
        assertEquals("fim = primeira leitura válida, não a chegada", ultimaLeitura + 12 * min, l.fimMs)
    }

    @Test fun silencioReal_aindaReligaDepoisDoLimite() {
        val m = monitor()
        conectarEReceber(m)
        avancar(6 * min); assertEquals(Decisao.Nada, m.avaliar())
        avancar(2 * min); assertTrue(m.avaliar() is Decisao.Religar)
    }
}
