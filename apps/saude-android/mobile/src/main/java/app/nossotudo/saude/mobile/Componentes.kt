package app.nossotudo.saude.mobile

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Paleta e peças de interface das abas Treinos e Saúde (mesmo visual da aba Hoje). */
object Cor {
    val Fundo = Color(0xFF0B0E0C)
    val Cartao = Color(0xFF151A17)
    val Borda = Color(0xFF232A26)
    val Texto = Color(0xFFF7F6F2)
    val TextoSec = Color(0xFFB4B9B4)
    val Verde = Color(0xFF8FDE95)
    val VerdeEscuro = Color(0xFF0E2A14)
    val Ambar = Color(0xFFF2C14B)
    val Coracao = Color(0xFFFF6B7D)
    val Roxo = Color(0xFFB08CFF)
    val Azul = Color(0xFF8EA2FF)
    val Laranja = Color(0xFFF08A3C)
    val Ciano = Color(0xFF45E3EA)

    /** Zonas de FC: Z1 azul · Z2 verde · Z3 amarelo · Z4 laranja · Z5 vermelho. */
    val Zonas = listOf(Color(0xFF7FB7D6), Color(0xFF8FDE95), Color(0xFFF2C14B), Color(0xFFF08A3C), Color(0xFFE5536A))
}

val PT_BR: Locale = Locale.forLanguageTag("pt-BR")
private val zona = ZoneId.systemDefault()
private val fmtHora = DateTimeFormatter.ofPattern("HH:mm").withZone(zona)
private val fmtDia = DateTimeFormatter.ofPattern("EEE dd/MM", PT_BR).withZone(zona)

fun instante(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it.replace("+00:00", "Z")) }.getOrNull() }
fun horaDe(iso: String?) = instante(iso)?.let { fmtHora.format(it) } ?: "—"
fun diaDe(iso: String?) = instante(iso)?.let { fmtDia.format(it).replace(".", "") } ?: "—"
fun JSONObject.num(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null
fun JSONArray?.objetos(): List<JSONObject> = this?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
fun fmt(v: Double, casas: Int = 0): String = String.format(PT_BR, "%.${casas}f", v)
fun milhar(v: Double): String = String.format(PT_BR, "%,d", v.toLong())

/** Chama a Edge Function `saude-relogio` com a ação pedida. Devolve o JSON (com ok=true) ou null. */
suspend fun chamar(ctx: Context, acao: String, extra: JSONObject.() -> Unit = {}): JSONObject? = withContext(Dispatchers.IO) {
    runCatching {
        val (http, r) = Conexao.post(JSONObject().put("acao", acao).put("segredo", Conexao.segredo(ctx)).apply(extra))
        if (http in 200..299 && r.optBoolean("ok")) r else null
    }.getOrNull()
}

@Composable
fun CartaoNT(modifier: Modifier = Modifier, titulo: String? = null, cor: Color = Cor.TextoSec, conteudo: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Cor.Cartao).border(1.dp, Cor.Borda, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        titulo?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(cor))
                Spacer(Modifier.width(6.dp))
                Text(it, color = Cor.TextoSec, fontSize = 12.sp)
            }
        }
        conteudo()
    }
}

@Composable
fun Titulo(texto: String) = Text(texto, color = Cor.Texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))

@Composable
fun Pequeno(texto: String, cor: Color = Cor.TextoSec) = Text(texto, color = cor, fontSize = 12.sp, lineHeight = 16.sp)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Chips(opcoes: List<String>, escolha: String?, cor: Color = Cor.Laranja, aoEscolher: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        opcoes.forEach { m ->
            val sel = escolha == m
            Text(
                m, color = if (sel) Color.White else Cor.Texto, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (sel) cor else Cor.Borda).clickable { aoEscolher(m) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            )
        }
    }
}

/** Barra empilhada das 5 zonas de FC (minutos em cada uma). */
@Composable
fun BarraZonas(zonas: List<Int>, altura: Int = 10) {
    val total = zonas.sum().takeIf { it > 0 } ?: return
    Row(Modifier.fillMaxWidth().height(altura.dp).clip(RoundedCornerShape(5.dp))) {
        zonas.forEachIndexed { i, v -> if (v > 0) Box(Modifier.weight(v.toFloat() / total).fillMaxHeight().background(Cor.Zonas[i])) }
    }
}

@Composable
fun LegendaZonas(zonas: List<Int>, limites: List<Int>) {
    val nomes = listOf("Z1", "Z2", "Z3", "Z4", "Z5")
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        zonas.forEachIndexed { i, v ->
            if (v > 0) Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(Cor.Zonas[i]))
                Text(" ${nomes[i]} ${v}m", color = Cor.TextoSec, fontSize = 11.sp)
            }
        }
    }
    if (limites.size == 4) Pequeno("Z2 ${limites[0]}–${limites[1] - 1} · Z3 ${limites[1]}–${limites[2] - 1} · Z4 ${limites[2]}–${limites[3] - 1} · Z5 ≥ ${limites[3]} bpm")
}

/** Linha de tendência simples (nulos viram lacunas). `normal` desenha a faixa do seu normal tracejada. */
@Composable
fun Sparkline(valores: List<Double?>, cor: Color, modifier: Modifier = Modifier.fillMaxWidth().height(48.dp), normal: Double? = null, barras: Boolean = false) {
    val reais = valores.filterNotNull()
    if (reais.size < 2 && !(barras && reais.isNotEmpty())) return
    val minV = (reais + listOfNotNull(normal)).min()
    val maxV = (reais + listOfNotNull(normal)).max()
    val faixa = (maxV - minV).takeIf { it > 0 } ?: 1.0
    Canvas(modifier) {
        val n = valores.size
        val passo = if (n > 1) size.width / (n - 1) else size.width
        fun y(v: Double) = (size.height - 4f) - ((v - (if (barras) 0.0 else minV)) / (if (barras) maxV.coerceAtLeast(1.0) else faixa)).toFloat() * (size.height - 8f)
        normal?.let {
            val yy = y(it)
            drawLine(Cor.TextoSec.copy(alpha = 0.5f), Offset(0f, yy), Offset(size.width, yy), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)))
        }
        if (barras) {
            val w = (size.width / n) * 0.7f
            valores.forEachIndexed { i, v -> if (v != null) drawRect(cor, Offset(i * size.width / n, y(v)), androidx.compose.ui.geometry.Size(w, size.height - y(v))) }
            return@Canvas
        }
        var caminho: Path? = null
        valores.forEachIndexed { i, v ->
            if (v == null) { caminho?.let { drawPath(it, cor, style = Stroke(4f, cap = StrokeCap.Round)) }; caminho = null; return@forEachIndexed }
            val p = Offset(i * passo, y(v))
            caminho = (caminho ?: Path().also { it.moveTo(p.x, p.y) }).also { it.lineTo(p.x, p.y) }
        }
        caminho?.let { drawPath(it, cor, style = Stroke(4f, cap = StrokeCap.Round)) }
        valores.indexOfLast { it != null }.takeIf { it >= 0 }?.let { i -> drawCircle(cor, 6f, Offset(i * passo, y(valores[i]!!))) }
    }
}

/** Barra de progresso simples (0..1). */
@Composable
fun Progresso(fracao: Float, cor: Color) {
    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Cor.Borda)) {
        Box(Modifier.fillMaxWidth(fracao.coerceIn(0f, 1f)).fillMaxHeight().background(cor))
    }
}
