package app.nossotudo.saude.mobile

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.min

fun corDoEstado(e: Estado): Color = when (e) {
    Estado.BOM -> T.Primaria
    Estado.ATENCAO -> T.Atencao
    Estado.ALERTA -> T.Alerta
    Estado.NEUTRO, Estado.SEM_DADO -> T.TextoSec
}

// ---------------------------------------------------------------- superfícies e textos

/** Cartão base: superfície discreta, borda fina, raio 20 dp. Com onClick vira porta de entrada para detalhes. */
@Composable
fun Cartao(
    modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, descricao: String? = null,
    padding: Dp = T.e4, conteudo: @Composable ColumnScope.() -> Unit,
) {
    var m = modifier.fillMaxWidth().clip(T.Forma).background(T.Superficie).border(1.dp, T.Borda, T.Forma)
    if (onClick != null) m = m.clickable(role = Role.Button, onClick = onClick)
    if (descricao != null) m = m.semantics(mergeDescendants = true) { contentDescription = descricao }
    Column(m.padding(padding), verticalArrangement = Arrangement.spacedBy(T.e2), content = conteudo)
}

@Composable
fun CabecalhoCartao(titulo: String, icone: ImageVector? = null, cor: Color = T.TextoSec, direita: (@Composable RowScope.() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        if (icone != null) {
            Icon(icone, null, tint = cor, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(T.e2))
        }
        Text(titulo, style = T.TituloCartao, color = T.Texto, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        direita?.invoke(this)
    }
}

@Composable
fun TituloSecao(texto: String, acao: String? = null, aoTocar: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = T.e4, bottom = T.e1), verticalAlignment = Alignment.CenterVertically) {
        Text(texto, style = T.TituloCartao.copy(fontSize = 18.sp), color = T.Texto, modifier = Modifier.weight(1f).semantics { heading() })
        if (acao != null && aoTocar != null) LinkAcao(acao, aoTocar)
    }
}

@Composable
fun LinkAcao(texto: String, aoTocar: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).clickable(role = Role.Button, onClick = aoTocar).defaultMinSize(minHeight = 40.dp).padding(horizontal = T.e2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(texto, style = T.Descricao.copy(fontWeight = FontWeight.SemiBold), color = T.Primaria)
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = T.Primaria, modifier = Modifier.size(18.dp))
    }
}

@Composable
fun TextoSec(texto: String, cor: Color = T.TextoSec, modifier: Modifier = Modifier, estilo: TextStyle = T.Descricao) =
    Text(texto, style = estilo, color = cor, modifier = modifier)

/** Etiqueta curta com significado (ex.: "provisório", "dados parciais", "Samsung Health"). */
@Composable
fun Etiqueta(texto: String, cor: Color = T.TextoSec, icone: ImageVector? = null) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(cor.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icone != null) { Icon(icone, null, tint = cor, modifier = Modifier.size(12.dp)); Spacer(Modifier.width(4.dp)) }
        Text(texto, style = T.Legenda.copy(fontWeight = FontWeight.Medium), color = cor, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Qualidade do dado: só aparece quando há algo a dizer (parcial, suspeito, provisório, sem leitura). */
@Composable
fun IndicadorQualidade(texto: String, estado: Estado = Estado.ATENCAO) {
    Etiqueta(texto, corDoEstado(estado), if (estado == Estado.ALERTA) Icons.Rounded.ErrorOutline else Icons.Rounded.Info)
}

@Composable
fun Divisor() = Box(Modifier.fillMaxWidth().height(1.dp).background(T.Borda))

// ---------------------------------------------------------------- botões e seleção

@Composable
fun BotaoPrimario(texto: String, modifier: Modifier = Modifier, habilitado: Boolean = true, cor: Color = T.Primaria, icone: ImageVector? = null, aoTocar: () -> Unit) {
    Row(
        modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).background(if (habilitado) cor else T.Elevada)
            .clickable(enabled = habilitado, role = Role.Button, onClick = aoTocar).padding(horizontal = T.e5),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icone != null) { Icon(icone, null, tint = if (habilitado) T.NaPrimaria else T.TextoSec, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(T.e2)) }
        Text(texto, style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = if (habilitado) T.NaPrimaria else T.TextoSec)
    }
}

