package app.nossotudo.saude.wear

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Prontidão do SERVIDOR (prontidao-v2) — a mesma que o celular mostra. O relógio não calcula mais uma
 * prontidão própria: antes ele exibia uma nota só da VFC (e "Treino forte"), diferente da do celular para o
 * mesmo dia. A nota chega na resposta de cada envio e fica guardada com o horário em que foi recebida.
 */
object ProntidaoServidor {
    data class Fator(val texto: String, val efeito: Int)

    data class Leitura(
        val dia: String?, val score: Int?, val nivel: String?, val confianca: String?, val provisoria: Boolean,
        val motivoConfianca: String?, val fatores: List<Fator>, val recebidaEm: Long, val algoritmo: String?,
        val sonoHoras: Double?, val sonoEstado: String?, val sonoMotivo: String?, val deitar: String?, val acordar: String?,
    ) {
        val deHoje: Boolean get() = dia == LocalDate.now().toString()
    }

    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private fun JSONObject.txt(k: String) = optString(k).takeIf { it.isNotEmpty() && it != "null" }

    /** Guarda a prontidão recebida do servidor (chamado pelo envio). Mantém as chaves antigas usadas pelo Tile. */
    fun salvar(ctx: Context, j: JSONObject, agora: Long = System.currentTimeMillis()) {
        val sono = j.optJSONObject("sono") ?: JSONObject()
        p(ctx).edit()
            .putInt("pront_score", if (j.isNull("score")) -1 else j.optInt("score", -1))
            .putString("pront_nivel", j.txt("nivel"))
            .putString("pront_dia", j.txt("dia"))
            .putString("pront_deitar", sono.txt("deitar"))
            .putString("pront_acordar", sono.txt("acordar"))
            .putString("pront_confianca", j.txt("confianca"))
            .putBoolean("pront_provisoria", j.optBoolean("referencia_provisoria", j.optBoolean("calibrando", true)))
            .putString("pront_confianca_motivo", j.txt("confianca_motivo"))
            .putString("pront_fatores", (j.optJSONArray("fatores") ?: JSONArray()).toString())
            .putString("pront_algoritmo", j.txt("algoritmo"))
            .putString("sono_horas", if (sono.isNull("horas")) null else sono.optDouble("horas").takeIf { !it.isNaN() }?.toString())
            .putString("sono_estado", sono.txt("estado"))
            .putString("sono_motivo", sono.txt("motivo"))
            .putLong("pront_recebida_em", agora)
            .apply()
    }

    fun ler(ctx: Context): Leitura {
        val pr = p(ctx)
        val fatores = runCatching {
            val a = JSONArray(pr.getString("pront_fatores", "[]"))
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { Fator(it.optString("texto"), it.optInt("efeito")) }
        }.getOrDefault(emptyList())
        return Leitura(
            dia = pr.getString("pront_dia", null),
            score = pr.getInt("pront_score", -1).takeIf { it >= 0 },
            nivel = pr.getString("pront_nivel", null),
            confianca = pr.getString("pront_confianca", null),
            provisoria = pr.getBoolean("pront_provisoria", true),
            motivoConfianca = pr.getString("pront_confianca_motivo", null),
            fatores = fatores,
            recebidaEm = pr.getLong("pront_recebida_em", 0L),
            algoritmo = pr.getString("pront_algoritmo", null),
            sonoHoras = pr.getString("sono_horas", null)?.toDoubleOrNull(),
            sonoEstado = pr.getString("sono_estado", null),
            sonoMotivo = pr.getString("sono_motivo", null),
            deitar = pr.getString("pront_deitar", null),
            acordar = pr.getString("pront_acordar", null),
        )
    }
}
