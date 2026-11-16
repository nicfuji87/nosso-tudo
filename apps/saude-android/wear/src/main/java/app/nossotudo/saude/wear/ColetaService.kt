package app.nossotudo.saude.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.samsung.android.service.health.tracking.HealthTracker
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType
import java.io.File

/**
 * Coleta contínua em primeiro plano (exigência do Wear OS para não ser encerrada).
 * Grava um CSV por rastreador + bateria.csv (a cada minuto) + eventos.csv.
 */
class ColetaService : Service() {

    companion object {
        const val EXTRA_PPG = "ppg"
        /** "fundo" = medição automática (só HR+IBI, sem CSV); "lab" = coleta completa da Fase 1. */
        const val EXTRA_MODO = "modo"
        const val MODO_FUNDO = "fundo"
        const val MODO_LAB = "lab"
        private const val CANAL = "coleta"
        private const val NOTIF_ID = 1

        @Volatile var rodando = false
            private set
        @Volatile var modo: String = MODO_FUNDO
            private set
        @Volatile var resumo: String = "parada"
            private set
        @Volatile var pastaAtual: File? = null
            private set

        /** Rastreadores contínuos desejados na Fase 1 (só os que o relógio suportar serão ligados). */
        private val CONTINUOS = listOf(
            "HEART_RATE_CONTINUOUS",
            "ACCELEROMETER_CONTINUOUS",
            "SKIN_TEMPERATURE_CONTINUOUS",
        )
    }

    private val main = Handler(Looper.getMainLooper())
    private var sensores: Sensores? = null
    private val ativos = mutableListOf<Pair<HealthTracker, GravadorCsv>>()
    private var eventos: LogCsv? = null
    private var bateria: LogCsv? = null
    private var inicioMs = 0L
    private val avisos = linkedSetOf<String>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (rodando) return START_STICKY
        EstadoSaude.iniciar(this)
        // reinício pelo sistema (START_STICKY) chega com intent nulo → volta no modo automático
        modo = intent?.getStringExtra(EXTRA_MODO) ?: MODO_FUNDO
        iniciarPrimeiroPlano()
        rodando = true
        inicioMs = System.currentTimeMillis()

        val pasta = if (modo == MODO_LAB) Pastas.novaSessao(filesDir) else null
        pastaAtual = pasta
        if (pasta != null) {
            eventos = LogCsv(File(pasta, "eventos.csv"), "ts_ms,evento,detalhe")
            bateria = LogCsv(File(pasta, "bateria.csv"), "ts_ms,nivel_pct,carregando,temp_c,amostras_total")
        }
        eventos?.linha(System.currentTimeMillis(), "inicio", "${Build.MODEL} sdk=${Build.VERSION.SDK_INT}")

