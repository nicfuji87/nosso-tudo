package app.nossotudo.saude.mobile

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.samsung.android.sdk.health.data.HealthDataService
import com.samsung.android.sdk.health.data.data.HealthDataPoint
import com.samsung.android.sdk.health.data.permission.AccessType
import com.samsung.android.sdk.health.data.permission.Permission
import com.samsung.android.sdk.health.data.request.DataType
import com.samsung.android.sdk.health.data.request.DataTypes
import com.samsung.android.sdk.health.data.request.LocalDateFilter
import com.samsung.android.sdk.health.data.request.LocalTimeFilter
import com.samsung.android.sdk.health.data.request.LocalTimeGroup
import com.samsung.android.sdk.health.data.request.LocalTimeGroupUnit
import com.samsung.android.sdk.health.data.request.Ordering
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

/**
 * Lê do Samsung Health (Data SDK, só LEITURA) e envia ao Nosso Tudo:
 * sono (estágios + nota), SpO2, temperatura da pele, treinos (tipo, FC, calorias, VO₂máx), Energy Score,
 * passos por dia, composição corporal (BIA), avisos de ritmo irregular e resultado de apneia do sono.
 * Idempotente: cada item vai com o uid do Samsung Health; o servidor atualiza se mudar.
 * Toda sincronização termina mandando um diagnóstico (versão, erro, quanto de cada tipo) — se parar, o site mostra.
 */
object SamsungSync {

    val PERMISSOES: Set<Permission> = setOf(
        Permission.of(DataTypes.SLEEP, AccessType.READ),
        Permission.of(DataTypes.BLOOD_OXYGEN, AccessType.READ),
        Permission.of(DataTypes.SKIN_TEMPERATURE, AccessType.READ),
        Permission.of(DataTypes.EXERCISE, AccessType.READ),
        Permission.of(DataTypes.ENERGY_SCORE, AccessType.READ),
        Permission.of(DataTypes.STEPS, AccessType.READ),
        Permission.of(DataTypes.BODY_COMPOSITION, AccessType.READ),
        Permission.of(DataTypes.IRREGULAR_HEART_RHYTHM_NOTIFICATION, AccessType.READ),
        Permission.of(DataTypes.SLEEP_APNEA, AccessType.READ),
    )

    data class Resultado(val enviados: Int, val porTipo: Map<String, Int>, val erro: String?)

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("samsung", Context.MODE_PRIVATE)

    suspend fun permissoesConcedidas(ctx: Context): Set<Permission> =
        HealthDataService.getStore(ctx).getGrantedPermissions(PERMISSOES)

    suspend fun pedirPermissoes(activity: Activity): Set<Permission> =
        HealthDataService.getStore(activity).requestPermissions(PERMISSOES, activity)

    /** Sincroniza e SEMPRE manda o diagnóstico ao servidor (com o erro, se houver). */
    suspend fun sincronizar(ctx: Context): Resultado {
        val r = runCatching { sincronizarDados(ctx) }
            .getOrElse { Resultado(0, emptyMap(), "${it.javaClass.simpleName}: ${it.message?.take(120) ?: ""}") }
        prefs(ctx).edit().putLong("ultima_tentativa", System.currentTimeMillis()).putString("ultimo_erro", r.erro).apply()
        if (Conexao.vinculado(ctx)) runCatching {
            val diag = JSONObject()
                .put("versao", BuildConfig.VERSION_NAME)
                .put("ultima_sync", ultimaSync(ctx).takeIf { it > 0 } ?: JSONObject.NULL)
                .put("erro", r.erro ?: JSONObject.NULL)
                .put("tipos", JSONObject(r.porTipo as Map<*, *>))
                .put("otimizacao_bateria", !semRestricaoBateria(ctx))
            Conexao.post(JSONObject().put("acao", "enviar").put("segredo", Conexao.segredo(ctx)).put("diag", diag))
        }
        return r
    }

    /** O Android deixa o app rodar em segundo plano sem cortes? (a One UI costuma "pôr para dormir" apps novos) */
    fun semRestricaoBateria(ctx: Context): Boolean =
        (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)

    fun ultimoErro(ctx: Context): String? = prefs(ctx).getString("ultimo_erro", null)

