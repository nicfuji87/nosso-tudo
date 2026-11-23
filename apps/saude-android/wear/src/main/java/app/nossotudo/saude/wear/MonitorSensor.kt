package app.nossotudo.saude.wear

/**
 * Máquina de estados da coleta de batimento (v0.9.7) — Kotlin puro, sem Android, testável no computador.
 *
 * Estados: DISCONNECTED → CONNECTING/RECOVERING → SUBSCRIBED (listener registrado) → RECEIVING (chegou
 * batimento VÁLIDO) → STALE (parou de chegar lote, ou só chega dado inválido com o relógio no pulso).
 * BLOCKED = erro permanente (permissão, política do SDK, conexão que exige ação do usuário): não tenta
 * religar sozinho até o app ser aberto.
 *
 * Cada tentativa de conexão ganha uma GERAÇÃO. Callbacks de uma geração antiga (inclusive o
 * onConnectionEnded disparado pela nossa própria desconexão ao religar) são ignorados — assim não há
 * reconexões concorrentes nem laços provocados por desconexões intencionais.
 *
 * Também registra as LACUNAS: ao voltar o primeiro batimento válido depois de ≥ 2 min sem nenhum, guarda
 * início, fim, causa, reconexões feitas e o tempo da última tentativa até o primeiro batimento.
 */
enum class EstadoSensor { DISCONNECTED, CONNECTING, SUBSCRIBED, RECEIVING, STALE, RECOVERING, BLOCKED }

sealed interface Decisao {
    data object Nada : Decisao
    data class Religar(val motivo: String) : Decisao
    data class Aguardar(val ateMs: Long, val motivo: String) : Decisao
}

data class Lacuna(
    val inicioMs: Long, val fimMs: Long, val causa: String, val reconexoes: Int, val recuperacaoMs: Long?,
)

