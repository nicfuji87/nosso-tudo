package app.nossotudo.saude.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.ValueKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** ECG sob demanda (~30 s, app em primeiro plano, dedo no botão superior). Grava CSV e expõe o traçado ao vivo. */
class EcgSessao(private val ctx: Context) {

    sealed interface Estado {
        data object Parado : Estado
        data object Conectando : Estado
        data class Medindo(val segundos: Int, val contato: Boolean) : Estado
        data class Concluido(val amostras: Long, val hz: Int, val arquivo: String) : Estado
        data class Erro(val msg: String) : Estado
    }

    private val _estado = MutableStateFlow<Estado>(Estado.Parado)
    val estado: StateFlow<Estado> = _estado.asStateFlow()

    /** Últimas ~3 s de ECG em mV (500 Hz). */
    private val _traco = MutableStateFlow<List<Float>>(emptyList())
    val traco: StateFlow<List<Float>> = _traco.asStateFlow()

    private val main = Handler(Looper.getMainLooper())
    private var sensores: Sensores? = null
    private var tracker: HealthTracker? = null
    private var gravador: GravadorCsv? = null
    private val buffer = ArrayDeque<Float>()
    private var inicio = 0L

    fun iniciar(duracaoMs: Long = 30_000) {
        if (_estado.value is Estado.Conectando || _estado.value is Estado.Medindo) return
        if (ColetaService.rodando) {
            _estado.value = Estado.Erro("Pare a coleta contínua antes do ECG")
            return
        }
        _estado.value = Estado.Conectando
        buffer.clear(); _traco.value = emptyList()
        val s = Sensores(ctx).also { sensores = it }
        s.conectar(
            onOk = { main.post { comecar(s, duracaoMs) } },
            onFalha = { e -> main.post { encerrar(Estado.Erro(Sensores.descreverErro(e))) } },
        )
    }

    private fun comecar(s: Sensores, duracaoMs: Long) {
        val tipo = s.suportados().firstOrNull { it.name == "ECG_ON_DEMAND" }
            ?: return encerrar(Estado.Erro("ECG indisponível neste relógio"))
        val arquivo = Pastas.novoEcg(ctx.filesDir)
        val g = GravadorCsv(arquivo, "ECG_ON_DEMAND").also { gravador = it }
        val t = try { s.rastreador(tipo) } catch (e: Exception) {
            return encerrar(Estado.Erro(e.message ?: "falha ao abrir ECG"))
        }
        tracker = t
        EstadoSaude.pausado = true // os minutos do ECG não entram no batimento contínuo nem na VFC
        inicio = System.currentTimeMillis()
        t.setEventListener(object : HealthTracker.TrackerEventListener {
            override fun onDataReceived(list: List<DataPoint>) {
                g.gravar(list)
                var contato = true
                for (dp in list) {
                    val mv = runCatching { dp.getValue(ValueKey.EcgSet.ECG_MV) }.getOrNull() ?: continue
                    val leadOff = runCatching { dp.getValue(ValueKey.EcgSet.LEAD_OFF) }.getOrNull() ?: 0
                    contato = leadOff == 0
                    buffer.addLast(mv); if (buffer.size > 1500) buffer.removeFirst()
                }
                val seg = ((System.currentTimeMillis() - inicio) / 1000).toInt()
                main.post {
                    _traco.value = buffer.toList()
                    if (_estado.value !is Estado.Concluido) _estado.value = Estado.Medindo(seg, contato)
                }
            }
            override fun onFlushCompleted() {}
            override fun onError(error: HealthTracker.TrackerError) {
                main.post { encerrar(Estado.Erro(error.name)) }
            }
        })
        _estado.value = Estado.Medindo(0, true)
        main.postDelayed({
            val n = g.amostras.get()
            val seg = (System.currentTimeMillis() - inicio) / 1000.0
            Registros.adicionar(ctx, "ecg", "${(seg).toInt()} s · ${if (seg > 0) (n / seg).toInt() else 0} Hz")
            if (n > 100) runCatching { Sync.enfileirarEcg(ctx, arquivo, inicio, seg, if (seg > 0) (n / seg).toInt() else 0) }
            encerrar(Estado.Concluido(n, if (seg > 0) (n / seg).toInt() else 0, arquivo.name))
        }, duracaoMs)
    }

    fun cancelar() = encerrar(Estado.Parado)

    private fun encerrar(final: Estado) {
        EstadoSaude.pausado = false
        main.removeCallbacksAndMessages(null)
        runCatching { tracker?.unsetEventListener() }
        tracker = null
        gravador?.fechar(); gravador = null
        sensores?.desconectar(); sensores = null
        _estado.value = final
    }
}
