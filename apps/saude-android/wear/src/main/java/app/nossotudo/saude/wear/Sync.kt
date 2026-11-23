package app.nossotudo.saude.wear

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.util.Base64
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Sincronização relógio → Nosso Tudo (Edge Function `saude-relogio`).
 *
 * - O relógio tem um SEGREDO próprio (gerado aqui, nunca sai do app em texto além do HTTPS);
 *   o Supabase guarda só o sha256. Nenhuma chave do Supabase fica no relógio.
 * - Tudo que precisa subir vai antes para uma FILA em arquivo (JSON Lines). Sem rede, nada se perde;
 *   o envio só apaga da fila o que o servidor confirmou. Reenvio é idempotente no servidor.
 */
object Sync {
    private const val URL_FUNCAO = BuildConfig.SAUDE_URL
    private const val ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    private const val POR_ENVIO_BPM = 1500
    private const val POR_ENVIO_VFC = 300
    private const val POR_ENVIO_REG = 300
    private const val POR_ENVIO_TEMP = 300

    data class Status(val vinculado: Boolean, val nome: String?, val ultimoEnvio: Long, val pendentes: Int, val erro: String?)

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private fun pastaFila(ctx: Context) = File(ctx.filesDir, "fila").apply { mkdirs() }
    private fun fila(ctx: Context, nome: String) = File(pastaFila(ctx), "$nome.jsonl")

    @Synchronized
    fun segredo(ctx: Context): String {
        val p = prefs(ctx)
        p.getString("segredo", null)?.let { return it }
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val s = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        p.edit().putString("segredo", s).apply()
        return s
    }

    fun status(ctx: Context): Status {
        val p = prefs(ctx)
        val pend = listOf("bpm", "vfc", "temp", "transicoes", "registros", "ecgs").sumOf { n -> fila(ctx, n).takeIf { it.exists() }?.useLines { it.count() } ?: 0 }
        return Status(p.getBoolean("vinculado", false), p.getString("nome", null), p.getLong("ultimo_envio", 0), pend, p.getString("erro", null))
    }

    // ------------------------------------------------------------------ fila

    @Synchronized
    private fun enfileirar(ctx: Context, nome: String, item: JSONObject) {
        fila(ctx, nome).appendText(item.toString() + "\n")
    }

    fun enfileirarBpm(ctx: Context, minutoMs: Long, medio: Float, min: Int, max: Int, n: Int) {
        // batimento/VFC vão no ciclo periódico (30 min): acordar a rede a cada minuto gastaria bateria
        enfileirar(ctx, "bpm", JSONObject().put("minuto", minutoMs).put("medio", medio.toDouble()).put("min", min).put("max", max).put("n", n))
    }

    fun enfileirarVfc(ctx: Context, inicioMs: Long, rmssd: Float, cobertura: Float) {
        enfileirar(ctx, "vfc", JSONObject().put("inicio", inicioMs).put("rmssd", rmssd.toDouble()).put("cobertura", cobertura.toDouble()))
    }

    fun enfileirarTemp(ctx: Context, inicioMs: Long, pele: Float, ambiente: Float?, n: Int) {
        val o = JSONObject().put("inicio", inicioMs).put("pele", pele.toDouble()).put("n", n)
        ambiente?.let { o.put("ambiente", it.toDouble()) }
        enfileirar(ctx, "temp", o)
    }

    /** Mudança de estado do relógio no horário exato: carregando, desconectado, no_pulso, fora_do_pulso. */
    fun enfileirarTransicao(ctx: Context, ts: Long, tipo: String, bateria: Int?) {
        val o = JSONObject().put("ts", ts).put("tipo", tipo)
        bateria?.let { o.put("bateria", it) }
        enfileirar(ctx, "transicoes", o)
    }

    /** Lacuna de coleta registrada pela máquina de estados (v0.9.7). */
    fun enfileirarLacuna(ctx: Context, l: Lacuna, bateria: Int?, noPulso: Boolean?, carregando: Boolean, estado: String) {
        val o = JSONObject().put("inicio", l.inicioMs).put("fim", l.fimMs).put("causa", l.causa).put("reconexoes", l.reconexoes)
            .put("carregando", carregando).put("estado", estado)
        l.recuperacaoMs?.let { o.put("recuperacao_ms", it) }
        bateria?.let { o.put("bateria", it) }
        noPulso?.let { o.put("no_pulso", it) }
        enfileirar(ctx, "lacunas", o)
    }

    fun enfileirarRegistro(ctx: Context, idLocal: String, ts: Long, tipo: String, valor: String) {
        enfileirar(ctx, "registros", JSONObject().put("id_local", idLocal).put("ts", ts).put("tipo", tipo).put("valor", valor))
        enviarEmBreve(ctx)
    }