class MonitorSensor(
    private val agora: () -> Long,
    /**
     * sem NENHUM lote por este tempo (fora do carregador) → sensor parado. v0.9.9: com a tela apagada o SDK
     * entrega em lotes a cada ~3 min (medido no Watch6 em 23/11) — 4 min ficava perto demais e religaria à toa.
     */
    val semLoteMs: Long = 7 * 60_000L,
    /** chegam lotes, mas sem batimento válido por este tempo, com o relógio no pulso → sensor travado */
    val semValidoMs: Long = 9 * 60_000L,
    /** conexão pedida e nenhuma resposta (sucesso/falha) neste tempo → nova tentativa */
    val timeoutConexaoMs: Long = 60_000L,
    /** espera entre tentativas seguidas sem sucesso (a 1ª é imediata) */
    val backoffMs: List<Long> = listOf(0L, 30_000L, 2 * 60_000L, 5 * 60_000L, 10 * 60_000L),
    /** só vira "lacuna" registrada a partir deste tempo sem batimento válido */
    val lacunaMinMs: Long = 2 * 60_000L,
    /** último batimento válido antes de o serviço (re)começar — lacuna por serviço parado/processo encerrado */
    ultimoValidoAnteriorMs: Long = 0L,
) {
    var estado = EstadoSensor.DISCONNECTED; private set
    var geracao = 0; private set
    var ultimoLoteMs = 0L; private set
    /** CHEGADA do último lote com batimento válido (para a vigia: o sensor está entregando?) */
    var ultimoValidoMs = 0L; private set
    /** HORÁRIO DA LEITURA do último batimento válido (para as lacunas: lote atrasado não é lacuna) */
    var ultimaAmostraValidaMs = ultimoValidoAnteriorMs; private set
    var ultimaTentativaMs = 0L; private set
    var inscritoEmMs = 0L; private set
    var tentativasSeguidas = 0; private set
    var reconexoesTotal = 0; private set
    var bloqueio: String? = null; private set
    var ultimaRecuperacaoMs: Long? = null; private set

    private var causaAtual: String? = if (ultimoValidoAnteriorMs > 0) "servico_reiniciado" else null
    private var reconexoesNaLacuna = 0
    private var ultimoForaDoPulsoMs = 0L
    private var carregouDesde = 0L
    private var carregando = false
    private val lacunas = ArrayDeque<Lacuna>()

    // ------------------------------------------------------------ eventos

    /** Pede uma conexão nova. [motivo] = null na primeira conexão; texto quando é recuperação. Devolve a geração. */
    fun iniciarConexao(motivo: String?): Int {
        geracao++
        ultimaTentativaMs = agora()
        if (motivo != null) {
            estado = EstadoSensor.RECOVERING
            tentativasSeguidas++
            reconexoesTotal++
            reconexoesNaLacuna++
            if (causaAtual == null) causaAtual = motivo
        } else {
            estado = EstadoSensor.CONNECTING
        }
        return geracao
    }

    /** Conectou ao serviço da Samsung. Devolve se a geração ainda vale (se não, ignore o callback). */
    fun conectado(g: Int): Boolean = g == geracao && (estado == EstadoSensor.CONNECTING || estado == EstadoSensor.RECOVERING)

    /** Listener do batimento registrado (ainda NÃO prova que o sensor voltou). */
    fun inscrito(g: Int) {
        if (g != geracao || estado == EstadoSensor.BLOCKED) return
        estado = EstadoSensor.SUBSCRIBED
        inscritoEmMs = agora()
    }

    /**
     * Chegou um lote. [validos] = batimentos válidos no lote; [foraDoPulso] = o SDK disse "fora do pulso".
     * Devolve true quando é o PRIMEIRO batimento válido depois de uma falha (hora de soltar a trava).
     */
    fun lote(g: Int, validos: Int, foraDoPulso: Boolean, primeiraAmostraMs: Long = -1L, ultimaAmostraMs: Long = -1L): Boolean {
        if (g != geracao) return false
        val t = agora()
        ultimoLoteMs = t
        if (foraDoPulso) ultimoForaDoPulsoMs = t
        if (validos <= 0) return false
        // lacuna = intervalo entre LEITURAS válidas (não entre chegadas: com a tela apagada os lotes chegam atrasados)
        val primeira = if (primeiraAmostraMs > 0) primeiraAmostraMs else t
        val ultima = if (ultimaAmostraMs > 0) ultimaAmostraMs else t
        val anterior = ultimaAmostraValidaMs
        val voltou = estado != EstadoSensor.RECEIVING
        if (anterior > 0 && primeira - anterior >= lacunaMinMs) {
            val causa = causaAtual ?: when {
                ultimoForaDoPulsoMs >= anterior -> "fora_do_pulso"
                carregouDesde >= anterior || carregando -> "carregando"
                else -> "sem_dados"
            }
            // tempo de recuperação = da última tentativa de religar até o 1º batimento válido (só se houve tentativa)
            val rec = if (reconexoesNaLacuna > 0 && ultimaTentativaMs > anterior) t - ultimaTentativaMs else null
            lacunas.addLast(Lacuna(anterior, primeira, causa, reconexoesNaLacuna, rec))
            while (lacunas.size > 100) lacunas.removeFirst()
            if (rec != null) ultimaRecuperacaoMs = rec
        }
        ultimoValidoMs = t
        ultimaAmostraValidaMs = maxOf(ultimaAmostraValidaMs, ultima)
        estado = EstadoSensor.RECEIVING
        causaAtual = null
        reconexoesNaLacuna = 0
        tentativasSeguidas = 0
        return voltou
    }

    /** O serviço da Samsung encerrou a conexão (não intencional se a geração é a atual). */
    fun conexaoEncerrada(g: Int) {
        if (g != geracao || estado == EstadoSensor.BLOCKED) return
        estado = EstadoSensor.DISCONNECTED
        if (causaAtual == null) causaAtual = "conexao_encerrada"
    }

    /** Falha ao conectar. [permanente] = exige ação do usuário (ex.: erro com resolução, plataforma antiga). */
    fun falhaConexao(g: Int, permanente: Boolean, descricao: String) {
        if (g != geracao) return
        if (permanente) { bloquear("conexão: $descricao"); return }
        estado = EstadoSensor.DISCONNECTED
        if (causaAtual == null) causaAtual = "falha_conexao"
    }

    /** onError do rastreador. Permissão/política do SDK = permanente; o resto, recuperável. */
    fun erroRastreador(g: Int, erro: String) {
        if (g != geracao) return
        if (erro in ERROS_PERMANENTES) { bloquear(erro); return }
        estado = EstadoSensor.STALE
        if (causaAtual == null) causaAtual = "erro_rastreador:$erro"
    }

    fun definirCarregando(c: Boolean) {
        if (c && !carregando) carregouDesde = agora()
        carregando = c
    }

    /** Desconexão pedida por nós (serviço parando): invalida callbacks pendentes. */
    fun encerrar() {
        geracao++
        estado = EstadoSensor.DISCONNECTED
    }

    fun desbloquear() {
        bloqueio = null
        estado = EstadoSensor.DISCONNECTED
        tentativasSeguidas = 0
    }

    private fun bloquear(motivo: String) {
        estado = EstadoSensor.BLOCKED
        bloqueio = motivo
        causaAtual = "bloqueado:$motivo"
    }

    /** Lacunas fechadas desde a última leitura (para enfileirar e enviar). */
    fun retirarLacunas(): List<Lacuna> = lacunas.toList().also { lacunas.clear() }

    // ------------------------------------------------------------ vigia

    /** O que fazer agora. Chamada a cada minuto pelo serviço e pelo alarme da vigia. */
    fun avaliar(): Decisao {
        val t = agora()
        return when (estado) {
            EstadoSensor.BLOCKED -> Decisao.Nada
            EstadoSensor.CONNECTING, EstadoSensor.RECOVERING ->
                if (t - ultimaTentativaMs < timeoutConexaoMs) Decisao.Nada
                else { if (causaAtual == null) causaAtual = "timeout_conexao"; comBackoff(t, "sem resposta da conexão") }
            EstadoSensor.DISCONNECTED -> comBackoff(t, causaAtual ?: "desconectado")
            EstadoSensor.STALE -> comBackoff(t, causaAtual ?: "sem dados")
            EstadoSensor.SUBSCRIBED, EstadoSensor.RECEIVING -> {
                if (carregando) return Decisao.Nada // no carregador não há batimento: lacuna justificada
                val semLote = t - maxOf(ultimoLoteMs, inscritoEmMs)
                if (semLote > semLoteMs) {
                    estado = EstadoSensor.STALE
                    if (causaAtual == null) causaAtual = "sem_lotes"
                    return comBackoff(t, "sem lotes há ${semLote / 60_000} min")
                }
                val foraRecente = t - ultimoForaDoPulsoMs < semValidoMs
                val semValido = t - maxOf(ultimoValidoMs, inscritoEmMs)
                if (semValido > semValidoMs && !foraRecente) {
                    estado = EstadoSensor.STALE
                    if (causaAtual == null) causaAtual = "so_dados_invalidos"
                    return comBackoff(t, "só dados inválidos há ${semValido / 60_000} min")
                }
                Decisao.Nada
            }
        }
    }

    private fun comBackoff(t: Long, motivo: String): Decisao {
        val espera = backoffMs[minOf(tentativasSeguidas, backoffMs.lastIndex)]
        val pode = ultimaTentativaMs + espera
        return if (t >= pode) Decisao.Religar(motivo) else Decisao.Aguardar(pode, motivo)
    }

    /** Está tentando voltar (mantém o processador acordado até o primeiro batimento válido ou o tempo-limite). */
    val recuperando: Boolean
        get() = estado == EstadoSensor.CONNECTING || estado == EstadoSensor.RECOVERING ||
            (estado == EstadoSensor.SUBSCRIBED && tentativasSeguidas > 0)

    companion object {
        val ERROS_PERMANENTES = setOf("PERMISSION_ERROR", "SDK_POLICY_ERROR")
    }
}
