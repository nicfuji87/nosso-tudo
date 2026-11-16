package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.em
import androidx.wear.compose.material3.LocalTextStyle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.Text
import kotlin.math.cos
import kotlin.math.sin

/** Paleta do design "Saúde NT — Galaxy Watch" (canvas Orbital). */
object Cor {
    val Fundo = Color(0xFF000000)
    val Disco = Color(0xFF0D110F)
    val DiscoBorda = Color(0xFF1C221E)
    val Chip = Color(0xFF1C1F1E)
    val Divisor = Color(0xFF232A26)
    val Texto = Color(0xFFF7F6F2)
    val TextoSec = Color(0xFFB4B9B4)
    val TextoTerc = Color(0xFF8E948F)
    val Acao = Color(0xFF8FDE95)
    val AcaoTexto = Color(0xFF0E2A14)
    val Salvia = Color(0xFF8FA993)
    val Coracao = Color(0xFFFF6B7D)
    val CoracaoClaro = Color(0xFFFF8E9B)
    val Vfc = Color(0xFFB08CFF)
    val VfcClaro = Color(0xFFC8B2FF)
    val Sono = Color(0xFF8EA2FF)
    val Prontidao = Color(0xFF7FE08A)
    val ProntidaoClaro = Color(0xFF9EE8A6)
    val Respira = Color(0xFF45E3EA)
    val Ecg = Color(0xFFFF4F5E)
    val Habito = Color(0xFFF2C14B)
    val Registro = Color(0xFFB5C9B8)
    val Lab = Color(0xFFB4B9B4)
}

/**
 * O design foi feito em 480×480 px, o tamanho exato da tela do Watch 6 (44 mm).
 * [d] converte "px do design" em Dp proporcional à tela; [s] em tamanho de fonte.
 */
class Escala(private val u: Dp, private val densidade: Density) {
    fun d(n: Number): Dp = u * n.toFloat()
    fun s(n: Number): TextUnit = with(densidade) { (u * n.toFloat()).toSp() }
    fun px(n: Number): Float = with(densidade) { (u * n.toFloat()).toPx() }
}

/** Tela redonda preta com escala do design. */
@Composable
fun Redondo(conteudo: @Composable BoxScope.(Escala) -> Unit) {
    // Altura de linha relativa ao tamanho da fonte (em): a do tema é fixa e não acompanha a escala do design.
    CompositionLocalProvider(LocalTextStyle provides LocalTextStyle.current.copy(lineHeight = 1.3.em)) {
        BoxWithConstraints(Modifier.fillMaxSize().background(Cor.Fundo)) {
            val e = Escala(maxWidth / 480f, LocalDensity.current)
            conteudo(e)
        }
    }
}

/** Ícones de traço (mesmos desenhos do canvas, viewBox 24). */
object Icone {
    private fun traco(nome: String, d: String) = ImageVector.Builder(nome, 24.dp, 24.dp, 24f, 24f)
        .addPath(
            pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.White),
            strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
        ).build()

    val Coracao = traco("coracao", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z")
    val Vfc = traco("vfc", "M3 12h4l2-6 4 12 2-6h6")
    val Raio = traco("raio", "M13 2 4 14h7l-1 8 9-12h-7z")
    val Lua = traco("lua", "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")
    val Vento = traco("vento", "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8")
    val Ecg = traco("ecg", "M2 12h5l2-4 3 9 3-12 2 7h5")
    val Checkin = traco("checkin", "M9 3h6v3H9zM7 5H5v16h14V5h-2M9 14l2 2 4-4")
    val Cafe = traco("cafe", "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3")
    val Lista = traco("lista", "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01")
    val Frasco = traco("frasco", "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9")
    val Taca = traco("taca", "M8 3h8l-1 6a3 3 0 0 1-6 0zM12 12v8M8 21h8")
    val Pilula = traco("pilula", "M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM8.5 8.5l7 7")
    val Gota = traco("gota", "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z")
    val Play = traco("play", "M8 5v14l11-7z")
    val Parar = traco("parar", "M7 7h10v10H7z")
}

@Composable
fun IconeTraco(icone: ImageVector, cor: Color, tamanho: Dp) =
    Icon(icone, contentDescription = null, tint = cor, modifier = Modifier.size(tamanho))

/** Título de tela: ícone + nome, no topo. */
@Composable
fun Titulo(e: Escala, texto: String, icone: ImageVector, cor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconeTraco(icone, cor, e.d(18))
        Spacer(Modifier.width(e.d(7)))
        Text(texto, color = Cor.Texto, fontSize = e.s(16), fontWeight = FontWeight.Medium)
    }
}

