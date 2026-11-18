package app.nossotudo.saude.wear

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

/** Nível de bateria (0–100) e se está carregando, lidos do último broadcast do sistema. */
object Bateria {
    private fun status(ctx: Context): Intent? =
        ctx.applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

    fun nivel(ctx: Context): Int? = status(ctx)?.let {
        val l = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val e = it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        if (l >= 0 && e > 0) l * 100 / e else null
    }

    fun carregando(ctx: Context): Boolean = (status(ctx)?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0

    // Leituras do último ~1 h (uma por minuto, pelo ColetaService). Transições como "tirei do pulso" são
    // confirmadas com atraso (histerese) e datadas para trás: a bateria tem que ser a DAQUELE instante,
    // não a de agora — senão aparecia "fora do pulso 88%" e, 1 min depois, "carregando 76%".
    private val historico = ArrayDeque<Pair<Long, Int>>()

    @Synchronized
    fun registrar(ts: Long, nivel: Int) {
        historico.addLast(ts to nivel)
        while (historico.size > 90) historico.removeFirst()
    }

    /** Nível no instante [ts] (leitura mais próxima até 3 min antes ou depois); senão, o atual. */
    @Synchronized
    fun nivelEm(ctx: Context, ts: Long): Int? =
        historico.minByOrNull { kotlin.math.abs(it.first - ts) }?.takeIf { kotlin.math.abs(it.first - ts) <= 180_000L }?.second
            ?: nivel(ctx)
}
