package app.nossotudo.saude.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.ValueKey
import org.json.JSONObject
import java.time.LocalTime

/**
 * Temperatura da pele SÓ À NOITE (22h–8h): de dia o pulso mede mais o ambiente que você.
 * Agrega em janelas de 5 min (média) e põe na fila de envio. Fora do pulso não conta.
 */
object TemperaturaNoturna {
    private const val JANELA_MS = 5 * 60_000L

    fun eNoite(agora: LocalTime = LocalTime.now()): Boolean = agora.hour >= 22 || agora.hour < 8

    private var janela = -1L
    private var soma = 0.0
    private var somaAmb = 0.0
    private var nAmb = 0
    private var n = 0
    /** Último lote do sensor de temperatura (qualquer status): se parar de chegar à noite, o serviço religa. */
    @Volatile var ultimoLoteMs = 0L
    /** Janelas de 5 min postas na fila desde o último reinício do app (diagnóstico). */
    @Volatile var janelasEnfileiradas = 0

    @Synchronized
    fun registrarLote(ctx: Context, lote: List<DataPoint>) {
        if (lote.isNotEmpty()) ultimoLoteMs = System.currentTimeMillis()
        for (dp in lote) {
            val status = runCatching { dp.getValue(ValueKey.SkinTemperatureSet.STATUS) }.getOrNull() ?: -1
            val pele = runCatching { dp.getValue(ValueKey.SkinTemperatureSet.OBJECT_TEMPERATURE) }.getOrNull() ?: continue
            if (status != 0 || pele !in 20f..45f || EstadoSaude.noPulso == false) continue
            val j = dp.timestamp / JANELA_MS
            if (j != janela) { fechar(ctx); janela = j }
            soma += pele; n++
            runCatching { dp.getValue(ValueKey.SkinTemperatureSet.AMBIENT_TEMPERATURE) }.getOrNull()
                ?.takeIf { it in -20f..60f }?.let { somaAmb += it; nAmb++ }
        }
    }

    /** Fecha a janela aberta e põe na fila. */
    @Synchronized
    fun fechar(ctx: Context) {
        if (janela >= 0 && n > 0) {
            runCatching {
                Sync.enfileirarTemp(ctx, janela * JANELA_MS, (soma / n).toFloat(), if (nAmb > 0) (somaAmb / nAmb).toFloat() else null, n)
                janelasEnfileiradas++
            }
        }
        janela = -1; soma = 0.0; somaAmb = 0.0; nAmb = 0; n = 0
    }
}

/**
 * Radar de Saúde (radar-v1, calculado no servidor): o envio devolve o nível da noite de hoje.
 * Só "estresse" vira aviso no relógio — uma vez por noite, entre 7h e 21h, nunca de madrugada.
 * O aviso não é diagnóstico: diz o que saiu do normal e as causas possíveis, e pergunta como você está.
 */
object AvisoRadar {
    private const val CANAL = "radar"
    private const val NOTIF_ID = 7
    const val ACAO_RESPOSTA = "app.nossotudo.saude.wear.RESPOSTA_RADAR"
    const val EXTRA_VALOR = "valor"

    fun processar(ctx: Context, radar: JSONObject?) {
        radar ?: return
        // guarda o nível da noite para o atalho do mostrador
        ctx.applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE).edit()
            .putString("radar_nivel", radar.optString("nivel")).putString("radar_noite", radar.optString("noite")).apply()
        val noite = radar.optString("noite")
        if (radar.optString("nivel") != "estresse" || noite.isEmpty()) return
        val hora = LocalTime.now().hour
        if (hora < 7 || hora >= 21) return
        val p = ctx.applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)
        if (p.getString("radar_avisado", null) == noite) return
        p.edit().putString("radar_avisado", noite).apply()
        avisar(ctx, radar.optString("resumo"))
    }

    private fun avisar(ctx: Context, resumo: String) {
        val app = ctx.applicationContext
        val nm = app.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANAL, "Radar de Saúde", NotificationManager.IMPORTANCE_DEFAULT))
        val texto = "Seu corpo está fora do normal" + (if (resumo.isNotEmpty()) ": $resumo." else ".") +
            " Pode ser treino forte, pouco sono, álcool, estresse ou o começo de uma infecção. Que tal um dia mais leve?"
        fun resposta(rotulo: String, valor: String, codigo: Int) = Notification.Action.Builder(
            null, rotulo,
            PendingIntent.getBroadcast(
                app, codigo, Intent(app, RespostaRadarReceiver::class.java).setAction(ACAO_RESPOSTA).putExtra(EXTRA_VALOR, valor),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        ).build()
        val n = Notification.Builder(app, CANAL)
            .setContentTitle("Radar de Saúde")
            .setContentText(texto)
            .setStyle(Notification.BigTextStyle().bigText(texto))
            .setSmallIcon(R.drawable.ic_stat_nt)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(app, 0, Intent(app, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
            .addAction(resposta("Estou bem", "bem", 71))
            .addAction(resposta("Cansado", "cansado", 72))
            .addAction(resposta("Com sintomas", "sintomas", 73))
            .build()
        runCatching { nm.notify(NOTIF_ID, n) }
    }

    fun limpar(ctx: Context) = ctx.applicationContext.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
}

/** "Como você está?" respondido direto na notificação do radar → vira check-in no diário. */
class RespostaRadarReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != AvisoRadar.ACAO_RESPOSTA) return
        val valor = intent.getStringExtra(AvisoRadar.EXTRA_VALOR) ?: return
        EstadoSaude.iniciar(ctx)
        Registros.adicionar(ctx, "checkin", valor)
        AvisoRadar.limpar(ctx)
    }
}