@Composable
fun BotaoSecundario(texto: String, modifier: Modifier = Modifier, habilitado: Boolean = true, cor: Color = T.Texto, icone: ImageVector? = null, aoTocar: () -> Unit) {
    Row(
        modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, T.Borda, RoundedCornerShape(14.dp))
            .clickable(enabled = habilitado, role = Role.Button, onClick = aoTocar).padding(horizontal = T.e4),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icone != null) { Icon(icone, null, tint = if (habilitado) cor else T.TextoTer, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(T.e2)) }
        Text(texto, style = T.Corpo.copy(fontWeight = FontWeight.Medium), color = if (habilitado) cor else T.TextoTer)
    }
}

/** Controle segmentado (7D | 30D | 90D). */
@Composable
fun Segmentado(opcoes: List<String>, selecionado: Int, modifier: Modifier = Modifier, aoEscolher: (Int) -> Unit) {
    Row(modifier.clip(RoundedCornerShape(12.dp)).background(T.Superficie).border(1.dp, T.Borda, RoundedCornerShape(12.dp)).padding(3.dp)) {
        opcoes.forEachIndexed { i, o ->
            val sel = i == selecionado
            Box(
                Modifier.weight(1f).heightIn(min = 40.dp).clip(RoundedCornerShape(9.dp)).background(if (sel) T.Elevada else Color.Transparent)
                    .clickable(role = Role.Tab) { aoEscolher(i) },
                contentAlignment = Alignment.Center,
            ) { Text(o, style = T.Descricao.copy(fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal), color = if (sel) T.Texto else T.TextoSec) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Chips(opcoes: List<String>, escolha: String?, corDe: (String) -> Color = { T.Primaria }, aoEscolher: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(T.e2), verticalArrangement = Arrangement.spacedBy(T.e2)) {
        opcoes.forEach { o ->
            val sel = escolha == o
            val c = corDe(o)
            Box(
                Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(50)).background(if (sel) c.copy(alpha = 0.18f) else T.Elevada)
                    .border(1.dp, if (sel) c else Color.Transparent, RoundedCornerShape(50))
                    .clickable(role = Role.RadioButton) { aoEscolher(o) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text(o, style = T.Descricao.copy(fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal), color = if (sel) c else T.Texto) }
        }
    }
}

// ---------------------------------------------------------------- prontidão

/** Anel de prontidão 0–100 (arco de 270°), com animação discreta. */
@Composable
fun AnelProntidao(score: Int?, cor: Color, tamanho: Dp = 132.dp) {
    val alvo = (score ?: 0) / 100f
    val anim by animateFloatAsState(alvo, tween(500), label = "anel")
    Box(Modifier.size(tamanho), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(tamanho)) {
            val esp = 11.dp.toPx()
            val lado = min(size.width, size.height) - esp
            val tl = Offset((size.width - lado) / 2, (size.height - lado) / 2)
            drawArc(T.Elevada, 135f, 270f, false, tl, Size(lado, lado), style = Stroke(esp, cap = StrokeCap.Round))
            if (score != null) drawArc(cor, 135f, 270f * anim, false, tl, Size(lado, lado), style = Stroke(esp, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(score?.toString() ?: "—", style = T.Destaque, color = T.Texto)
            Text("de 100", style = T.Legenda, color = T.TextoSec)
        }
    }
}

// ---------------------------------------------------------------- métricas

/** Cartão de indicador: nome, valor, variação contra o seu normal e minigráfico de 7 dias. */
@Composable
fun CartaoMetrica(
    m: Metrica, valor: String, variacao: Variacao?, serie: List<Double?>, modifier: Modifier = Modifier,
    rodape: String? = null, qualidade: Pair<String, Estado>? = null, normal: Double? = null, onClick: (() -> Unit)? = null,
) {
    Cartao(modifier, onClick = onClick, padding = 14.dp, descricao = "${m.curto}: $valor ${m.unidade}. ${qualidade?.first ?: variacao?.texto ?: rodape ?: ""}") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(m.icone, null, tint = m.cor, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(m.curto, style = T.Descricao, color = T.TextoSec, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(valor, style = T.Valor, color = T.Texto, maxLines = 1)
            if (m.unidade.isNotEmpty() && m != Metrica.SONO && valor != "—") Text(" ${m.unidade}", style = T.Descricao, color = T.TextoSec, modifier = Modifier.padding(bottom = 3.dp))
        }
        when {
            qualidade != null -> IndicadorQualidade(qualidade.first, qualidade.second)
            variacao != null -> Text(variacao.texto, style = T.Legenda, color = corDoEstado(variacao.estado), maxLines = 1, overflow = TextOverflow.Ellipsis)
            rodape != null -> Text(rodape, style = T.Legenda, color = T.TextoSec, maxLines = 1, overflow = TextOverflow.Ellipsis)
            else -> Text(" ", style = T.Legenda)
        }
        MiniGrafico(serie, m.cor, normal = normal, barras = m == Metrica.PASSOS)
    }
}

/** Minigráfico sem interação (7 pontos). Nulos viram lacunas; nunca zero. */
@Composable
fun MiniGrafico(valores: List<Double?>, cor: Color, normal: Double? = null, barras: Boolean = false, altura: Dp = 30.dp) {
    val reais = valores.filterNotNull()
    Canvas(Modifier.fillMaxWidth().height(altura)) {
        if (reais.isEmpty()) {
            drawLine(T.Borda, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
            return@Canvas
        }
        val todos = reais + listOfNotNull(normal)
        var lo = todos.min(); var hi = todos.max()
        if (barras) lo = 0.0
        val span = max(hi - lo, max(1.0, kotlin.math.abs(hi) * 0.06))
        hi = lo + span
        val n = valores.size
        fun y(v: Double) = (size.height - 3f) - ((v - lo) / (hi - lo)).toFloat() * (size.height - 6f)
        val passo = if (n > 1) size.width / (n - 1) else size.width
        normal?.let { drawLine(T.TextoTer, Offset(0f, y(it)), Offset(size.width, y(it)), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 6f))) }
        if (barras) {
            val w = size.width / n * 0.62f
            valores.forEachIndexed { i, v ->
                if (v != null) drawRoundRect(cor.copy(alpha = if (i == n - 1) 1f else 0.55f), Offset(i * size.width / n + (size.width / n - w) / 2, y(v)), Size(w, size.height - y(v)), CornerRadius(3f))
            }
            return@Canvas
        }
        var p: Path? = null
        valores.forEachIndexed { i, v ->
            if (v == null) { p?.let { drawPath(it, cor, style = Stroke(3.5f, cap = StrokeCap.Round)) }; p = null; return@forEachIndexed }
            val o = Offset(i * passo, y(v))
            p = (p ?: Path().also { it.moveTo(o.x, o.y) }).also { it.lineTo(o.x, o.y) }
        }
        p?.let { drawPath(it, cor, style = Stroke(3.5f, cap = StrokeCap.Round)) }
        valores.indexOfLast { it != null }.takeIf { it >= 0 }?.let { drawCircle(cor, 5f, Offset(it * passo, y(valores[it]!!))) }
    }
}

// ---------------------------------------------------------------- gráficos interativos

data class Ponto(val rotulo: String, val valor: Double?, val suspeito: Boolean = false)

/**
 * Gráfico de tendência com toque: tocar/deslizar mostra data e valor exatos.
 * Faixa habitual (sombreada), linha do seu normal (tracejada) e média móvel (linha fina).
 * Escala com vão mínimo para não exagerar pequenas mudanças. Pontos suspeitos aparecem vazados.
 */
@Composable
fun GraficoTendencia(
    pontos: List<Ponto>, cor: Color, formatar: (Double) -> String, modifier: Modifier = Modifier,
    normal: Double? = null, faixa: Pair<Double, Double>? = null, mediaMovel: List<Double?>? = null,
    vaoMinimo: Double = 1.0, barras: Boolean = false, altura: Dp = 170.dp, zeroNaBase: Boolean = barras,
    aoSelecionar: ((Int?) -> Unit)? = null, formatarEixo: ((Double) -> String)? = null,
) {
    val medidor = rememberTextMeasurer()
    var sel by remember(pontos) { mutableStateOf<Int?>(null) }
    val reais = pontos.mapNotNull { it.valor }
    val desc = if (reais.isEmpty()) "Sem dados no período" else
        "Gráfico de ${pontos.size} pontos; último ${pontos.lastOrNull { it.valor != null }?.let { formatar(it.valor!!) }}; mínimo ${formatar(reais.min())}; máximo ${formatar(reais.max())}"
    Box(modifier.fillMaxWidth().height(altura).semantics { contentDescription = desc }) {
        if (reais.isEmpty() || pontos.isEmpty()) {
            Text("Sem dados no período", style = T.Descricao, color = T.TextoSec, modifier = Modifier.align(Alignment.Center))
            return@Box
        }
        Canvas(
            Modifier.fillMaxWidth().height(altura)
                .pointerInput(pontos) {
                    detectTapGestures { o ->
                        val n = pontos.size
                        val w = size.width - 34.dp.toPx()
                        val i = if (barras) (o.x / (w / n)).toInt() else ((o.x / w) * (n - 1) + 0.5f).toInt()
                        val novo = i.coerceIn(0, n - 1)
                        sel = if (sel == novo) null else novo
                        aoSelecionar?.invoke(sel)
                    }
                }
                .pointerInput(pontos) {
                    detectHorizontalDragGestures { ch, _ ->
                        val n = pontos.size
                        val w = size.width - 34.dp.toPx()
                        val x = ch.position.x
                        val i = if (barras) (x / (w / n)).toInt() else ((x / w) * (n - 1) + 0.5f).toInt()
                        sel = i.coerceIn(0, n - 1); aoSelecionar?.invoke(sel)
                    }
                },
        ) {
            val topo = 30.dp.toPx()     // espaço do balão
            val base = 18.dp.toPx()     // rótulos do eixo X
            val dir = 34.dp.toPx()      // rótulos do eixo Y
            val w = size.width - dir
            val h = size.height - topo - base
            val todos = reais + listOfNotNull(normal) + listOfNotNull(faixa?.first, faixa?.second)
            var lo = if (zeroNaBase) 0.0 else todos.min()
            var hi = todos.max()
            if (hi - lo < vaoMinimo) { val c = (hi + lo) / 2; lo = if (zeroNaBase) 0.0 else c - vaoMinimo / 2; hi = lo + vaoMinimo }
            val pad = (hi - lo) * 0.08
            if (!zeroNaBase) lo -= pad
            hi += pad
            val n = pontos.size
            fun x(i: Int) = if (barras) (i + 0.5f) * w / n else if (n > 1) i * w / (n - 1) else w / 2
            fun y(v: Double) = topo + h - ((v - lo) / (hi - lo)).toFloat() * h
            val estiloEixo = TextStyle(fontSize = 10.sp, color = T.TextoTer)
            listOf(lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1).forEach { v ->
                drawLine(T.Borda, Offset(0f, y(v)), Offset(w, y(v)), 1f)
                drawText(medidor, (formatarEixo ?: formatar)(v), Offset(w + 6.dp.toPx(), y(v) - 7.dp.toPx()), estiloEixo)
            }
            faixa?.let { (a, b) -> drawRect(cor.copy(alpha = 0.10f), Offset(0f, y(b)), Size(w, y(a) - y(b))) }
            normal?.let { drawLine(T.TextoSec.copy(alpha = 0.7f), Offset(0f, y(it)), Offset(w, y(it)), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))) }
            if (barras) {
                val bw = w / n * 0.62f
                pontos.forEachIndexed { i, p ->
                    val v = p.valor ?: return@forEachIndexed
                    val alfa = if (sel == null || sel == i) 1f else 0.4f
                    drawRoundRect(cor.copy(alpha = alfa), Offset(x(i) - bw / 2, y(v)), Size(bw, y(if (zeroNaBase) 0.0 else lo) - y(v)), CornerRadius(4f))
                }
            } else {
                mediaMovel?.let { mm ->
                    var p: Path? = null
                    mm.forEachIndexed { i, v ->
                        if (v == null) { p?.let { drawPath(it, cor.copy(alpha = 0.45f), style = Stroke(2f)) }; p = null; return@forEachIndexed }
                        p = (p ?: Path().also { it.moveTo(x(i), y(v)) }).also { it.lineTo(x(i), y(v)) }
                    }
                    p?.let { drawPath(it, cor.copy(alpha = 0.45f), style = Stroke(2f)) }
                }
                var p: Path? = null
                pontos.forEachIndexed { i, pt ->
                    val v = pt.valor
                    if (v == null) { p?.let { drawPath(it, cor, style = Stroke(4f, cap = StrokeCap.Round)) }; p = null; return@forEachIndexed }
                    p = (p ?: Path().also { it.moveTo(x(i), y(v)) }).also { it.lineTo(x(i), y(v)) }
                }
                p?.let { drawPath(it, cor, style = Stroke(4f, cap = StrokeCap.Round)) }
                pontos.forEachIndexed { i, pt ->
                    val v = pt.valor ?: return@forEachIndexed
                    if (pt.suspeito) { drawCircle(T.Fundo, 6f, Offset(x(i), y(v))); drawCircle(T.Atencao, 6f, Offset(x(i), y(v)), style = Stroke(2.5f)) }
                    else if (n <= 31) drawCircle(cor, 3.5f, Offset(x(i), y(v)))
                }
            }
            listOf(0, n / 2, n - 1).distinct().forEach { i ->
                val r = pontos[i].rotulo
                val l = medidor.measure(r, estiloEixo).size.width
                drawText(medidor, r, Offset((x(i) - l / 2f).coerceIn(0f, max(0f, w - l)), size.height - base + 4.dp.toPx()), estiloEixo)
            }
            sel?.let { i ->
                val pt = pontos[i]
                drawLine(T.TextoSec, Offset(x(i), topo), Offset(x(i), topo + h), 1.5f)
                pt.valor?.let { v -> drawCircle(T.Texto, 7f, Offset(x(i), y(v))); drawCircle(cor, 4.5f, Offset(x(i), y(v))) }
                val texto = "${pt.rotulo} · ${pt.valor?.let(formatar) ?: "sem dado"}${if (pt.suspeito) " · suspeito" else ""}"
                val lay = medidor.measure(texto, TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = T.Texto))
                val bx = (x(i) - lay.size.width / 2f - 8.dp.toPx()).coerceIn(0f, max(0f, size.width - lay.size.width - 16.dp.toPx()))
                drawRoundRect(T.Elevada, Offset(bx, 0f), Size(lay.size.width + 16.dp.toPx(), 24.dp.toPx()), CornerRadius(8.dp.toPx()))
                drawText(lay, topLeft = Offset(bx + 8.dp.toPx(), 4.dp.toPx()))
            }
        }
    }
}