    /** Lê os últimos dias e envia. Na 1ª vez busca 30 dias; depois, 4 dias (cobre correções do Samsung Health). */
    private suspend fun sincronizarDados(ctx: Context): Resultado {
        if (!Conexao.vinculado(ctx) && !Conexao.verificar(ctx)) return Resultado(0, emptyMap(), "celular não conectado ao Nosso Tudo")
        val store = HealthDataService.getStore(ctx)
        val concedidas = store.getGrantedPermissions(PERMISSOES).map { it.dataType }.toSet()
        if (concedidas.isEmpty()) return Resultado(0, emptyMap(), "sem permissão do Samsung Health")

        val p = prefs(ctx)
        // 30 dias até a 1ª leitura completa sem erro; depois, 4 dias (cobre correções do Samsung Health)
        val dias = if (!p.getBoolean("historico_ok", false)) 30L else 4L
        val erros = mutableListOf<String>()
        val ate = LocalDateTime.now().plusHours(1)
        val de = ate.minusDays(dias)
        val filtro = LocalTimeFilter.of(de, ate)
        val itens = mutableListOf<JSONObject>()

        suspend fun ler(tipo: DataType.Readable<HealthDataPoint, com.samsung.android.sdk.health.data.request.ReadDataRequest.DualTimeBuilder<HealthDataPoint>>): List<HealthDataPoint> {
            val req = tipo.readDataRequestBuilder.setLocalTimeFilter(filtro).setOrdering(Ordering.ASC).build()
            return store.readData(req).dataList
        }

        /** Lê um tipo; se falhar, guarda o erro (não engole em silêncio) e segue com os outros. */
        suspend fun tentar(nome: String, bloco: suspend () -> List<JSONObject>) {
            runCatching { bloco() }.onSuccess { itens += it }.onFailure {
                erros += "$nome: ${it.javaClass.simpleName}${it.message?.let { m -> " ${m.take(80)}" } ?: ""}"
                android.util.Log.w("SaudeNT", "falha ao ler $nome", it)
            }
        }
        if (DataTypes.SLEEP in concedidas) tentar("sono") { ler(DataTypes.SLEEP).map { sono(it) } }
        if (DataTypes.BLOOD_OXYGEN in concedidas) tentar("spo2") { ler(DataTypes.BLOOD_OXYGEN).map { spo2(it) } }
        if (DataTypes.SKIN_TEMPERATURE in concedidas) tentar("pele") { ler(DataTypes.SKIN_TEMPERATURE).map { pele(it) } }
        if (DataTypes.EXERCISE in concedidas) tentar("treinos") { ler(DataTypes.EXERCISE).flatMap { exercicios(it) } }
        if (DataTypes.ENERGY_SCORE in concedidas) tentar("energia") {
            val req = DataTypes.ENERGY_SCORE.readDataRequestBuilder
                .setLocalDateFilter(LocalDateFilter.of(LocalDate.now().minusDays(dias), LocalDate.now().plusDays(1))).build()
            store.readData(req).dataList.map { energia(it) }
        }
        if (DataTypes.STEPS in concedidas) tentar("passos") {
            val hoje = LocalDate.now()
            val req = DataType.StepsType.TOTAL.requestBuilder
                .setLocalTimeFilterWithGroup(
                    LocalTimeFilter.of(hoje.minusDays(30).atStartOfDay(), hoje.plusDays(1).atStartOfDay()), // sempre 30 dias: 1 linha por dia, é leve
                    LocalTimeGroup.of(LocalTimeGroupUnit.DAILY, 1),
                ).build()
            store.aggregateData(req).dataList.mapNotNull { a ->
                val total = a.value ?: return@mapNotNull null
                val dia = a.startTime.atZone(java.time.ZoneId.systemDefault()).toLocalDate()
                JSONObject().put("uid", "passos:$dia").put("tipo", "passos")
                    .put("inicio", a.startTime.toEpochMilli()).put("fim", a.endTime.toEpochMilli())
                    .put("dados", JSONObject().put("total", total).put("dia", dia.toString()))
            }
        }
        // composição corporal: medição rara (BIA no relógio) — busca 120 dias sempre
        if (DataTypes.BODY_COMPOSITION in concedidas) tentar("corpo") {
            val req = DataTypes.BODY_COMPOSITION.readDataRequestBuilder
                .setLocalTimeFilter(LocalTimeFilter.of(ate.minusDays(120), ate)).setOrdering(Ordering.ASC).build()
            store.readData(req).dataList.map { corpo(it) }
        }
        if (DataTypes.IRREGULAR_HEART_RHYTHM_NOTIFICATION in concedidas) tentar("ritmo") {
            val req = DataTypes.IRREGULAR_HEART_RHYTHM_NOTIFICATION.readDataRequestBuilder
                .setLocalTimeFilter(LocalTimeFilter.of(ate.minusDays(365), ate)).build()
            store.readData(req).dataList.map {
                base(it, "ritmo_irregular").put("dados", JSONObject().put("status", it.getValue(DataType.IrregularHeartRhythmNotificationType.STATUS)?.name))
            }
        }
        if (DataTypes.SLEEP_APNEA in concedidas) tentar("apneia") {
            val req = DataTypes.SLEEP_APNEA.readDataRequestBuilder
                .setLocalTimeFilter(LocalTimeFilter.of(ate.minusDays(365), ate)).build()
            store.readData(req).dataList.map {
                base(it, "apneia").put("dados", JSONObject().put("sinal", it.getValue(DataType.SleepApneaType.DETECTED_SIGN)?.name))
            }
        }

        // envia em lotes de 200
        var total = 0
        for (lote in itens.chunked(200)) {
            val corpo = JSONObject().put("acao", "enviar").put("segredo", Conexao.segredo(ctx)).put("samsung", JSONArray(lote))
            val (http, r) = runCatching { Conexao.post(corpo) }.getOrElse { return Resultado(total, contar(itens), "sem rede: ${it.javaClass.simpleName}") }
            if (http == 403) {
                Conexao.prefs(ctx).edit().putBoolean("vinculado", false).apply()
                return Resultado(total, contar(itens), "celular desconectado no Nosso Tudo")
            }
            if (http !in 200..299 || !r.optBoolean("ok")) return Resultado(total, contar(itens), r.optString("erro", "HTTP $http"))
            total += lote.size
        }
        p.edit().putLong("ultima_sync", System.currentTimeMillis()).putInt("ultimo_total", total)
            .apply { if (erros.isEmpty()) putBoolean("historico_ok", true) }.apply()
        return Resultado(total, contar(itens), erros.takeIf { it.isNotEmpty() }?.joinToString("; "))
    }