        val comPpg = intent?.getBooleanExtra(EXTRA_PPG, false) ?: false
        val s = Sensores(this).also { sensores = it }
        s.conectar(
            onOk = { main.post { ligarRastreadores(s, pasta, comPpg) } },
            onFalha = { e ->
                eventos?.linha(System.currentTimeMillis(), "falha_conexao", Sensores.descreverErro(e))
                resumo = "falha: ${Sensores.descreverErro(e)}"
                main.post { stopSelf() }
            },
        )
        main.postDelayed(medirBateria, 1_000)
        return START_STICKY
    }

    private fun ligarRastreadores(s: Sensores, pasta: File?, comPpg: Boolean) {
        val suportados = s.suportados().associateBy { it.name }
        val desejados = if (pasta == null) listOf("HEART_RATE_CONTINUOUS")
            else CONTINUOS + if (comPpg) listOf("PPG_CONTINUOUS") else emptyList()
        for (nome in desejados) {
            val tipo: HealthTrackerType = suportados[nome] ?: run {
                eventos?.linha(System.currentTimeMillis(), "nao_suportado", nome)
                continue
            }
            try {
                val tracker = s.rastreador(tipo)
                val gravador = GravadorCsv(pasta?.let { File(it, "${nome.lowercase()}.csv") }, nome)
                tracker.setEventListener(object : HealthTracker.TrackerEventListener {
                    override fun onDataReceived(lote: List<DataPoint>) {
                        gravador.gravar(lote)
                        if (nome == "HEART_RATE_CONTINUOUS") EstadoSaude.registrarLote(lote)
                    }
                    override fun onFlushCompleted() {}
                    override fun onError(erro: HealthTracker.TrackerError) {
                        eventos?.linha(System.currentTimeMillis(), "erro_rastreador", "$nome: $erro")
                        avisos += when (erro.name) {
                            "SDK_POLICY_ERROR" -> "SDK_POLICY_ERROR: ative o modo dev do Health Platform"
                            "PERMISSION_ERROR" -> "PERMISSION_ERROR: falta permissão de sensores"
                            else -> "$nome: $erro"
                        }
                        main.post { atualizarResumo() }
                    }
                })
                ativos += tracker to gravador
                eventos?.linha(System.currentTimeMillis(), "ligado", nome)
            } catch (e: Exception) {
                eventos?.linha(System.currentTimeMillis(), "falha_ligar", "$nome: ${e.javaClass.simpleName} ${e.message}")
            }
        }
        atualizarResumo()
    }

    private val medirBateria = object : Runnable {
        override fun run() {
            val st = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val nivel = st?.let {
                val l = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val esc = it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
                if (l >= 0) l * 100f / esc else null
            }
            val carregando = (st?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
            val temp = st?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)?.div(10f)
            bateria?.linha(System.currentTimeMillis(), nivel, carregando, temp, ativos.sumOf { it.second.amostras.get() })
            atualizarResumo()
            main.postDelayed(this, 60_000)
        }
    }

    private fun atualizarResumo() {
        val min = (System.currentTimeMillis() - inicioMs) / 60_000
        resumo = "coletando há $min min\n" + ativos.joinToString("\n") { (_, g) ->
            "• ${g.tipo.substringBefore("_CONTINUOUS").lowercase()}: ${g.amostras.get()}"
        } + avisos.joinToString("") { "\n⚠ $it" }
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, notificacao(if (modo == MODO_FUNDO) "Medindo em segundo plano" else "Coletando há $min min"))
    }

    override fun onDestroy() {
        EstadoSaude.fecharMinuto()
        main.removeCallbacksAndMessages(null)
        for ((tracker, gravador) in ativos) {
            runCatching { tracker.unsetEventListener() }
            gravador.fechar()
        }
        eventos?.linha(System.currentTimeMillis(), "fim", ativos.joinToString(" ") { "${it.second.amostras.get()}" })
        ativos.clear()
        sensores?.desconectar()
        eventos?.fechar()
        bateria?.fechar()
        rodando = false
        resumo = if (modo == MODO_FUNDO) "medição automática parada" else "parada (última sessão: ${pastaAtual?.name})"
        super.onDestroy()
    }

    private fun iniciarPrimeiroPlano() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANAL, "Coleta de sensores", NotificationManager.IMPORTANCE_LOW))
        val n = notificacao("Iniciando coleta…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun notificacao(texto: String): Notification {
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CANAL)
            .setContentTitle("Saúde NT")
            .setContentText(texto)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setContentIntent(abrir)
            .build()
    }
}

/** Coleta completa de laboratório (CSV de todos os sensores). Substitui a medição automática enquanto roda. */
fun Context.iniciarColeta(comPpg: Boolean) {
    val app = applicationContext
    val intent = Intent(app, ColetaService::class.java)
        .putExtra(ColetaService.EXTRA_PPG, comPpg).putExtra(ColetaService.EXTRA_MODO, ColetaService.MODO_LAB)
    if (ColetaService.rodando) {
        app.stopService(Intent(app, ColetaService::class.java))
        Handler(Looper.getMainLooper()).postDelayed({ app.startForegroundService(intent) }, 1_000)
    } else {
        app.startForegroundService(intent)
    }
}

/** Para a coleta atual; se a medição automática estiver ligada, ela volta sozinha. */
fun Context.pararColeta() {
    val app = applicationContext
    val eraLab = ColetaService.modo == ColetaService.MODO_LAB
    app.stopService(Intent(app, ColetaService::class.java))
    if (eraLab) Handler(Looper.getMainLooper()).postDelayed({ Automatico.garantir(app) }, 1_000)
}

/**
 * Medição automática em segundo plano: depois de pareado, o relógio mede batimento + IBI
 * continuamente (serviço em primeiro plano, religado no boot) e o WorkManager envia a cada 30 min.
 */
object Automatico {
    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)

    fun ligadoPeloUsuario(ctx: Context) = prefs(ctx).getBoolean("auto", BuildConfig.AUTO_PADRAO)
    fun ativo(ctx: Context) = ligadoPeloUsuario(ctx) && Sync.status(ctx).vinculado

    fun definir(ctx: Context, ligado: Boolean) {
        prefs(ctx).edit().putBoolean("auto", ligado).apply()
        if (ligado) garantir(ctx)
        else if (ColetaService.rodando && ColetaService.modo == ColetaService.MODO_FUNDO) {
            ctx.applicationContext.stopService(Intent(ctx.applicationContext, ColetaService::class.java))
        }
    }

    /** Liga a medição de fundo se estiver configurada e ainda não estiver rodando. */
    fun garantir(ctx: Context) {
        if (!ativo(ctx) || ColetaService.rodando) return
        Sync.agendar(ctx)
        runCatching {
            ctx.applicationContext.startForegroundService(
                Intent(ctx.applicationContext, ColetaService::class.java).putExtra(ColetaService.EXTRA_MODO, ColetaService.MODO_FUNDO),
            )
        }
    }
}

/** Religa a medição automática quando o relógio reinicia ou o app é atualizado. */
class InicioReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            EstadoSaude.iniciar(ctx)
            Automatico.garantir(ctx)
        }
    }
}