const val SEM_VALOR = "—"

/** Número grande + unidade (ex.: "72 bpm"). */
@Composable
fun Numero(e: Escala, valor: String, unidade: String = "", tamanho: Int = 88, corUnidade: Color = Color(0xFFD8DBD7)) {
    Row(verticalAlignment = Alignment.Bottom) {
        if (valor == SEM_VALOR) {
            // sem leitura: traço discreto, não um bloco branco
            Text("– –", color = Cor.TextoTerc, fontSize = e.s(tamanho * 0.6f), fontWeight = FontWeight.Light,
                modifier = Modifier.padding(bottom = e.d(tamanho * 0.12f)))
        } else {
            Text(valor, color = Cor.Texto, fontSize = e.s(tamanho), fontWeight = FontWeight.Bold, letterSpacing = e.s(-tamanho * 0.03f))
        }
        if (unidade.isNotEmpty()) {
            Spacer(Modifier.width(e.d(5)))
            Text(unidade, color = corUnidade, fontSize = e.s(20), modifier = Modifier.padding(bottom = e.d(tamanho * 0.14f)))
        }
    }
}

/** Etiqueta arredondada (mín/máx, sinal %, variação). */
@Composable
fun Chip(e: Escala, texto: String, fundo: Color = Cor.Chip, cor: Color = Cor.Texto, negrito: Boolean = false) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(fundo).padding(horizontal = e.d(14), vertical = e.d(6))) {
        Text(texto, color = cor, fontSize = e.s(13), fontWeight = if (negrito) FontWeight.SemiBold else FontWeight.Normal)
    }
}

/** Botão pílula. */
@Composable
fun Pilula(
    e: Escala,
    texto: String,
    onClick: () -> Unit,
    fundo: Color = Cor.Acao,
    cor: Color = Cor.AcaoTexto,
    icone: ImageVector? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.clip(RoundedCornerShape(50)).background(fundo).clickable(onClick = onClick)
            .padding(horizontal = e.d(26), vertical = e.d(12)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icone != null) { IconeTraco(icone, cor, e.d(15)); Spacer(Modifier.width(e.d(8))) }
        Text(texto, color = cor, fontSize = e.s(15), fontWeight = FontWeight.Bold)
    }
}

// ---------------------------------------------------------------- desenho de borda (bezel)

/** Arco na borda da tela; ângulos em graus, sentido horário a partir das 3h (como no SVG do design). */
fun DrawScope.arcoBorda(e: Escala, raio: Number, espessura: Number, cor: Color, inicio: Float, varredura: Float, ponta: StrokeCap = StrokeCap.Round) {
    val r = e.px(raio)
    val c = Offset(size.width / 2, size.height / 2)
    drawArc(
        cor, inicio, varredura, useCenter = false,
        topLeft = Offset(c.x - r, c.y - r), size = Size(2 * r, 2 * r),
        style = Stroke(e.px(espessura), cap = ponta),
    )
}

/** Ponto sobre a borda num ângulo (marcador do valor atual). */
fun DrawScope.pontoBorda(e: Escala, raio: Number, angulo: Float, raioPonto: Number, cor: Color, borda: Color) {
    val r = e.px(raio)
    val rad = Math.toRadians(angulo.toDouble())
    val p = Offset(size.width / 2 + r * cos(rad).toFloat(), size.height / 2 + r * sin(rad).toFloat())
    drawCircle(borda, e.px(raioPonto) + e.px(4), p)
    drawCircle(cor, e.px(raioPonto), p)
}

/** Gráfico de linha com degradê (sparkline). */
@Composable
fun GraficoLinha(valores: List<Float>, cor: Color, modifier: Modifier, preencher: Boolean = true, espessura: Dp = 2.5.dp) {
    Canvas(modifier) {
        if (valores.size < 2) return@Canvas
        val min = valores.min()
        val faixa = (valores.max() - min).takeIf { it > 0f } ?: 1f
        val dx = size.width / (valores.size - 1)
        fun y(v: Float) = size.height - (v - min) / faixa * size.height * 0.8f - size.height * 0.1f
        val linha = Path().apply {
            moveTo(0f, y(valores[0]))
            valores.forEachIndexed { i, v -> if (i > 0) lineTo(i * dx, y(v)) }
        }
        if (preencher) {
            val area = Path().apply { addPath(linha); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
            drawPath(area, Brush.verticalGradient(listOf(cor.copy(alpha = 0.35f), Color.Transparent)))
        }
        drawPath(linha, cor, style = Stroke(espessura.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}
