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

        /** Diagnóstico enviado ao servidor a cada lote (aparece no site): avisos, religadas, temperatura. */
        @Volatile var avisosTexto: String? = null
            private set
        @Volatile var religadas = 0
            private set
        @Volatile var tempLigada = false
            private set
        @Volatile var tempReiniciada = 0
            private set
        /**
         * A temperatura deu PERMISSION_ERROR: o serviço foi religado em segundo plano (boot/atualização) e o
         * Android não dá acesso "enquanto em uso" aos sensores. Abrir o app religa o serviço em primeiro plano.
         */
        @Volatile var tempSemPermissao = false
            private set
        /** Serviço em execução (para a vigia por alarme acordar o relógio e conferir o sensor). */
        @Volatile var instancia: ColetaService? = null
            private set
        /** Erro permanente do sensor (permissão/política): abrir o app religa em primeiro plano. */
        @Volatile var sensorBloqueado: String? = null
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
    /** Rastreador de temperatura da pele, ligado só à noite no modo automático. */
    private var temperatura: HealthTracker? = null

    /** Carregador conectado / desconectado, com o nível de bateria no momento. */
    private val energia = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val tipo = when (i.action) {
                Intent.ACTION_POWER_CONNECTED -> "carregando"
                Intent.ACTION_POWER_DISCONNECTED -> "desconectado"
                else -> return
            }
            runCatching { Sync.enfileirarTransicao(c, System.currentTimeMillis(), tipo, Bateria.nivel(c)) }
        }
    }
    private var energiaRegistrada = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (rodando) return START_STICKY
        tempSemPermissao = false
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

        comPpgAtual = intent?.getBooleanExtra(EXTRA_PPG, false) ?: false
        sensorBloqueado = null
        // último batimento válido antes deste início: se o processo morreu ou o relógio reiniciou, vira lacuna
        monitor = MonitorSensor({ System.currentTimeMillis() }, ultimoValidoAnteriorMs = prefsColeta().getLong("ultimo_valido", 0L))
        conectarSensores(pasta, null)
        main.postDelayed(medirBateria, 1_000)
        if (!energiaRegistrada) {
            val filtro = IntentFilter().apply { addAction(Intent.ACTION_POWER_CONNECTED); addAction(Intent.ACTION_POWER_DISCONNECTED) }
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(energia, filtro, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(energia, filtro)
            energiaRegistrada = true
            // serviço (re)iniciado já no carregador: registra o estado atual para a linha do tempo
            if (Bateria.carregando(this)) runCatching { Sync.enfileirarTransicao(this, System.currentTimeMillis(), "carregando", Bateria.nivel(this)) }
        }
        if (modo == MODO_FUNDO) { main.postDelayed(enviar, 2 * 60_000L); VigiaAlarme.agendar(this) }
        instancia = this
        return START_STICKY
    }

    private var comPpgAtual = false

    /** Máquina de estados da coleta (v0.9.7): decide quando religar e registra as lacunas. */
    private lateinit var monitor: MonitorSensor

    /** Portão da geração (v0.9.8): callbacks antigos não gravam batimento nem acordam o processador. */
    private val portao = PortaoGeracao()

    private fun prefsColeta() = getSharedPreferences("coleta", Context.MODE_PRIVATE)

    /**
     * Conecta ao serviço de sensores da Samsung. [motivo] = null na primeira conexão; com texto, é uma
     * recuperação: segura o processador acordado até o primeiro batimento válido (ou 90 s).
     * Os callbacks levam a geração da tentativa — os de tentativas antigas são ignorados.
     */
    private fun conectarSensores(pasta: File?, motivo: String?) {
        val g = monitor.iniciarConexao(motivo)
        portao.abrir(g)
        if (motivo != null) {
            segurarAcordado(90_000L, "recuperacao")
            avisos.removeAll { it.startsWith("religado") }
            avisos += "religado ${monitor.reconexoesTotal}x ($motivo)"
            religadas = monitor.reconexoesTotal
            eventos?.linha(System.currentTimeMillis(), "religar", motivo)
        }
        val s = Sensores(this).also { sensores = it }
        s.conectar(
            onOk = { if (portao.eAtual(g)) main.post { if (monitor.conectado(g)) ligarRastreadores(s, pasta, comPpgAtual, g) } },
            onFalha = { e ->
                if (portao.eAtual(g)) main.post {
                    // erro com resolução (ex.: atualizar o serviço da Samsung) exige ação do usuário: não insiste
                    monitor.falhaConexao(g, permanente = e.hasResolution(), descricao = Sensores.descreverErro(e))
                    eventos?.linha(System.currentTimeMillis(), "falha_conexao", Sensores.descreverErro(e))
                    resumo = "falha: ${Sensores.descreverErro(e)}"
                    if (modo != MODO_FUNDO) stopSelf() else depoisDeEvento()
                }
            },
            // o serviço de sensores caiu (atualização, economia de energia do Wear OS 6…): religa já, acordado
            // só a geração atual acorda o processador: a desconexão intencional (religar/parar) não
            onFim = {
                CallbacksSensor.aoFimDaConexao(
                    portao, g,
                    segurarAcordado = { segurarAcordado(90_000L, "conexao_encerrada") },
                    processar = { main.post { monitor.conexaoEncerrada(g); depoisDeEvento() } },
                )
            },
        )
    }

    /** Avalia a máquina de estados e age (religar, aguardar o backoff ou soltar a trava). */
    private fun avaliar() {
        if (modo != MODO_FUNDO || !rodando) return
        monitor.definirCarregando(Bateria.carregando(this))
        when (val d = monitor.avaliar()) {
            is Decisao.Religar -> religarSensores(d.motivo)
            is Decisao.Aguardar -> {
                main.removeCallbacks(reavaliar)
                main.postDelayed(reavaliar, (d.ateMs - System.currentTimeMillis()).coerceIn(1_000L, 10 * 60_000L))
                if (!monitor.recuperando) soltarTrava()
            }
            Decisao.Nada -> if (!monitor.recuperando) soltarTrava()
        }
        if (monitor.estado == EstadoSensor.BLOCKED && sensorBloqueado == null) {
            sensorBloqueado = monitor.bloqueio
            soltarTrava()
            Automatico.avisoParado(applicationContext, true)
        }
        // lacunas fechadas vão para a fila de envio, com o contexto do momento
        monitor.retirarLacunas().forEach { l ->
            runCatching {
                Sync.enfileirarLacuna(
                    applicationContext, l, Bateria.nivel(this), EstadoSaude.noPulso, Bateria.carregando(this), monitor.estado.name,
                )
            }
        }
    }

    private val reavaliar = Runnable { avaliar() }

    /** Depois de um callback da Samsung: reavalia já (religar imediato quando cabe no backoff). */
    private fun depoisDeEvento() { avaliar(); atualizarResumo() }

    /** Chamado pelo alarme da vigia: acorda o processador só o tempo de avaliar. */
    fun vigiarPorAlarme() {
        segurarAcordado(30_000L, "vigia")
        main.post { avaliar() }
    }

    private val travaAcordado by lazy {
        (getSystemService(Context.POWER_SERVICE) as android.os.PowerManager)
            .newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "saudent:sensor").apply { setReferenceCounted(false) }
    }
    private var travaDesde = 0L
    private var travaMsTotal = 0L
    private var travaMotivo: String? = null

    /** Mantém o processador acordado por pouco tempo (o tempo-limite garante a liberação em qualquer caminho). */
    private fun segurarAcordado(ms: Long, motivo: String) {
        runCatching {
            if (!travaAcordado.isHeld) travaDesde = System.currentTimeMillis()
            travaAcordado.acquire(ms)
            travaMotivo = motivo
        }
    }

    private fun soltarTrava() {
        runCatching {
            if (travaAcordado.isHeld) {
                travaMsTotal += System.currentTimeMillis() - travaDesde
                travaAcordado.release()
            }
            travaMotivo = null
        }
    }

    /** Desliga os rastreadores e conecta de novo (nova geração: callbacks da conexão antiga são ignorados). */
    private fun religarSensores(motivo: String) {
        if (!rodando) return
        portao.fechar() // a partir daqui, callbacks da conexão atual são ignorados (inclusive o onConnectionEnded)
        for ((tracker, gravador) in ativos) {
            runCatching { tracker.unsetEventListener() }
            gravador.fechar()
        }
        ativos.clear()
        desligarTemperatura()
        sensores?.desconectar()
        sensores = null
        conectarSensores(pastaAtual, motivo)
    }

    private fun ligarRastreadores(s: Sensores, pasta: File?, comPpg: Boolean, g: Int) {
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
                        if (!portao.eAtual(g)) return // listener de conexão antiga: não grava nada
                        gravador.gravar(lote)
                        if (nome != "HEART_RATE_CONTINUOUS") return
                        // a geração é conferida ANTES de gravar FC/VFC, sob o mesmo lock que a troca de geração
                        val r = CallbacksSensor.aoReceberLote(portao, g) { EstadoSaude.registrarLote(lote) } ?: return
                        main.post {
                            // a trava só sai quando o sensor PROVOU que voltou: primeiro batimento válido
                            if (monitor.lote(g, r.validos, r.foraDoPulso)) {
                                soltarTrava()
                                monitor.ultimaRecuperacaoMs?.let { eventos?.linha(System.currentTimeMillis(), "recuperado_ms", "$it") }
                                atualizarResumo()
                            }
                        }
                    }
                    override fun onFlushCompleted() {}
                    override fun onError(erro: HealthTracker.TrackerError) {
                        if (!portao.eAtual(g)) return
                        eventos?.linha(System.currentTimeMillis(), "erro_rastreador", "$nome: $erro")
                        avisos += when (erro.name) {
                            "SDK_POLICY_ERROR" -> "SDK_POLICY_ERROR: ative o modo dev do Health Platform"
                            "PERMISSION_ERROR" -> "PERMISSION_ERROR: falta permissão de sensores"
                            else -> "$nome: $erro"
                        }
                        main.post {
                            if (nome == "HEART_RATE_CONTINUOUS") { monitor.erroRastreador(g, erro.name); depoisDeEvento() }
                            else atualizarResumo()
                        }
                    }
                })
                ativos += tracker to gravador
                eventos?.linha(System.currentTimeMillis(), "ligado", nome)
                // listener registrado não prova que o sensor voltou: a trava segue até o 1º batimento válido
                if (nome == "HEART_RATE_CONTINUOUS") monitor.inscrito(g)
            } catch (e: Exception) {
                eventos?.linha(System.currentTimeMillis(), "falha_ligar", "$nome: ${e.javaClass.simpleName} ${e.message}")
                if (nome == "HEART_RATE_CONTINUOUS") { monitor.erroRastreador(g, "FALHA_LIGAR"); main.post { depoisDeEvento() } }
            }
        }
        atualizarResumo()
    }

    /** Diagnóstico da coleta para o servidor (estado, tempos, reconexões, trava, alarme). */
    fun diagSensor(): org.json.JSONObject {
        val agora = System.currentTimeMillis()
        val min = { t: Long -> if (t > 0) ((agora - t) / 60_000).toInt() else -1 }
        val trava = travaMsTotal + if (runCatching { travaAcordado.isHeld }.getOrDefault(false)) agora - travaDesde else 0
        return org.json.JSONObject()
            .put("estado", monitor.estado.name)
            .put("min_sem_lote", min(monitor.ultimoLoteMs))
            .put("min_sem_valido", min(monitor.ultimoValidoMs))
            .put("min_desde_tentativa", min(monitor.ultimaTentativaMs))
            .put("tentativas_seguidas", monitor.tentativasSeguidas)
            .put("reconexoes", monitor.reconexoesTotal)
            .put("ultima_recuperacao_s", monitor.ultimaRecuperacaoMs?.div(1000) ?: org.json.JSONObject.NULL)
            .put("bloqueio", monitor.bloqueio ?: org.json.JSONObject.NULL)
            .put("trava_s", trava / 1000)
            .put("trava_motivo", travaMotivo ?: org.json.JSONObject.NULL)
            .put("servico_min", (agora - inicioMs) / 60_000)
            .put("alarme", VigiaAlarme.diag(this))
    }

    /**
     * Envio a partir do próprio serviço a cada 30 min. Com a tela apagada o Wear OS adia muito o
     * WorkManager (Doze); o serviço em primeiro plano continua acordado e com rede. O WorkManager fica de reserva.
     */
    private val enviar = object : Runnable {
        override fun run() {
            val app = applicationContext
            Thread {
                EstadoSaude.fecharMinutoSeAntigo()
                runCatching { Sync.enviarTudoAgora(app) }
            }.start()
            main.postDelayed(this, 30 * 60_000L)
        }
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
            nivel?.let { Bateria.registrar(System.currentTimeMillis(), it.toInt()) }
            if (modo == MODO_FUNDO) {
                ajustarTemperatura()
                avaliar()
                if (monitor.ultimoValidoMs > 0) prefsColeta().edit().putLong("ultimo_valido", monitor.ultimoValidoMs).apply()
            }
            atualizarResumo()
            main.postDelayed(this, 60_000)
        }
    }

    /** Liga a temperatura da pele das 22h às 8h (no pulso) e desliga fora disso. Chamado a cada minuto. */
    private fun ajustarTemperatura() {
        val s = sensores ?: return
        // sem permissão não adianta tentar a cada minuto: espera o app ser aberto (que religa o serviço)
        val querer = TemperaturaNoturna.eNoite() && EstadoSaude.noPulso != false && !tempSemPermissao
        // vigia da temperatura (v0.9.3): na noite de 20/11 o rastreador ficou ligado sem entregar nada.
        // Ligado, no pulso, e 15 min sem lote → desliga; no minuto seguinte liga de novo.
        if (querer && temperatura != null && EstadoSaude.noPulso == true && !Bateria.carregando(this)) {
            val desde = maxOf(TemperaturaNoturna.ultimoLoteMs, tempLigadaEm)
            if (System.currentTimeMillis() - desde > 15 * 60_000L) {
                tempReiniciada++
                avisos.removeAll { it.startsWith("temperatura religada") }
                avisos += "temperatura religada ${tempReiniciada}x"
                desligarTemperatura()
                return
            }
        }
        if (querer && temperatura == null) {
            val tipo = runCatching { s.suportados().firstOrNull { it.name == "SKIN_TEMPERATURE_CONTINUOUS" } }.getOrNull() ?: return
            runCatching {
                val t = s.rastreador(tipo)
                t.setEventListener(object : HealthTracker.TrackerEventListener {
                    override fun onDataReceived(lote: List<DataPoint>) = TemperaturaNoturna.registrarLote(applicationContext, lote)
                    override fun onFlushCompleted() {}
                    override fun onError(erro: HealthTracker.TrackerError) {
                        avisos += "temperatura: $erro"
                        if (erro.name == "PERMISSION_ERROR") {
                            tempSemPermissao = true
                            avisos += "abra o Saúde NT no relógio para liberar a temperatura"
                            Automatico.avisoTemperatura(applicationContext)
                        }
                        main.post { desligarTemperatura() } // tenta de novo no próximo minuto (se tiver permissão)
                    }
                })
                temperatura = t
                tempLigadaEm = System.currentTimeMillis()
                tempLigada = true
            }
        } else if (!querer && temperatura != null) {
            desligarTemperatura()
        }
    }

    private var tempLigadaEm = 0L

    private fun desligarTemperatura() {
        runCatching { temperatura?.unsetEventListener() }
        temperatura = null
        tempLigada = false
        TemperaturaNoturna.fechar(applicationContext)
    }

    private fun atualizarResumo() {
        val min = (System.currentTimeMillis() - inicioMs) / 60_000
        avisosTexto = avisos.takeIf { it.isNotEmpty() }?.joinToString("; ")
        resumo = "coletando há $min min\n" + ativos.joinToString("\n") { (_, g) ->
            "• ${g.tipo.substringBefore("_CONTINUOUS").lowercase()}: ${g.amostras.get()}"
        } + avisos.joinToString("") { "\n⚠ $it" }
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, notificacao(if (modo == MODO_FUNDO) "Medindo em segundo plano" else "Coletando há $min min"))
    }

    override fun onDestroy() {
        instancia = null
        // parada pedida (usuário desligou / modo laboratório): a vigia não deve religar
        if (!Automatico.ativo(this) || modo != MODO_FUNDO) VigiaAlarme.cancelar(this)
        portao.fechar()
        if (::monitor.isInitialized) {
            if (monitor.ultimoValidoMs > 0) prefsColeta().edit().putLong("ultimo_valido", monitor.ultimoValidoMs).apply()
            monitor.encerrar()
        }
        soltarTrava()
        EstadoSaude.fecharMinuto()
        desligarTemperatura()
        if (energiaRegistrada) { runCatching { unregisterReceiver(energia) }; energiaRegistrada = false }
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
            .setSmallIcon(R.drawable.ic_stat_nt)
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

    fun ligadoPeloUsuario(ctx: Context) = prefs(ctx).getBoolean("auto", true)
    fun ativo(ctx: Context) = ligadoPeloUsuario(ctx) && Sync.status(ctx).vinculado

    fun definir(ctx: Context, ligado: Boolean) {
        prefs(ctx).edit().putBoolean("auto", ligado).apply()
        if (ligado) garantir(ctx)
        else if (ColetaService.rodando && ColetaService.modo == ColetaService.MODO_FUNDO) {
            ctx.applicationContext.stopService(Intent(ctx.applicationContext, ColetaService::class.java))
        }
    }

    /**
     * Liga a medição de fundo se estiver configurada e ainda não estiver rodando. Devolve se conseguiu.
     * O serviço sobe ANTES de qualquer outra coisa: depois de um reinício o Android só deixa iniciar o serviço em
     * primeiro plano por alguns segundos após o BOOT_COMPLETED — em 19/11 o relógio, lento no boot, perdeu essa janela.
     */
    fun garantir(ctx: Context): Boolean {
        if (!ativo(ctx) || ColetaService.rodando) return ColetaService.rodando
        val ok = runCatching {
            ctx.applicationContext.startForegroundService(
                Intent(ctx.applicationContext, ColetaService::class.java).putExtra(ColetaService.EXTRA_MODO, ColetaService.MODO_FUNDO),
            )
        }.isSuccess
        Sync.agendar(ctx)
        if (ok) avisoParado(ctx, false)
        return ok
    }

    private const val CANAL_PARADO = "parado"
    private const val NOTIF_PARADO = 41

    /**
     * Plano B: se o Android não deixou religar sozinho (serviço em primeiro plano bloqueado em segundo plano),
     * avisa no relógio — tocar abre o app, e abrir o app religa a medição.
     */
    fun avisoParado(ctx: Context, mostrar: Boolean) {
        val nm = ctx.getSystemService(android.app.NotificationManager::class.java) ?: return
        if (!mostrar) { nm.cancel(NOTIF_PARADO); return }
        nm.createNotificationChannel(android.app.NotificationChannel(CANAL_PARADO, "Medição parada", android.app.NotificationManager.IMPORTANCE_HIGH))
        val abrir = android.app.PendingIntent.getActivity(
            ctx, 41, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        nm.notify(
            NOTIF_PARADO,
            android.app.Notification.Builder(ctx, CANAL_PARADO)
                .setSmallIcon(R.drawable.ic_stat_nt)
                .setContentTitle("Saúde NT parou de medir")
                .setContentText("Toque para religar a medição do batimento.")
                .setContentIntent(abrir).setAutoCancel(true)
                .build(),
        )
    }

    /** Temperatura bloqueada por permissão: avisa uma vez por noite — tocar abre o app, que religa em primeiro plano. */
    fun avisoTemperatura(ctx: Context) {
        val p = ctx.getSharedPreferences("sync", Context.MODE_PRIVATE)
        val hoje = java.time.LocalDate.now().toString()
        if (p.getString("aviso_temp_dia", null) == hoje) return
        p.edit().putString("aviso_temp_dia", hoje).apply()
        val nm = ctx.getSystemService(android.app.NotificationManager::class.java) ?: return
        nm.createNotificationChannel(android.app.NotificationChannel(CANAL_PARADO, "Medição parada", android.app.NotificationManager.IMPORTANCE_HIGH))
        val abrir = android.app.PendingIntent.getActivity(
            ctx, 42, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        nm.notify(
            NOTIF_PARADO + 1,
            android.app.Notification.Builder(ctx, CANAL_PARADO)
                .setSmallIcon(R.drawable.ic_stat_nt)
                .setContentTitle("Temperatura da pele bloqueada")
                .setContentText("Toque para abrir o Saúde NT e liberar a medição desta noite.")
                .setContentIntent(abrir).setAutoCancel(true)
                .build(),
        )
    }

    /**
     * Ao abrir o app: se o serviço está rodando sem acesso aos sensores (subiu em segundo plano), religa agora,
     * com o app na tela — assim ele ganha o acesso "enquanto em uso" e a temperatura volta.
     */
    fun religarEmPrimeiroPlano(ctx: Context) {
        val bloqueado = ColetaService.tempSemPermissao || ColetaService.sensorBloqueado != null
        if (!ColetaService.rodando || !bloqueado || ColetaService.modo != ColetaService.MODO_FUNDO) return
        val app = ctx.applicationContext
        app.stopService(Intent(app, ColetaService::class.java))
        Handler(Looper.getMainLooper()).postDelayed({ garantir(app) }, 1_000)
    }

    /** Chamado pelo envio periódico: se a medição devia estar ligada e não está, tenta religar; se não der, avisa. */
    fun conferir(ctx: Context) {
        if (!ativo(ctx) || ColetaService.rodando) return
        if (!garantir(ctx)) avisoParado(ctx, true)
    }
}

/** Religa a medição automática quando o relógio reinicia ou o app é atualizado. */
class InicioReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            // primeiro o serviço (a janela para iniciar em primeiro plano depois do boot é curta), depois o resto
            val ok = Automatico.garantir(ctx)
            if (Automatico.ativo(ctx)) VigiaAlarme.agendar(ctx) // a vigia existe mesmo se o serviço foi bloqueado no boot
            EstadoSaude.iniciar(ctx)
            if (!ok) Automatico.avisoParado(ctx, true)
        }
    }
}
