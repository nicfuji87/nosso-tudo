package app.nossotudo.saude.wear

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import org.json.JSONObject

/**
 * Vigia da coleta por alarme (v0.9.7). O Handler do serviço não roda com o relógio em repouso profundo
 * quando o sensor para de mandar dados — era aí que a medição ficava parada 30–50 min à noite (23/11).
 *
 * - Alarme "permitido em repouso" (setAndAllowWhileIdle). NÃO é exato: em Doze o Wear OS espaça para
 *   ≥ ~9 min e pode atrasar mais. Por isso guardamos horário programado, horário real e atraso.
 * - O estado fica em SharedPreferences: sobrevive à morte do processo (a referência estática ao serviço não).
 * - O receiver SEMPRE reagenda antes de qualquer outra coisa, exceto quando a medição automática foi desligada.
 * - Sem serviço (processo encerrado): tenta religar a medição. O Android 12+ pode bloquear o início do serviço em
 *   primeiro plano vindo de segundo plano — então registra o bloqueio e avisa no relógio (tocar abre o app).
 */
object VigiaAlarme {
    private const val INTERVALO = 10 * 60_000L
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("vigia", Context.MODE_PRIVATE)

    private fun pendente(ctx: Context) = PendingIntent.getBroadcast(
        ctx.applicationContext, 77, Intent(ctx.applicationContext, VigiaReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun agendar(ctx: Context) {
        val alvo = System.currentTimeMillis() + INTERVALO
        val ok = runCatching {
            val am = ctx.getSystemService(AlarmManager::class.java) ?: error("sem AlarmManager")
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + INTERVALO, pendente(ctx))
        }
        val pr = p(ctx)
        val e = pr.edit().putLong("programado_para", alvo).putInt("agendados", pr.getInt("agendados", 0) + 1)
        ok.onFailure { erro ->
            e.putInt("falhas_agendamento", pr.getInt("falhas_agendamento", 0) + 1)
                .putString("ultima_falha", "${erro.javaClass.simpleName}: ${erro.message}".take(120))
        }
        e.apply()
    }

    fun cancelar(ctx: Context) {
        runCatching { ctx.getSystemService(AlarmManager::class.java)?.cancel(pendente(ctx)) }
        p(ctx).edit().remove("programado_para").apply()
    }

    /** Registra a execução: atraso em relação ao programado (o alarme não é exato em Doze). */
    fun registrarExecucao(ctx: Context, resultado: String) {
        val agora = System.currentTimeMillis()
        val pr = p(ctx)
        val prog = pr.getLong("programado_anterior", 0L)
        val atraso = if (prog > 0) ((agora - prog) / 1000).coerceAtLeast(0) else -1
        val n = pr.getInt("executados", 0) + 1
        pr.edit()
            .putInt("executados", n)
            .putLong("ultima_execucao", agora)
            .putLong("ultimo_atraso_s", atraso)
            .putLong("soma_atraso_s", pr.getLong("soma_atraso_s", 0) + atraso.coerceAtLeast(0))
            .putLong("max_atraso_s", maxOf(pr.getLong("max_atraso_s", 0), atraso))
            .putString("ultimo_resultado", resultado)
            .apply()
    }

    /** Guarda o horário programado do alarme que está disparando (antes de reagendar o próximo). */
    fun marcarDisparo(ctx: Context) {
        val pr = p(ctx)
        pr.edit().putLong("programado_anterior", pr.getLong("programado_para", 0L)).apply()
    }

    fun diag(ctx: Context): JSONObject {
        val pr = p(ctx)
        val n = pr.getInt("executados", 0)
        return JSONObject()
            .put("agendados", pr.getInt("agendados", 0))
            .put("executados", n)
            .put("atraso_medio_s", if (n > 0) pr.getLong("soma_atraso_s", 0) / n else JSONObject.NULL)
            .put("atraso_max_s", pr.getLong("max_atraso_s", 0))
            .put("ultimo_atraso_s", pr.getLong("ultimo_atraso_s", -1))
            .put("falhas_agendamento", pr.getInt("falhas_agendamento", 0))
            .put("ultimo_resultado", pr.getString("ultimo_resultado", null) ?: JSONObject.NULL)
    }

    /**
     * Decisão do receiver (separada para teste): com serviço → vigiar; sem serviço e medição automática
     * ligada → tentar religar; medição desligada → parar a vigia.
     */
    enum class Acao { VIGIAR, RELIGAR_SERVICO, PARAR }
    fun decidir(servicoVivo: Boolean, automaticoAtivo: Boolean): Acao = when {
        !automaticoAtivo -> Acao.PARAR
        servicoVivo -> Acao.VIGIAR
        else -> Acao.RELIGAR_SERVICO
    }
}

class VigiaReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val app = ctx.applicationContext
        VigiaAlarme.marcarDisparo(app)
        val acao = VigiaAlarme.decidir(ColetaService.instancia != null && ColetaService.rodando, Automatico.ativo(app))
        // reagenda primeiro: nenhum caminho abaixo pode deixar a vigia morrer (exceto medição desligada)
        if (acao != VigiaAlarme.Acao.PARAR) VigiaAlarme.agendar(app) else VigiaAlarme.cancelar(app)
        val resultado = when (acao) {
            VigiaAlarme.Acao.VIGIAR -> runCatching { ColetaService.instancia?.vigiarPorAlarme(); "vigiou" }.getOrElse { "falha_vigiar" }
            VigiaAlarme.Acao.RELIGAR_SERVICO ->
                // processo encerrado (ou serviço caiu): tenta subir de novo; o Android pode bloquear
                if (Automatico.garantir(app)) "servico_religado" else { Automatico.avisoParado(app, true); "servico_bloqueado" }
            VigiaAlarme.Acao.PARAR -> "medicao_desligada"
        }
        VigiaAlarme.registrarExecucao(app, resultado)
    }
}