    fun enfileirarEcg(ctx: Context, arquivo: File, ts: Long, duracaoS: Double, hz: Int) {
        enfileirar(ctx, "ecgs", JSONObject().put("id_local", arquivo.name).put("ts", ts).put("arquivo", arquivo.absolutePath)
            .put("duracao_s", duracaoS).put("hz", hz))
        enviarEmBreve(ctx)
    }

    /** Lê até [n] itens do começo da fila. */
    @Synchronized
    private fun ler(ctx: Context, nome: String, n: Int): List<JSONObject> {
        val f = fila(ctx, nome)
        if (!f.exists()) return emptyList()
        return f.useLines { seq -> seq.take(n).mapNotNull { runCatching { JSONObject(it) }.getOrNull() }.toList() }
    }

    /** Remove os [n] primeiros itens (os confirmados pelo servidor), mantendo o que chegou depois. */
    @Synchronized
    private fun descartar(ctx: Context, nome: String, n: Int) {
        if (n <= 0) return
        val f = fila(ctx, nome)
        if (!f.exists()) return
        val resto = f.readLines().drop(n)
        if (resto.isEmpty()) f.delete() else f.writeText(resto.joinToString("\n", postfix = "\n"))
    }

    // ------------------------------------------------------------------ HTTP

    private fun post(corpo: JSONObject): Pair<Int, JSONObject> {
        val c = URL(URL_FUNCAO).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(corpo.toString().toByteArray()) }
            val codigo = c.responseCode
            val txt = (if (codigo < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            return codigo to (runCatching { JSONObject(txt) }.getOrNull() ?: JSONObject())
        } finally {
            c.disconnect()
        }
    }

    // ------------------------------------------------------------------ pareamento

    /** Gera um código, anuncia ao servidor e devolve o código para mostrar na tela. Chamar fora da main thread. */
    fun anunciar(ctx: Context): String {
        val rnd = SecureRandom()
        repeat(5) {
            val codigo = (1..6).map { ALFABETO[rnd.nextInt(ALFABETO.length)] }.joinToString("")
            val (http, r) = post(JSONObject().put("acao", "anunciar").put("segredo", segredo(ctx)).put("codigo", codigo).put("modelo", Build.MODEL))
            if (http in 200..299) return codigo
            if (r.optString("erro") != "codigo_em_uso") error(r.optString("erro", "HTTP $http"))
        }
        error("não foi possível gerar um código")
    }

    /** Pergunta ao servidor se o relógio já foi vinculado. Chamar fora da main thread. */
    fun verificarVinculo(ctx: Context): Boolean {
        val (http, r) = post(JSONObject().put("acao", "status").put("segredo", segredo(ctx)))
        if (http !in 200..299) return prefs(ctx).getBoolean("vinculado", false)
        val ok = r.optBoolean("vinculado", false)
        prefs(ctx).edit().putBoolean("vinculado", ok).putString("nome", r.optString("nome").ifEmpty { null }).apply()
        if (ok) { importarHistorico(ctx); agendar(ctx) }
        return ok
    }

    // ------------------------------------------------------------------ envio

    /**
     * Coloca na fila o que o relógio já tinha guardado antes de ser pareado (registros, ECGs e
     * janelas de VFC de todos os dias). Roda uma vez por relógio; o servidor ignora duplicatas.
     */
    @Synchronized
    fun importarHistorico(ctx: Context) {
        val p = prefs(ctx)
        if (p.getBoolean("historico_importado", false)) return
        // registros (check-in, hábito, respiração, ECG) — os da v0.1 não tinham id: id estável pelo ts
        File(ctx.filesDir, "registros.jsonl").takeIf { it.exists() }?.forEachLine { l ->
            runCatching {
                val o = JSONObject(l)
                val ts = o.getLong("ts")
                val id = o.optString("id").ifEmpty { "legado-$ts-${o.getString("tipo")}" }
                enfileirar(ctx, "registros", JSONObject().put("id_local", id).put("ts", ts).put("tipo", o.getString("tipo")).put("valor", o.getString("valor")))
            }
        }
        // ECGs gravados (CSV com ts_ms na 1ª coluna)
        File(ctx.filesDir, "ecg").listFiles { f -> f.name.endsWith(".csv") }?.sortedBy { it.name }?.forEach { f ->
            runCatching {
                val linhas = f.readLines().drop(1).filter { it.isNotBlank() }
                if (linhas.size < 100) return@runCatching
                val t0 = linhas.first().substringBefore(',').toLong()
                val t1 = linhas.last().substringBefore(',').toLong()
                val dur = ((t1 - t0) / 1000.0).coerceAtLeast(1.0)
                enfileirar(ctx, "ecgs", JSONObject().put("id_local", f.name).put("ts", t0).put("arquivo", f.absolutePath)
                    .put("duracao_s", dur).put("hz", (linhas.size / dur).toInt()))
            }
        }
        // janelas de VFC guardadas por dia
        val saude = ctx.applicationContext.getSharedPreferences("saude", Context.MODE_PRIVATE)
        saude.all.filterKeys { it.startsWith("dia_") }.values.forEach { v ->
            runCatching {
                val arr = JSONObject(v as String).optJSONArray("janelas") ?: return@runCatching
                for (i in 0 until arr.length()) {
                    val j = arr.getJSONObject(i)
                    enfileirar(ctx, "vfc", JSONObject().put("inicio", j.getLong("i")).put("rmssd", j.getDouble("r")).put("cobertura", j.getDouble("c")))
                }
            }
        }
        p.edit().putBoolean("historico_importado", true).apply()
    }

