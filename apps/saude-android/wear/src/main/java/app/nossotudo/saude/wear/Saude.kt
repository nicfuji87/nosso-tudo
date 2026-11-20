package app.nossotudo.saude.wear

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType
import com.samsung.android.service.health.tracking.data.ValueKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Estado de saúde calculado no próprio relógio a partir do batimento + IBI do Sensor SDK.
 * Nada aqui é inventado: sem dado suficiente, os campos ficam nulos e a tela mostra "—".
 */
object EstadoSaude {
    data class Ponto(val ts: Long, val v: Float)

    /** Resultado de uma janela de 5 min de IBI. */
    data class Janela(val inicio: Long, val rmssd: Float, val cobertura: Float)

    private const val JANELA_MS = 5 * 60_000L
    const val DIAS_BASE = 21

    private val _bpm = MutableStateFlow<Int?>(null)
    val bpm: StateFlow<Int?> = _bpm.asStateFlow()
    private val _bpmTs = MutableStateFlow(0L)
    val bpmTs: StateFlow<Long> = _bpmTs.asStateFlow()
    private val _serieBpm = MutableStateFlow<List<Ponto>>(emptyList())
    val serieBpm: StateFlow<List<Ponto>> = _serieBpm.asStateFlow()
    private val _faixaHoje = MutableStateFlow<Pair<Int, Int>?>(null)
    val faixaHoje: StateFlow<Pair<Int, Int>?> = _faixaHoje.asStateFlow()

    /** RMSSD "agora": últimos ~60 IBIs válidos (aparece já no 1º minuto de medição). */
    private val _rmssdAgora = MutableStateFlow<Float?>(null)
    val rmssdAgora: StateFlow<Float?> = _rmssdAgora.asStateFlow()
    private val _qualidadeIbi = MutableStateFlow<Float?>(null)
    val qualidadeIbi: StateFlow<Float?> = _qualidadeIbi.asStateFlow()
    private val _janelasHoje = MutableStateFlow<List<Janela>>(emptyList())
    val janelasHoje: StateFlow<List<Janela>> = _janelasHoje.asStateFlow()

    private var prefs: SharedPreferences? = null

    // buffers do cálculo
    private var anteriorIbi: Int? = null
    private val ultimosIbi = ArrayDeque<Int>()
    private val ultimasDifs = ArrayDeque<Int>()
    private var ibiTotalRecente = 0
    private var ibiValidoRecente = 0
    private var janelaAtual = -1L
    private var janelaSomaIbi = 0L
    private val janelaDifs = ArrayList<Int>()

    private var app: Context? = null

    // Estado do relógio para o painel: no pulso? última leitura válida? ECG em andamento?
    @Volatile var noPulso: Boolean? = null
        private set
    @Volatile var ultimaLeituraMs: Long = 0
        private set
    /** Último lote recebido do sensor (válido ou não). Se parar de chegar, o sensor caiu: o serviço religa. */
    @Volatile var ultimoLoteMs: Long = 0
    /** Durante o ECG o batimento contínuo pode sair inválido: não entra no cálculo. */
    @Volatile var pausado = false

    // Histerese do "no pulso": só vira transição depois de 60 s estável (relógio frouxo não gera ruído).
    private var pulsoEstavel: Boolean? = null
    private var pulsoCandidato: Boolean? = null
    private var pulsoDesde = 0L

    private fun observarPulso(estado: Boolean, ts: Long) {
        if (estado != pulsoCandidato) { pulsoCandidato = estado; pulsoDesde = ts }
        if (estado != pulsoEstavel && ts - pulsoDesde >= 60_000L) {
            val anterior = pulsoEstavel
            pulsoEstavel = estado
            if (anterior != null) {
                app?.let { runCatching { Sync.enfileirarTransicao(it, pulsoDesde, if (estado) "no_pulso" else "fora_do_pulso", Bateria.nivelEm(it, pulsoDesde)) } }
            }
        }
    }

    /** Horário estimado do último batimento (soma dos IBIs). 0 = sem cadeia. */
    private var relogioBatimento = 0L
    private const val LACUNA_MS = 5_000L      // > 5 s sem batimento: a cadeia recomeça
    private const val DESVIO_MAX_MS = 120_000L // relógio de batimentos muito à frente do registro: ressincroniza

    // agregação por minuto para o envio ao Nosso Tudo
    private var minutoAtual = -1L
    private var minutoSoma = 0
    private var minutoN = 0
    private var minutoMin = 0
    private var minutoMax = 0