/** Média móvel simples (ignora nulos; precisa de ao menos metade da janela). */
fun mediaMovel(v: List<Double?>, janela: Int = 7): List<Double?> = v.indices.map { i ->
    val w = v.subList(max(0, i - janela + 1), i + 1).filterNotNull()
    if (w.size * 2 >= min(janela, i + 1)) w.average() else null
}

/** Faixa habitual (percentis 20–80 dos dados válidos), só com 7+ pontos. */
fun faixaHabitual(v: List<Double?>): Pair<Double, Double>? {
    val s = v.filterNotNull().sorted()
    if (s.size < 7) return null
    return s[(s.size * 0.2).toInt()] to s[((s.size - 1) * 0.8).toInt()]
}

// ---------------------------------------------------------------- treino

/** Barra das 5 zonas de FC (proporção do tempo em cada uma). */
@Composable
fun BarraZonas(zonas: List<Int>, altura: Dp = 10.dp) {
    val total = zonas.sum().takeIf { it > 0 }
    Row(Modifier.fillMaxWidth().height(altura).clip(RoundedCornerShape(altura / 2)).background(T.Elevada)) {
        if (total != null) zonas.forEachIndexed { i, v -> if (v > 0) Box(Modifier.weight(v.toFloat() / total).fillMaxHeight().background(T.Zonas[i])) }
    }
}

