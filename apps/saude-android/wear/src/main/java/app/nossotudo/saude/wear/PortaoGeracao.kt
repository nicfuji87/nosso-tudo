package app.nossotudo.saude.wear

/**
 * Portão da geração da conexão (v0.9.8) — Kotlin puro, seguro entre threads.
 *
 * Os callbacks do Samsung Health Sensor SDK chegam em threads do SDK. A máquina de estados ([MonitorSensor])
 * roda na thread principal, mas a gravação do batimento ([EstadoSaude.registrarLote]) acontecia ANTES de a
 * geração ser conferida — um listener antigo podia alimentar FC e VFC depois de religado. Aqui a conferência
 * e a ação acontecem sob o mesmo lock que troca a geração: depois que [abrir]/[fechar] retorna, nenhum
 * callback de geração antiga executa mais nada.
 */
class PortaoGeracao {
    private var atual = -1

    /** Nova conexão: só callbacks da geração [g] passam. */
    @Synchronized fun abrir(g: Int) { atual = g }

    /** Desconexão intencional (religar / serviço parando): nenhum callback passa até a próxima [abrir]. */
    @Synchronized fun fechar() { atual = -1 }

    @Synchronized fun eAtual(g: Int): Boolean = g == atual

    /** Executa [bloco] só se [g] ainda é a geração atual, de forma atômica em relação a [abrir]/[fechar]. */
    @Synchronized fun <T> seAtual(g: Int, bloco: () -> T): T? = if (g == atual) bloco() else null
}

/** Regras dos callbacks do SDK, separadas para teste (o serviço só delega para cá). */
object CallbacksSensor {
    /**
     * Lote de batimento: registra (FC/VFC) só se a geração for a atual; devolve o resultado para a máquina
     * de estados, ou null quando o callback é antigo (nada foi gravado).
     */
    fun aoReceberLote(portao: PortaoGeracao, g: Int, registrar: () -> EstadoSaude.ResultadoLote): EstadoSaude.ResultadoLote? =
        portao.seAtual(g, registrar)

    /**
     * Conexão encerrada: só a geração atual segura o processador acordado e pede recuperação.
     * Desconexão intencional ou conexão antiga não acorda nada. Devolve se tratou.
     */
    fun aoFimDaConexao(portao: PortaoGeracao, g: Int, segurarAcordado: () -> Unit, processar: () -> Unit): Boolean {
        if (!portao.eAtual(g)) return false
        segurarAcordado()
        processar()
        return true
    }
}

/** Filas de envio do relógio. Todas entram na contagem de pendências (antes "lacunas" ficava de fora). */
object FilasEnvio {
    val TODAS = listOf("bpm", "vfc", "temp", "transicoes", "registros", "ecgs", "lacunas")
    fun pendentes(tamanho: (String) -> Int): Int = TODAS.sumOf(tamanho)
}
