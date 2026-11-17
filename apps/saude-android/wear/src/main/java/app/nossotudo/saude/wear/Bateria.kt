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
}