    fun ultimaSync(ctx: Context) = prefs(ctx).getLong("ultima_sync", 0)

    private fun contar(itens: List<JSONObject>) = itens.groupingBy { it.getString("tipo") }.eachCount()

    private fun base(dp: HealthDataPoint, tipo: String, uid: String = dp.uid) = JSONObject()
        .put("uid", "$tipo:$uid").put("tipo", tipo)
        .put("inicio", dp.startTime.toEpochMilli())
        .apply { dp.endTime?.let { put("fim", it.toEpochMilli()) } }

    private fun sono(dp: HealthDataPoint): JSONObject {
        val sessoes = dp.getValue(DataType.SleepType.SESSIONS).orEmpty()
        val minutos = mutableMapOf("acordado" to 0L, "leve" to 0L, "profundo" to 0L, "rem" to 0L)
        val estagios = JSONArray()
        for (s in sessoes) for (e in s.stages.orEmpty()) {
            val chave = when (e.stage) {
                DataType.SleepType.StageType.AWAKE -> "acordado"
                DataType.SleepType.StageType.LIGHT -> "leve"
                DataType.SleepType.StageType.DEEP -> "profundo"
                DataType.SleepType.StageType.REM -> "rem"
                else -> null
            } ?: continue
            val min = (e.endTime.toEpochMilli() - e.startTime.toEpochMilli()) / 60_000
            minutos[chave] = (minutos[chave] ?: 0) + min
            estagios.put(JSONArray().put(e.startTime.toEpochMilli()).put(e.endTime.toEpochMilli()).put(chave))
        }
        val dados = JSONObject()
            .put("duracao_min", dp.getValue(DataType.SleepType.DURATION)?.toMinutes())
            .put("nota", dp.getValue(DataType.SleepType.SLEEP_SCORE))
            .put("estagios_min", JSONObject(minutos as Map<*, *>))
            .put("sessoes", JSONArray(sessoes.map { JSONArray().put(it.startTime.toEpochMilli()).put(it.endTime.toEpochMilli()) }))
        if (estagios.length() <= 400) dados.put("estagios", estagios)
        return base(dp, "sono").put("dados", dados)
    }

    private fun spo2(dp: HealthDataPoint) = base(dp, "spo2").put(
        "dados",
        JSONObject()
            .put("media", dp.getValue(DataType.BloodOxygenType.OXYGEN_SATURATION))
            .put("min", dp.getValue(DataType.BloodOxygenType.MIN_OXYGEN_SATURATION))
            .put("max", dp.getValue(DataType.BloodOxygenType.MAX_OXYGEN_SATURATION))
            .put("n", dp.getValue(DataType.BloodOxygenType.SERIES_DATA)?.size ?: 0),
    )