/** Zonas detalhadas: barra por zona com tempo e percentual. */
@Composable
fun ZonasDetalhadas(zonas: List<Int>, limites: List<Int>) {
    val total = zonas.sum().takeIf { it > 0 } ?: run { TextoSec("Sem batimento medido neste período."); return }
    val nomes = listOf("Z1 recuperação", "Z2 base", "Z3 moderado", "Z4 limiar", "Z5 máximo")
    val faixas = if (limites.size == 4) listOf("< ${limites[0]}", "${limites[0]}–${limites[1] - 1}", "${limites[1]}–${limites[2] - 1}", "${limites[2]}–${limites[3] - 1}", "≥ ${limites[3]}") else List(5) { "" }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        zonas.forEachIndexed { i, v ->
            val f = v.toFloat() / total
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(T.Zonas[i]))
                Spacer(Modifier.width(T.e2))
                Column(Modifier.width(112.dp)) {
                    Text(nomes[i], style = T.Descricao, color = T.Texto, maxLines = 1)
                    Text("${faixas[i]} bpm", style = T.Legenda, color = T.TextoTer)
                }
                Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(T.Elevada)) {
                    Box(Modifier.fillMaxWidth(f).fillMaxHeight().background(T.Zonas[i]))
                }
                Text("${horasMin(v.toDouble())} · ${(f * 100).toInt()}%", style = T.Legenda, color = T.TextoSec, textAlign = TextAlign.End, modifier = Modifier.width(80.dp))
            }
        }
    }
}

