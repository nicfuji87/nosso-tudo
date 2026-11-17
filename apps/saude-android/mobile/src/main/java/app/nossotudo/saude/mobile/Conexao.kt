package app.nossotudo.saude.mobile

import android.content.Context
import android.os.Build
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

/**
 * Conexão do celular com o Nosso Tudo — mesmo protocolo do relógio (Edge Function `saude-relogio`):
 * um SEGREDO nasce no aparelho; o servidor guarda só o sha256. Pareamento por código de 6 letras.
 */
object Conexao {
    private const val ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("conexao", Context.MODE_PRIVATE)

    @Synchronized
    fun segredo(ctx: Context): String {
        val p = prefs(ctx)
        p.getString("segredo", null)?.let { return it }
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val s = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        p.edit().putString("segredo", s).apply()
        return s
    }

    fun vinculado(ctx: Context) = prefs(ctx).getBoolean("vinculado", false)

    fun post(corpo: JSONObject): Pair<Int, JSONObject> {
        val c = URL(BuildConfig.SAUDE_URL).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 60_000
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

    /** Gera e anuncia um código de pareamento. Chamar fora da main thread. */
    fun anunciar(ctx: Context): String {
        val rnd = SecureRandom()
        repeat(5) {
            val codigo = (1..6).map { ALFABETO[rnd.nextInt(ALFABETO.length)] }.joinToString("")
            val (http, r) = post(
                JSONObject().put("acao", "anunciar").put("segredo", segredo(ctx)).put("codigo", codigo)
                    .put("modelo", "${Build.MANUFACTURER} ${Build.MODEL}".trim()),
            )
            if (http in 200..299) return codigo
            if (r.optString("erro") != "codigo_em_uso") error(r.optString("erro", "HTTP $http"))
        }
        error("não foi possível gerar um código")
    }

    /** Pergunta ao servidor se já foi vinculado. Chamar fora da main thread. */
    fun verificar(ctx: Context): Boolean {
        val (http, r) = post(JSONObject().put("acao", "status").put("segredo", segredo(ctx)))
        if (http !in 200..299) return vinculado(ctx)
        val ok = r.optBoolean("vinculado", false)
        prefs(ctx).edit().putBoolean("vinculado", ok).putString("nome", r.optString("nome").ifEmpty { null }).apply()
        return ok
    }
}