    data class ResultadoEnvio(val enviados: Int, val erro: String?)

    /** Esvazia a fila agora (até 10 lotes). Chamar fora da main thread. */
    fun enviarTudoAgora(ctx: Context): ResultadoEnvio {
        if (prefs(ctx).getBoolean("vinculado", false)) importarHistorico(ctx)
        var total = 0
        repeat(10) {
            val antes = status(ctx).pendentes
            if (antes == 0) return ResultadoEnvio(total, null)
            if (!enviarLote(ctx)) return ResultadoEnvio(total, prefs(ctx).getString("erro", "falha no envio"))
            val depois = status(ctx).pendentes
            total += (antes - depois).coerceAtLeast(0)
            if (depois >= antes) return ResultadoEnvio(total, null)
        }
        return ResultadoEnvio(total, null)
    }

    /** Envia um lote de cada fila. Devolve true se não sobrou erro. Chamar fora da main thread. */
    fun enviarLote(ctx: Context): Boolean {
        if (!prefs(ctx).getBoolean("vinculado", false) && !verificarVinculo(ctx)) return true // nada a fazer ainda

        val bpm = ler(ctx, "bpm", POR_ENVIO_BPM)
        val vfc = ler(ctx, "vfc", POR_ENVIO_VFC)
        val temp = ler(ctx, "temp", POR_ENVIO_TEMP)
        val trans = ler(ctx, "transicoes", 300)
        val reg = ler(ctx, "registros", POR_ENVIO_REG)
        val ecgItem = ler(ctx, "ecgs", 1)
        val lacunas = ler(ctx, "lacunas", 100)
        val vazio = bpm.isEmpty() && vfc.isEmpty() && temp.isEmpty() && trans.isEmpty() && reg.isEmpty() && ecgItem.isEmpty() && lacunas.isEmpty()
        // Sem dados novos, ainda manda o estado do relógio a cada ~25 min (o painel sabe se está no pulso/carregando).
        if (vazio && System.currentTimeMillis() - prefs(ctx).getLong("ultimo_estado", 0) < 25 * 60_000L) return true

        val ecgs = JSONArray()
        ecgItem.firstOrNull()?.let { e ->
            val amostras = lerEcg(File(e.getString("arquivo")))
            if (amostras != null) {
                ecgs.put(JSONObject().put("id_local", e.getString("id_local")).put("ts", e.getLong("ts"))
                    .put("duracao_s", e.getDouble("duracao_s")).put("hz", e.getInt("hz")).put("amostras", amostras))
            }
        }
        val corpo = JSONObject().put("acao", "enviar").put("segredo", segredo(ctx))
            .put("bpm", JSONArray(bpm)).put("vfc", JSONArray(vfc)).put("temp", JSONArray(temp)).put("transicoes", JSONArray(trans)).put("registros", JSONArray(reg)).put("ecgs", ecgs).put("lacunas", JSONArray(lacunas))
            .put("estado", estado(ctx))
            .put("diag", diagnostico())

        val (http, r) = runCatching { post(corpo) }.getOrElse { e ->
            prefs(ctx).edit().putString("erro", "sem rede: ${e.javaClass.simpleName}").apply()
            return false
        }
        if (http == 403) { // vínculo revogado no Nosso Tudo
            prefs(ctx).edit().putBoolean("vinculado", false).putString("erro", "relógio desvinculado").apply()
            return true
        }
        if (http !in 200..299 || !r.optBoolean("ok")) {
            prefs(ctx).edit().putString("erro", r.optString("erro", "HTTP $http")).apply()
            return false
        }
        descartar(ctx, "bpm", bpm.size)
        descartar(ctx, "vfc", vfc.size)
        descartar(ctx, "temp", temp.size)
        descartar(ctx, "transicoes", trans.size)
        descartar(ctx, "registros", reg.size)
        descartar(ctx, "ecgs", ecgItem.size)
        descartar(ctx, "lacunas", lacunas.size)
        runCatching { AvisoRadar.processar(ctx, r.optJSONObject("radar")) }
        // prontidão do dia (prontidao-v1) para o Tile
        r.optJSONObject("prontidao")?.let { p ->
            prefs(ctx).edit()
                .putInt("pront_score", if (p.isNull("score")) -1 else p.optInt("score", -1))
                .putString("pront_nivel", p.optString("nivel").takeIf { it.isNotEmpty() && it != "null" })
                .putString("pront_dia", p.optString("dia"))
                .putString("pront_deitar", p.optJSONObject("sono")?.optString("deitar")?.takeIf { it.isNotEmpty() && it != "null" })
                .apply()
        }
        SaudeTile.atualizar(ctx)
        val agora = System.currentTimeMillis()
        prefs(ctx).edit().putLong("ultimo_envio", agora).putLong("ultimo_estado", agora).remove("erro").apply()
        return true
    }