// ---------------------------------------------------------------- insights, estados e status

/** Observação: título objetivo, evidência e ação. */
@Composable
fun CartaoInsight(titulo: String, evidencia: String, estado: Estado, acao: String?, aoTocar: (() -> Unit)?) {
    val cor = corDoEstado(estado)
    Row(
        Modifier.fillMaxWidth().clip(T.FormaPeq).background(T.Elevada).let { if (aoTocar != null) it.clickable(role = Role.Button, onClick = aoTocar) else it }
            .padding(T.e3).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(cor))
        Spacer(Modifier.width(T.e3))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titulo, style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto)
            Text(evidencia, style = T.Descricao, color = T.TextoSec)
            if (acao != null) Text(acao, style = T.Descricao.copy(fontWeight = FontWeight.SemiBold), color = T.Primaria, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

/** Estado vazio / sem histórico / falha — nunca tela em branco nem zeros inventados. */
@Composable
fun EstadoVazio(icone: ImageVector, titulo: String, texto: String, acao: String? = null, aoTocar: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = T.e6, horizontal = T.e4), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(T.e2)) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(T.Elevada), contentAlignment = Alignment.Center) { Icon(icone, null, tint = T.TextoSec) }
        Text(titulo, style = T.TituloCartao, color = T.Texto, textAlign = TextAlign.Center)
        Text(texto, style = T.Descricao, color = T.TextoSec, textAlign = TextAlign.Center)
        if (acao != null && aoTocar != null) BotaoSecundario(acao, aoTocar = aoTocar)
    }
}

