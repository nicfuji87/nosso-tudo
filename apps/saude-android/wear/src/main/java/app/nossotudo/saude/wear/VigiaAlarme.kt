package app.nossotudo.saude.wear

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock

/**
 * Vigia do sensor por alarme (v0.9.6). O Handler do serviço não roda com o relógio em repouso profundo
 * se o sensor parar de mandar dados — e era aí que a medição ficava parada 30–50 min à noite.
 * Um alarme "permitido em repouso" acorda o relógio a cada ~10 min (o Wear OS espaça para ≥ 9 min
 * em Doze) e confere se o batimento está chegando; se não, religa o sensor.
 */
object VigiaAlarme {
    private const val INTERVALO = 10 * 60_000L

    private fun pendente(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 77, Intent(ctx, VigiaReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun agendar(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + INTERVALO, pendente(ctx))
        }
    }

    fun cancelar(ctx: Context) {
        runCatching { ctx.getSystemService(AlarmManager::class.java)?.cancel(pendente(ctx)) }
    }
}

class VigiaReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val s = ColetaService.instancia ?: return
        s.vigiarPorAlarme()
        VigiaAlarme.agendar(ctx.applicationContext)
    }
}
