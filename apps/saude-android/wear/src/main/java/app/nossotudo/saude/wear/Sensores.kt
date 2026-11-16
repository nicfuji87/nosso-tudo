package app.nossotudo.saude.wear

import android.content.Context
import com.samsung.android.service.health.tracking.ConnectionListener
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.HealthTrackerException
import com.samsung.android.service.health.tracking.HealthTrackingService
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType
import com.samsung.android.service.health.tracking.data.PpgType
import com.samsung.android.service.health.tracking.data.ValueKey
import java.lang.reflect.Modifier

/**
 * Camada fina sobre o Samsung Health Sensor SDK.
 *
 * Fase 1 = prova de capacidade: em vez de fixar quais campos cada rastreador devolve,
 * descobrimos por reflexão todas as chaves (ValueKey.*Set.*) que respondem para um
 * DataPoint. Assim o mesmo código registra HR, IBI, PPG, acelerômetro, temperatura e ECG
 * no Watch 6, e o CSV mostra exatamente o que o aparelho entrega.
 */
class Sensores(private val context: Context) {

    private var service: HealthTrackingService? = null

    fun conectar(onOk: () -> Unit, onFalha: (HealthTrackerException) -> Unit) {
        val listener = object : ConnectionListener {
            override fun onConnectionSuccess() = onOk()
            override fun onConnectionEnded() {}
            override fun onConnectionFailed(e: HealthTrackerException) = onFalha(e)
        }
        service = HealthTrackingService(listener, context).also { it.connectService() }
    }

    fun desconectar() {
        runCatching { service?.disconnectService() }
        service = null
    }

    fun suportados(): List<HealthTrackerType> =
        service?.trackingCapability?.supportHealthTrackerTypes?.toList() ?: emptyList()

    /** Obtém o rastreador; no SDK 1.4+ o PPG exige informar quais LEDs (padrão: verde). */
    fun rastreador(tipo: HealthTrackerType, leds: Set<PpgType> = setOf(PpgType.GREEN)): HealthTracker {
        val s = service ?: error("Serviço de sensores não conectado")
        return if (tipo.name.startsWith("PPG_")) s.getHealthTracker(tipo, leds) else s.getHealthTracker(tipo)
    }

    companion object {
        /** Todas as chaves públicas do SDK: "HeartRateSet.IBI_LIST" -> ValueKey */
        private val todasAsChaves: List<Pair<String, ValueKey<*>>> by lazy {
            ValueKey::class.java.declaredClasses.flatMap { conjunto ->
                conjunto.fields
                    .filter { Modifier.isStatic(it.modifiers) && ValueKey::class.java.isAssignableFrom(it.type) }
                    .mapNotNull { campo ->
                        runCatching { "${conjunto.simpleName}.${campo.name}" to (campo.get(null) as ValueKey<*>) }
                            .getOrNull()
                    }
            }
        }

        private val cache = mutableMapOf<String, List<Pair<String, ValueKey<*>>>>()

        /**
         * Chaves que fazem sentido para este rastreador. Primeiro filtra pelo nome do conjunto
         * (HEART_RATE_CONTINUOUS -> HeartRateSet, PPG_* -> Ppg*Set...), depois mantém só as que
         * devolvem valor sem erro no primeiro DataPoint recebido.
         */
        fun chavesPara(tipo: String, amostra: DataPoint): List<Pair<String, ValueKey<*>>> =
            synchronized(cache) {
                cache.getOrPut(tipo) {
                    val prefixo = tipo.substringBefore('_').lowercase()
                    val candidatas = todasAsChaves.filter { (nome, _) ->
                        nome.substringBefore('.').lowercase().startsWith(prefixo)
                    }.ifEmpty { todasAsChaves }
                    candidatas.filter { (_, chave) ->
                        runCatching { amostra.getValue(chave) != null }.getOrDefault(false)
                    }
                }
            }

        fun valorCsv(dp: DataPoint, chave: ValueKey<*>): String {
            val v = runCatching { dp.getValue(chave) }.getOrNull() ?: return ""
            return when (v) {
                is Collection<*> -> v.joinToString("|")
                is FloatArray -> v.joinToString("|")
                is IntArray -> v.joinToString("|")
                else -> v.toString()
            }.replace(',', '.').replace('\n', ' ')
        }

        fun descreverErro(e: HealthTrackerException): String =
            "erro ${e.errorCode}" + (if (e.hasResolution()) " (tem resolução: abra o app)" else "") +
                (e.message?.let { ": $it" } ?: "")
    }
}