/** Faixa discreta quando os dados mostrados vêm do cache (sem conexão). */
@Composable
fun AvisoCache(c: Consulta) {
    if (!c.falhou || c.dados == null) return
    Row(
        Modifier.fillMaxWidth().clip(T.FormaPeq).background(T.Atencao.copy(alpha = 0.10f)).padding(horizontal = T.e3, vertical = T.e2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.CloudOff, null, tint = T.Atencao, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(T.e2))
        Text("Sem conexão — mostrando dados de ${if (c.em > 0) relativo(c.em) else "antes"}.", style = T.Legenda, color = T.Atencao)
    }
}

/** Indicador de sincronização do topo da tela Hoje. */
@Composable
fun StatusSync(texto: String, estado: Estado, carregando: Boolean, aoTocar: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(T.Superficie).border(1.dp, T.Borda, RoundedCornerShape(50))
            .clickable(role = Role.Button, onClick = aoTocar).heightIn(min = 36.dp).padding(horizontal = 10.dp)
            .semantics(mergeDescendants = true) { contentDescription = "Sincronização: $texto. Toque para detalhes." },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val cor = when { carregando -> T.TextoSec; estado == Estado.NEUTRO -> T.Primaria; else -> corDoEstado(estado) }
        Icon(if (estado == Estado.ATENCAO || estado == Estado.ALERTA) Icons.Rounded.WarningAmber else Icons.Rounded.Sync, null, tint = cor, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(if (carregando) "Atualizando…" else texto, style = T.Legenda, color = T.TextoSec)
    }
}

@Composable
fun LinhaInfo(rotulo: String, valor: String, cor: Color = T.Texto, aoTocar: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().let { if (aoTocar != null) it.clickable(onClick = aoTocar) else it }.heightIn(min = 40.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(rotulo, style = T.Corpo, color = T.TextoSec, modifier = Modifier.weight(1f))
        Text(valor, style = T.Corpo.copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"), color = cor, textAlign = TextAlign.End)
        if (aoTocar != null) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = T.TextoTer, modifier = Modifier.size(18.dp))
    }
}

/** Valor pequeno com rótulo embaixo (ex.: "787 · carga"). */
@Composable
fun Estatistica(valor: String, rotulo: String, modifier: Modifier = Modifier, cor: Color = T.Texto) {
    Column(modifier.semantics(mergeDescendants = true) {}) {
        Text(valor, style = T.ValorPeq, color = cor, maxLines = 1)
        Text(rotulo, style = T.Legenda, color = T.TextoSec, maxLines = 2)
    }
}