    @Synchronized
    fun iniciar(ctx: Context) {
        if (prefs != null) return
        app = ctx.applicationContext
        prefs = ctx.applicationContext.getSharedPreferences("saude", Context.MODE_PRIVATE)
        val dia = lerDia(LocalDate.now())
        if (dia.has("min")) _faixaHoje.value = dia.getInt("min") to dia.getInt("max")
        if (dia.has("ultimo")) {
            _bpm.value = dia.getInt("ultimo")
            _bpmTs.value = dia.optLong("ultimoTs")
        }
        val js = dia.optJSONArray("janelas") ?: JSONArray()
        _janelasHoje.value = (0 until js.length()).map {
            val o = js.getJSONObject(it)
            Janela(o.getLong("i"), o.getDouble("r").toFloat(), o.getDouble("c").toFloat())
        }
    }

    /**
     * Recebe um lote do rastreador HEART_RATE_CONTINUOUS (do serviço de coleta ou da tela ao vivo).
     *
     * IBI (v0.4): com a tela apagada o SDK entrega vários intervalos presos ao 1º registro do lote.
     * O horário de cada batimento é reconstruído somando os intervalos a partir do registro; se houver
     * lacuna (> 5 s sem batimento: relógio frouxo, fora do pulso, ECG) a cadeia recomeça e nenhuma
     * diferença sucessiva atravessa a lacuna.
     */
    @Synchronized
    fun registrarLote(lote: List<DataPoint>) {
        if (lote.isNotEmpty()) ultimoLoteMs = System.currentTimeMillis()
        for (dp in lote) {
            val ts = dp.timestamp
            val hr = runCatching { dp.getValue(ValueKey.HeartRateSet.HEART_RATE) }.getOrNull() ?: 0
            val st = runCatching { dp.getValue(ValueKey.HeartRateSet.HEART_RATE_STATUS) }.getOrNull() ?: -1
            if (st == -3) { noPulso = false; observarPulso(false, ts) } // SDK: relógio fora do pulso
            if (hr in 30..220 && st >= 0) {
                noPulso = true
                observarPulso(true, ts)
                ultimaLeituraMs = ts
                if (!pausado) registrarBpm(hr, ts)
            }
            if (pausado) { anteriorIbi = null; relogioBatimento = 0L; continue }

            val ibis = runCatching { dp.getValue(ValueKey.HeartRateSet.IBI_LIST) }.getOrNull().orEmpty()
            if (ibis.isEmpty()) continue
            val sts = runCatching { dp.getValue(ValueKey.HeartRateSet.IBI_STATUS_LIST) }.getOrNull().orEmpty()
            val novaCadeia = relogioBatimento == 0L || ts - relogioBatimento > LACUNA_MS || relogioBatimento - ts > DESVIO_MAX_MS
            var t = if (novaCadeia) { anteriorIbi = null; ts } else relogioBatimento
            ibis.forEachIndexed { k, ibi ->
                t += ibi.coerceIn(0, 3000)
                registrarIbi(ibi, sts.getOrNull(k) ?: 0, t)
            }
            relogioBatimento = t
        }
    }

    private fun registrarBpm(hr: Int, ts: Long) {
        val m = ts / 60_000
        if (m != minutoAtual) {
            fecharMinuto()
            minutoAtual = m; minutoSoma = 0; minutoN = 0; minutoMin = hr; minutoMax = hr
        }
        minutoSoma += hr; minutoN++
        minutoMin = minOf(minutoMin, hr); minutoMax = maxOf(minutoMax, hr)
        _bpm.value = hr
        _bpmTs.value = ts
        _serieBpm.value = (_serieBpm.value + Ponto(ts, hr.toFloat())).takeLast(180)
        val f = _faixaHoje.value
        _faixaHoje.value = if (f == null) hr to hr else minOf(f.first, hr) to maxOf(f.second, hr)
        salvarDia { it.put("ultimo", hr).put("ultimoTs", ts).put("min", _faixaHoje.value!!.first).put("max", _faixaHoje.value!!.second) }
    }

    /** Fecha o minuto corrente e põe na fila de envio. Chamado na virada do minuto e ao parar a medição. */
    @Synchronized
    fun fecharMinuto() {
        val ctx = app ?: return
        if (minutoAtual >= 0 && minutoN > 0) {
            runCatching { Sync.enfileirarBpm(ctx, minutoAtual * 60_000, minutoSoma.toFloat() / minutoN, minutoMin, minutoMax, minutoN) }
        }
        minutoAtual = -1; minutoN = 0
    }

    /** Fecha o minuto aberto se ele já passou (ex.: relógio tirado do pulso no meio do minuto). */
    @Synchronized
    fun fecharMinutoSeAntigo() {
        if (minutoAtual >= 0 && System.currentTimeMillis() / 60_000 > minutoAtual + 1) fecharMinuto()
    }

