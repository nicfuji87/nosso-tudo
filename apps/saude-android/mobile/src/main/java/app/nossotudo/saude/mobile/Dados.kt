package app.nossotudo.saude.mobile

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

// ---------------------------------------------------------------- formatação (pt-BR)
val PT_BR: Locale = Locale.forLanguageTag("pt-BR")
val ZONA: ZoneId = ZoneId.systemDefault()
private val fmtHora = DateTimeFormatter.ofPattern("HH:mm").withZone(ZONA)
private val fmtDia = DateTimeFormatter.ofPattern("EEE dd/MM", PT_BR).withZone(ZONA)
private val fmtDiaLongo = DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", PT_BR)
private val fmtCab = DateTimeFormatter.ofPattern("EEEE, d MMM", PT_BR)

fun instante(iso: String?): Instant? =
    iso?.takeIf { it.isNotEmpty() && it != "null" }?.let { runCatching { Instant.parse(it.replace("+00:00", "Z")) }.getOrNull() }
fun horaDe(iso: String?) = instante(iso)?.let { fmtHora.format(it) } ?: "—"
fun diaDe(iso: String?) = instante(iso)?.let { fmtDia.format(it).replace(".", "") } ?: "—"
fun diaLongo(d: LocalDate = LocalDate.now()) = d.format(fmtDiaLongo).replaceFirstChar { it.uppercase() }
fun cabecalhoDia(d: LocalDate) = d.format(fmtCab).replace(".", "").uppercase(PT_BR)
fun dataLocal(s: String?): LocalDate? = s?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
fun diaLocalDe(iso: String?): LocalDate? = instante(iso)?.atZone(ZONA)?.toLocalDate()
fun noiteCurta(s: String?): String = dataLocal(s)?.let { d ->
    when (d) {
        LocalDate.now() -> "hoje"
        LocalDate.now().minusDays(1) -> "ontem"
        else -> d.format(DateTimeFormatter.ofPattern("EEE dd/MM", PT_BR)).replace(".", "")
    }
} ?: "—"

fun fmt(v: Double, casas: Int = 0): String = String.format(PT_BR, "%.${casas}f", v)
fun milhar(v: Double): String = String.format(PT_BR, "%,d", v.toLong())
fun valorFmt(v: Double, m: Metrica): String = if (m == Metrica.PASSOS) milhar(v) else if (m == Metrica.SONO) horasMin(v * 60) else fmt(v, m.casas)
/** 7,3 h → "7h18". */
fun horasMin(min: Double): String = "${(min / 60).toInt()}h${String.format(Locale.US, "%02d", (min % 60).roundToInt().coerceAtMost(59))}"
fun relativo(ms: Long): String {
    val d = (System.currentTimeMillis() - ms) / 60_000
    return when {
        d < 1 -> "agora"
        d < 60 -> "há $d min"
        d < 24 * 60 -> "há ${d / 60} h"
        else -> "há ${d / 1440} d"
    }
}
fun sinalDelta(x: Double, casas: Int = 0): String = (if (x > 0) "+" else if (x < 0) "−" else "") + fmt(abs(x), casas)

// ---------------------------------------------------------------- JSON
fun JSONObject.num(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null
fun JSONObject.txt(k: String): String? = if (has(k) && !isNull(k)) optString(k).takeIf { it.isNotEmpty() && it != "null" } else null
fun JSONArray?.objetos(): List<JSONObject> = this?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
fun JSONArray?.ints(): List<Int> = this?.let { a -> (0 until a.length()).map { a.optInt(it) } }.orEmpty()
fun JSONArray?.textos(): List<String> = this?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()

// ---------------------------------------------------------------- API (Edge Function saude-relogio)
/** Chama a Edge Function com a ação pedida. Devolve o JSON (ok=true) ou null. */
suspend fun chamar(ctx: Context, acao: String, extra: JSONObject.() -> Unit = {}): JSONObject? = withContext(Dispatchers.IO) {
    runCatching {
        val (http, r) = Conexao.post(JSONObject().put("acao", acao).put("segredo", Conexao.segredo(ctx)).apply(extra))
        if (http in 200..299 && r.optBoolean("ok")) r else null
    }.getOrNull()
}

/**
 * Último resultado de cada consulta guardado no aparelho: o app abre mostrando os dados anteriores
 * (com o horário) enquanto busca os novos — sem tela piscando e funcionando sem internet.
 */
object CacheLocal {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("cache_api", Context.MODE_PRIVATE)
    fun ler(ctx: Context, chave: String): Pair<JSONObject, Long>? {
        val s = p(ctx).getString(chave, null) ?: return null
        val em = p(ctx).getLong("$chave@", 0)
        return runCatching { JSONObject(s) to em }.getOrNull()
    }
    fun gravar(ctx: Context, chave: String, j: JSONObject) {
        p(ctx).edit().putString(chave, j.toString()).putLong("$chave@", System.currentTimeMillis()).apply()
    }
}

class Consulta(val dados: JSONObject?, val carregando: Boolean, val falhou: Boolean, val em: Long)

class EstadoConsulta(inicial: Consulta) {
    var valor by mutableStateOf(inicial)
    var gatilho by mutableIntStateOf(0)
    fun recarregar() { gatilho++ }
}

/** Consulta com cache local: mostra o último resultado na hora e atualiza em seguida. */
@Composable
fun rememberConsulta(acao: String, vararg params: Pair<String, Any?>): EstadoConsulta {
    val ctx = LocalContext.current
    val chave = acao + params.joinToString("") { "|${it.first}=${it.second}" }
    val estado = remember(chave) {
        val c = CacheLocal.ler(ctx, chave)
        EstadoConsulta(Consulta(c?.first, true, false, c?.second ?: 0))
    }
    LaunchedEffect(chave, estado.gatilho) {
        estado.valor = Consulta(estado.valor.dados, true, false, estado.valor.em)
        val r = chamar(ctx, acao) { params.forEach { (k, v) -> if (v != null) put(k, v) } }
        if (r != null) {
            CacheLocal.gravar(ctx, chave, r)
            estado.valor = Consulta(r, false, false, System.currentTimeMillis())
        } else {
            estado.valor = Consulta(estado.valor.dados, false, true, estado.valor.em)
        }
    }
    return estado
}

/** Variação contra a referência pessoal, já com o significado (bom / atenção / neutro). */
data class Variacao(val texto: String, val estado: Estado)
enum class Estado { BOM, ATENCAO, ALERTA, NEUTRO, SEM_DADO }

fun variacao(valor: Double?, normal: Double?, m: Metrica, limiar: Double = if (m.casas == 0) 1.0 else 0.15): Variacao? {
    if (valor == null || normal == null) return null
    val d = valor - normal
    if (abs(d) < limiar) return Variacao("no seu normal", Estado.NEUTRO)
    val ruim = m.subirRuim?.let { (d > 0) == it } ?: false
    val forte = when (m) {
        Metrica.FC -> abs(d) >= 5
        Metrica.VFC -> abs(d) >= normal * 0.25
        Metrica.PELE -> abs(d) >= 0.8
        else -> false
    }
    val unidade = if (m.unidade.isEmpty() || m == Metrica.SONO) "" else " ${m.unidade}"
    val txt = if (m == Metrica.SONO) "${sinalDelta(d * 60, 0)} min vs. meta" else "${sinalDelta(d, m.casas)}$unidade vs. seu normal"
    return Variacao(txt, if (!ruim) Estado.BOM else if (forte) Estado.ALERTA else Estado.ATENCAO)
}