    private fun pele(dp: HealthDataPoint) = base(dp, "temp_pele").put(
        "dados",
        JSONObject()
            .put("media", dp.getValue(DataType.SkinTemperatureType.SKIN_TEMPERATURE))
            .put("min", dp.getValue(DataType.SkinTemperatureType.MIN_SKIN_TEMPERATURE))
            .put("max", dp.getValue(DataType.SkinTemperatureType.MAX_SKIN_TEMPERATURE))
            .put("n", dp.getValue(DataType.SkinTemperatureType.SERIES_DATA)?.size ?: 0),
    )

    /** Um item por sessão de treino (um registro do Samsung Health pode ter várias). */
    private fun exercicios(dp: HealthDataPoint): List<JSONObject> {
        val tipoGeral = dp.getValue(DataType.ExerciseType.EXERCISE_TYPE)?.name
        val titulo = dp.getValue(DataType.ExerciseType.CUSTOM_TITLE)
        return dp.getValue(DataType.ExerciseType.SESSIONS).orEmpty().mapIndexed { i, s ->
            JSONObject().put("uid", "exercicio:${dp.uid}#$i").put("tipo", "exercicio")
                .put("inicio", s.startTime.toEpochMilli()).put("fim", s.endTime.toEpochMilli())
                .put(
                    "dados",
                    JSONObject()
                        .put("tipo_samsung", s.exerciseType?.name ?: tipoGeral)
                        .put("titulo", s.customTitle ?: titulo)
                        .put("duracao_min", s.duration?.toMinutes())
                        .put("calorias", s.calories.toDouble())
                        .put("fc_media", s.meanHeartRate)
                        .put("fc_max", s.maxHeartRate)
                        .put("fc_min", s.minHeartRate)
                        .put("distancia_m", s.distance)
                        .put("auto", s.autoDetected)
                        .put("vo2max", s.vo2Max),
                )
        }
    }

    private fun corpo(dp: HealthDataPoint) = base(dp, "corpo").put(
        "dados",
        JSONObject()
            .put("peso", dp.getValue(DataType.BodyCompositionType.WEIGHT))
            .put("gordura_pct", dp.getValue(DataType.BodyCompositionType.BODY_FAT))
            .put("musculo_esq_kg", dp.getValue(DataType.BodyCompositionType.SKELETAL_MUSCLE_MASS))
            .put("agua_kg", dp.getValue(DataType.BodyCompositionType.TOTAL_BODY_WATER))
            .put("imc", dp.getValue(DataType.BodyCompositionType.BODY_MASS_INDEX))
            .put("tmb", dp.getValue(DataType.BodyCompositionType.BASAL_METABOLIC_RATE)),
    )

    private fun energia(dp: HealthDataPoint) = base(dp, "energia")
        .put("dados", JSONObject().put("score", dp.getValue(DataType.EnergyScoreType.ENERGY_SCORE)))

    // ------------------------------------------------------------ agendamento
    private val comRede = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** A cada 2 h, com rede (o Samsung Health consolida o sono de manhã). UPDATE troca o agendamento antigo (3 h). */
    fun agendar(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(2, TimeUnit.HOURS).setConstraints(comRede).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("samsung-sync", ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    fun agora(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(comRede).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("samsung-sync-agora", ExistingWorkPolicy.REPLACE, req)
    }
}

/**
 * Roda como serviço em primeiro plano (notificação discreta enquanto sincroniza): a One UI corta
 * trabalho em segundo plano de apps novos — foi isso que parou a sincronização de madrugada.
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel("sync", "Sincronização", NotificationManager.IMPORTANCE_MIN))
        val n = NotificationCompat.Builder(applicationContext, "sync")
            .setSmallIcon(R.drawable.logo_nt_selo).setContentTitle("Saúde NT")
            .setContentText("Sincronizando com o Samsung Health…").setOngoing(true).setSilent(true).build()
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(7, n)
    }

    override suspend fun doWork(): Result {
        runCatching { setForeground(getForegroundInfo()) }
        val r = runCatching { SamsungSync.sincronizar(applicationContext) }.getOrElse { return Result.retry() }
        return if (r.erro == null) Result.success() else if (runAttemptCount < 3) Result.retry() else Result.failure()
    }
}