    private fun registrarIbi(ibi: Int, status: Int, ts: Long) {
        ibiTotalRecente++
        val ant = anteriorIbi
        val ok = status == 0 && ibi in 300..2000 && (ant == null || abs(ibi - ant).toFloat() / ant <= 0.2f)
        if (!ok) {
            anteriorIbi = null
        } else {
            ibiValidoRecente++
            if (ant != null) {
                val d = ibi - ant
                ultimasDifs.addLast(d); if (ultimasDifs.size > 60) ultimasDifs.removeFirst()
                janelaDifs += d
            }
            ultimosIbi.addLast(ibi); if (ultimosIbi.size > 60) ultimosIbi.removeFirst()
            anteriorIbi = ibi
            janelaSomaIbi += ibi
        }
        if (ultimasDifs.size >= 20) _rmssdAgora.value = rmssd(ultimasDifs)
        if (ibiTotalRecente >= 20) {
            _qualidadeIbi.value = ibiValidoRecente.toFloat() / ibiTotalRecente
            if (ibiTotalRecente > 120) { ibiTotalRecente /= 2; ibiValidoRecente /= 2 }
        }

        // Janelas de 5 min (base da VFC diária e da prontidão)
        val j = ts / JANELA_MS
        if (janelaAtual == -1L) janelaAtual = j
        if (j != janelaAtual) {
            val cobertura = janelaSomaIbi.toFloat() / JANELA_MS
            if (janelaDifs.size >= 30 && cobertura >= 0.5f) {
                val nova = Janela(janelaAtual * JANELA_MS, rmssd(janelaDifs), cobertura)
                _janelasHoje.value = (_janelasHoje.value + nova).takeLast(288)
                app?.let { runCatching { Sync.enfileirarVfc(it, nova.inicio, nova.rmssd, nova.cobertura) } }
                salvarDia { dia ->
                    val arr = dia.optJSONArray("janelas") ?: JSONArray()
                    arr.put(JSONObject().put("i", nova.inicio).put("r", nova.rmssd.toDouble()).put("c", nova.cobertura.toDouble()))
                    dia.put("janelas", arr)
                    dia.put("rmssd", mediana(_janelasHoje.value.map { it.rmssd }).toDouble())
                }
            }
            janelaAtual = j; janelaSomaIbi = 0; janelaDifs.clear()
        }
    }

    /** VFC do dia = mediana das janelas boas de hoje. */
    fun rmssdHoje(): Float? = _janelasHoje.value.takeIf { it.isNotEmpty() }?.let { mediana(it.map { j -> j.rmssd }) }

    /** RMSSD diário dos últimos [dias] (sem hoje), mais antigo primeiro. */
    fun historicoRmssd(dias: Int): List<Pair<LocalDate, Float>> {
        val hoje = LocalDate.now()
        return (dias downTo 1).mapNotNull { n ->
            val d = hoje.minusDays(n.toLong())
            val v = lerDia(d).optDouble("rmssd", Double.NaN)
            if (v.isNaN()) null else d to v.toFloat()
        }
    }

    /** Variação % da VFC de hoje vs. média dos 7 dias anteriores (precisa de ≥3 dias). */
    fun variacaoVs7d(): Float? {
        val hoje = rmssdHoje() ?: return null
        val h = historicoRmssd(7).map { it.second }
        if (h.size < 3) return null
        return (hoje / h.average().toFloat() - 1f) * 100f
    }

    data class Prontidao(val pontos: Int?, val diasBase: Int, val texto: String)

    /**
     * Prontidão = quão acima/abaixo da SUA linha de base está a VFC de hoje (log-RMSSD, z-score).
     * Só sai número depois de [DIAS_BASE] dias com medição — antes disso, "calibrando".
     * É um indicador de apoio: não decide sozinho a intensidade do treino.
     */
    fun prontidao(): Prontidao {
        val base = historicoRmssd(60).map { ln(it.second) }
        val hoje = rmssdHoje()
        if (base.size < DIAS_BASE || hoje == null) return Prontidao(null, base.size, "Calibrando")
        val media = base.average()
        val dp = sqrt(base.sumOf { (it - media) * (it - media) } / base.size).coerceAtLeast(0.05)
        val z = (ln(hoje) - media) / dp
        val p = (70 + 15 * z).toInt().coerceIn(0, 100)
        val txt = when { p >= 80 -> "Treino forte"; p >= 60 -> "Treino moderado"; else -> "Dia leve" }
        return Prontidao(p, base.size, txt)
    }