    /** Diagnóstico do app do relógio (v0.9.3): o site mostra quando algo não está medindo. */
    private fun diagnostico(): JSONObject {
        val agora = System.currentTimeMillis()
        val minDesde = { t: Long -> if (t > 0) ((agora - t) / 60_000).toInt() else -1 }
        return JSONObject()
            .put("versao", BuildConfig.VERSION_NAME)
            .put("erro", ColetaService.avisosTexto ?: JSONObject.NULL)
            .put(
                "tipos",
                JSONObject()
                    .put("medindo", ColetaService.rodando)
                    .put("min_sem_batimento", minDesde(EstadoSaude.ultimoValidoMs))
                    .put("min_sem_lote", minDesde(EstadoSaude.ultimoLoteMs))
                    .put("religadas", ColetaService.religadas)
                    .put("temp_ligada", ColetaService.tempLigada)
                    .put("min_sem_temp", minDesde(TemperaturaNoturna.ultimoLoteMs))
                    .put("temp_janelas", TemperaturaNoturna.janelasEnfileiradas)
                    .put("temp_religada", ColetaService.tempReiniciada),
            )
            .put("sensor", runCatching { ColetaService.instancia?.diagSensor() }.getOrNull() ?: JSONObject().put("estado", "SERVICO_PARADO"))
    }

    /** Estado do relógio enviado junto com cada lote. */
    private fun estado(ctx: Context): JSONObject {
        val b = ctx.applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val o = JSONObject().put("versao", BuildConfig.VERSION_NAME).put("ts", System.currentTimeMillis())
        b?.let {
            val nivel = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val escala = it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            if (nivel >= 0 && escala > 0) o.put("bateria", nivel * 100 / escala)
            o.put("carregando", it.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0)
        }
        EstadoSaude.noPulso?.let { o.put("no_pulso", it) }
        if (EstadoSaude.ultimaLeituraMs > 0) o.put("ultima_leitura", EstadoSaude.ultimaLeituraMs)
        return o
    }

    /** Extrai a coluna ECG_MV do CSV gravado na medição. */
    private fun lerEcg(arquivo: File): JSONArray? {
        if (!arquivo.exists()) return null
        val linhas = arquivo.readLines()
        val col = linhas.firstOrNull()?.split(',')?.indexOfFirst { it.endsWith("ECG_MV") } ?: -1
        if (col < 0) return null
        val arr = JSONArray()
        linhas.drop(1).forEach { l -> l.split(',').getOrNull(col)?.toDoubleOrNull()?.let { arr.put(it) } }
        return arr
    }

    // ------------------------------------------------------------------ agendamento

    private val comRede = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Envio periódico (a cada 30 min, quando houver rede). */
    fun agendar(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<EnvioWorker>(30, TimeUnit.MINUTES).setConstraints(comRede).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("saude-envio", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Junta o que chegar nos próximos 2 min e envia de uma vez. */
    fun enviarEmBreve(ctx: Context) {
        if (!prefs(ctx).getBoolean("vinculado", false)) return
        val req = OneTimeWorkRequestBuilder<EnvioWorker>().setConstraints(comRede).setInitialDelay(2, TimeUnit.MINUTES).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("saude-envio-breve", ExistingWorkPolicy.KEEP, req)
    }

    fun enviarAgora(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<EnvioWorker>().setConstraints(comRede).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("saude-envio-agora", ExistingWorkPolicy.REPLACE, req)
    }

    fun novoIdLocal(): String = UUID.randomUUID().toString()
}

class EnvioWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        // a cada envio confere se a medição contínua está de pé (relógio reiniciado, processo encerrado…)
        runCatching { Automatico.conferir(applicationContext) }
        Sync.importarHistorico(applicationContext)
        // até 10 lotes por execução (esvazia filas grandes depois de um tempo offline)
        repeat(10) {
            if (!Sync.enviarLote(applicationContext)) return if (runAttemptCount < 5) Result.retry() else Result.failure()
            if (Sync.status(applicationContext).pendentes == 0) return Result.success()
        }
        return Result.success()
    }
}
