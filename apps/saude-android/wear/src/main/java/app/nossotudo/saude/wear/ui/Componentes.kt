package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.TransformingLazyColumnScope
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.EdgeButtonSize
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.ButtonDefaults

/**
 * Saúde NT — Performance Wear. Fundo preto, verde suave para ações e UMA cor por métrica (as mesmas do celular).
 * Tudo em dp/sp nativos: respeita a densidade da tela e o tamanho de fonte escolhido no relógio
 * (antes, a classe Escala reduzia um desenho de 480 px à largura da tela e deixava textos com ~6 sp).
 */
object Cor {
    val Fundo = Color(0xFF000000)
    val Superficie = Color(0xFF161B1F)
    val SuperficieBaixa = Color(0xFF101417)
    val Elevada = Color(0xFF20272C)
    val Texto = Color(0xFFF5F7F8)
    val TextoSec = Color(0xFFA3AEB6)
    val TextoTerc = Color(0xFF7D8992)
    val Acao = Color(0xFF8EE5A1)
    val AcaoTexto = Color(0xFF0B2414)
    val AcaoContainer = Color(0xFF1C3524)
    val Atencao = Color(0xFFF1BD60)
    val Alerta = Color(0xFFF16C80)
    val Coracao = Color(0xFFF38C7C)
    val Vfc = Color(0xFFB39AF7)
    val Sono = Color(0xFF91A8FF)
    val Respira = Color(0xFF5CD2E6)
    val Ecg = Color(0xFFF16C80)
    val Habito = Color(0xFFF1BD60)
    val Registro = Color(0xFFB5C9B8)
    val Lab = Color(0xFFA3AEB6)
}

/** Tema do relógio (Material 3 Expressive para Wear OS) com a paleta do Saúde NT. */
@Composable
fun SaudeWearTema(conteudo: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ColorScheme(
            primary = Cor.Acao, onPrimary = Cor.AcaoTexto, primaryContainer = Cor.AcaoContainer, onPrimaryContainer = Cor.Acao,
            primaryDim = Cor.Acao.copy(alpha = 0.8f),
            secondary = Cor.Vfc, onSecondary = Color(0xFF1E1240),
            background = Cor.Fundo, onBackground = Cor.Texto,
            surfaceContainerLow = Cor.SuperficieBaixa, surfaceContainer = Cor.Superficie, surfaceContainerHigh = Cor.Elevada,
            onSurface = Cor.Texto, onSurfaceVariant = Cor.TextoSec, outline = Color(0xFF3A444B), outlineVariant = Color(0xFF263038),
            error = Cor.Alerta, onError = Color(0xFF3A0A12),
        ),
        content = conteudo,
    )
}

/** Números grandes com algarismos de largura fixa (não "pulam" quando o valor muda). */
fun TextStyle.tabular() = copy(fontFeatureSettings = "tnum")

/**
 * Esqueleto de tela em lista (Material 3 Expressive): rolagem com a coroa, itens que se transformam nas bordas
 * da tela redonda, relógio no topo e um botão de borda opcional na base.
 */
@Composable
fun TelaLista(
    botaoBorda: (@Composable () -> Unit)? = null,
    conteudo: TransformingLazyColumnScope.() -> Unit,
) {
    val estado = rememberTransformingLazyColumnState()
    if (botaoBorda != null) {
        ScreenScaffold(scrollState = estado, edgeButton = { botaoBorda() }) { padding ->
            TransformingLazyColumn(state = estado, contentPadding = padding, modifier = Modifier.background(Cor.Fundo), content = conteudo)
        }
    } else {
        ScreenScaffold(scrollState = estado) { padding ->
            TransformingLazyColumn(state = estado, contentPadding = padding, modifier = Modifier.background(Cor.Fundo), content = conteudo)
        }
    }
}

/** Botão de borda (ação principal da tela). */
@Composable
fun BotaoBorda(texto: String, cor: Color = Cor.Acao, corTexto: Color = Cor.AcaoTexto, onClick: () -> Unit) {
    EdgeButton(
        onClick = onClick,
        buttonSize = EdgeButtonSize.Medium,
        colors = ButtonDefaults.buttonColors(containerColor = cor, contentColor = corTexto),
    ) { Text(texto, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

@Composable
fun Cabecalho(texto: String, cor: Color = Cor.TextoSec) {
    ListHeader { Text(texto, color = cor, textAlign = TextAlign.Center) }
}

/** Texto explicativo curto, centralizado (cabe na tela redonda). */
@Composable
fun Nota(texto: String, cor: Color = Cor.TextoSec, modifier: Modifier = Modifier) {
    Text(
        texto, color = cor, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth().padding(horizontal = 8.dp),
    )
}

/** Valor grande + unidade + rótulo (ex.: 64 bpm · agora). */
@Composable
fun ValorGrande(valor: String, unidade: String, rotulo: String?, corRotulo: Color = Cor.TextoSec, cor: Color = Cor.Texto) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(valor, color = cor, style = MaterialTheme.typography.displayLarge.tabular(), maxLines = 1)
            if (unidade.isNotEmpty() && valor != SEM_VALOR) {
                Spacer(Modifier.width(4.dp))
                Text(unidade, color = Cor.TextoSec, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 6.dp))
            }
        }
        if (rotulo != null) Text(rotulo, color = corRotulo, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center)
    }
}

/** Etiqueta de estado (ex.: "provisória", "de ontem", "sensor desconectado"). */
@Composable
fun Etiqueta(texto: String, cor: Color) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(cor.copy(alpha = 0.16f)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(cor))
        Spacer(Modifier.width(6.dp))
        Text(texto, color = cor, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

/** Linha "rótulo …… valor" para telas de detalhe. */
@Composable
fun LinhaInfo(rotulo: String, valor: String, cor: Color = Cor.Texto) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(rotulo, color = Cor.TextoSec, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(valor, color = cor, style = MaterialTheme.typography.bodySmall.tabular(), textAlign = TextAlign.End)
    }
}

const val SEM_VALOR = "—"

/** Ícones de traço (viewBox 24). */
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
    val Mais = traco("mais", "M5 12h.01M12 12h.01M19 12h.01")
    val Lapis = traco("lapis", "M4 20h4L19 9l-4-4L4 16zM14 6l4 4")
    val Cronometro = traco("cronometro", "M12 8v5l3 2M9 2h6M12 4a9 9 0 1 0 0.01 0")
    val Alerta = traco("alerta", "M12 3 2 20h20zM12 10v4M12 17h.01")
    val Elo = traco("elo", "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1")
    val Sinal = traco("sinal", "M4 20v-4M9 20v-8M14 20v-12M19 20V4")
    val EmPe = traco("empe", "M12 4a2 2 0 1 0 .01 0M12 8v7M9 21l3-6 3 6M8 11h8")
}

@Composable
fun IconeTraco(icone: ImageVector, cor: Color, tamanho: Dp = 24.dp) =
    Icon(icone, contentDescription = null, tint = cor, modifier = Modifier.size(tamanho))

/** Gráfico de linha curto (sparkline) com degradê. */
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

/** Cor e texto de cada nível de prontidão do servidor (mesmos rótulos do celular). */
fun corNivel(nivel: String?) = when (nivel) { "alto" -> Cor.Acao; "moderado" -> Cor.Atencao; "baixo" -> Cor.Alerta; else -> Cor.TextoSec }
fun tituloNivel(nivel: String?) = when (nivel) {
    "alto" -> "Dentro do habitual"
    "moderado" -> "Um pouco abaixo"
    "baixo" -> "Abaixo do habitual"
    else -> "Sem nota hoje"
}