    // ---------- persistência por dia ----------
    private fun chave(d: LocalDate) = "dia_$d"
    private fun lerDia(d: LocalDate): JSONObject =
        prefs?.getString(chave(d), null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()

    private var ultimoSalvar = 0L
    private fun salvarDia(alterar: (JSONObject) -> Unit) {
        val p = prefs ?: return
        val hoje = LocalDate.now()
        val dia = lerDia(hoje)
        alterar(dia)
        p.edit().putString(chave(hoje), dia.toString()).apply()
    }

    private fun rmssd(difs: Collection<Int>): Float =
        sqrt(difs.sumOf { it.toDouble() * it } / difs.size).toFloat()

    private fun mediana(v: List<Float>): Float = v.sorted().let { s ->
        if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2f
    }
}

/** Mede batimento + IBI enquanto uma tela está aberta (se a coleta contínua não estiver rodando). */
class MonitorCardiaco(private val ctx: Context) {
    enum class Estado { PARADO, CONECTANDO, MEDINDO, ERRO }

    private val _estado = MutableStateFlow(Estado.PARADO)
    val estado: StateFlow<Estado> = _estado.asStateFlow()
    private val _erro = MutableStateFlow<String?>(null)
    val erro: StateFlow<String?> = _erro.asStateFlow()

    private var sensores: Sensores? = null
    private var tracker: HealthTracker? = null
    private val main = Handler(Looper.getMainLooper())

    fun iniciar() {
        EstadoSaude.iniciar(ctx)
        if (ColetaService.rodando) { _estado.value = Estado.MEDINDO; return } // o serviço já alimenta o estado
        if (sensores != null) return
        _estado.value = Estado.CONECTANDO
        val s = Sensores(ctx).also { sensores = it }
        s.conectar(
            onOk = {
                main.post {
                    try {
                        val t = s.rastreador(HealthTrackerType.HEART_RATE_CONTINUOUS)
                        t.setEventListener(object : HealthTracker.TrackerEventListener {
                            override fun onDataReceived(list: List<DataPoint>) {
                                EstadoSaude.registrarLote(list)
                                _estado.value = Estado.MEDINDO
                            }
                            override fun onFlushCompleted() {}
                            override fun onError(error: HealthTracker.TrackerError) {
                                _erro.value = error.name; _estado.value = Estado.ERRO
                            }
                        })
                        tracker = t
                    } catch (e: Exception) {
                        _erro.value = e.message; _estado.value = Estado.ERRO
                    }
                }
            },
            onFalha = { e -> _erro.value = Sensores.descreverErro(e); _estado.value = Estado.ERRO },
        )
    }

    fun parar() {
        EstadoSaude.fecharMinuto()
        runCatching { tracker?.unsetEventListener() }
        tracker = null
        sensores?.desconectar()
        sensores = null
        if (_estado.value != Estado.ERRO) _estado.value = Estado.PARADO
    }
}

/** Registros manuais (check-in, hábitos) e eventos (ECG, respiração), em JSON Lines no relógio. */
object Registros {
    data class Registro(val ts: Long, val tipo: String, val valor: String)

    /** Mal-estar: grava na hora (offline) e tenta enviar já, sem esperar o ciclo de 30 min. */
    fun malEstar(ctx: Context, situacao: String) {
        adicionar(ctx, "malestar", situacao)
        runCatching { Sync.enviarAgora(ctx) }
    }

    private fun arquivo(ctx: Context) = File(ctx.filesDir, "registros.jsonl")

    @Synchronized
    fun adicionar(ctx: Context, tipo: String, valor: String) {
        val id = Sync.novoIdLocal()
        val ts = System.currentTimeMillis()
        val o = JSONObject().put("id", id).put("ts", ts).put("tipo", tipo).put("valor", valor)
        arquivo(ctx).appendText(o.toString() + "\n")
        runCatching { Sync.enfileirarRegistro(ctx, id, ts, tipo, valor) }
    }

    /** Registros de hoje (mais recente primeiro). */
    fun hoje(ctx: Context): List<Registro> {
        val inicioDia = LocalDate.now().atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        return listar(ctx, 500).filter { it.ts >= inicioDia }
    }

    @Synchronized
    fun listar(ctx: Context, limite: Int = 50): List<Registro> {
        val f = arquivo(ctx)
        if (!f.exists()) return emptyList()
        return f.readLines().asReversed().asSequence().take(limite).mapNotNull { l ->
            runCatching { JSONObject(l).let { Registro(it.getLong("ts"), it.getString("tipo"), it.getString("valor")) } }.getOrNull()
        }.toList()
    }
}
