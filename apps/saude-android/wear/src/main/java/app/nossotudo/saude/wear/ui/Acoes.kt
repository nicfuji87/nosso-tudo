package app.nossotudo.saude.wear.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.EcgSessao
import app.nossotudo.saude.wear.Registros
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// ================================================================ Respiração 4-7-8

private data class Fase(val nome: String, val segundos: Int, val escala: Float)

private val FASES = listOf(Fase("Inspire", 4, 1f), Fase("Segure", 7, 1f), Fase("Expire", 8, 0.72f))
private const val CICLOS = 4

@Composable
fun TelaRespiracao() {
    val ctx = LocalContext.current
    val haptico = LocalHapticFeedback.current
    var rodando by remember { mutableStateOf(false) }
    var concluiu by remember { mutableStateOf(false) }
    var fase by remember { mutableIntStateOf(-1) }
    var ciclo by remember { mutableIntStateOf(0) }
    var restante by remember { mutableIntStateOf(0) }
    val progresso = remember { Animatable(0f) }

    LaunchedEffect(rodando) {
        if (!rodando) { fase = -1; return@LaunchedEffect }
        concluiu = false
        for (c in 1..CICLOS) {
            ciclo = c
            for (i in FASES.indices) {
                fase = i
                haptico.performHapticFeedback(HapticFeedbackType.LongPress)
                coroutineScope {
                    launch { progresso.snapTo(0f); progresso.animateTo(1f, tween(FASES[i].segundos * 1000, easing = LinearEasing)) }
                    for (s in FASES[i].segundos downTo 1) { restante = s; delay(1000) }
                }
            }
        }
        fase = -1; rodando = false; concluiu = true
        Registros.adicionar(ctx, "respiracao", "4-7-8 · $CICLOS ciclos")
    }

    val alvo = if (fase < 0) 0.85f else FASES[fase].escala
    val escala by animateFloatAsState(alvo, tween(if (fase < 0) 400 else FASES[fase].segundos * 1000, easing = LinearEasing), label = "respira")

    TelaLista(botaoBorda = {
        BotaoBorda(if (rodando) "Parar" else if (concluiu) "De novo" else "Iniciar", Cor.Respira, Color(0xFF00262C)) { rodando = !rodando }
    }) {
        item { Cabecalho("Respiração 4-7-8", Cor.Respira) }
        item {
            Box(Modifier.fillMaxWidth().height(108.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(108.dp)) {
                    val r = size.minDimension / 2
                    val borda = 3.dp.toPx()
                    drawCircle(Color(0xFF0E2224), r - borda, style = Stroke(4.dp.toPx()))
                    if (fase >= 0) drawArc(
                        Cor.Respira, -90f, 360f * progresso.value, false,
                        topLeft = Offset(borda, borda), size = Size(size.width - 2 * borda, size.height - 2 * borda),
                        style = Stroke(4.dp.toPx(), cap = StrokeCap.Round),
                    )
                    drawCircle(Cor.Respira.copy(alpha = 0.14f), (r - 12.dp.toPx()) * escala)
                    drawCircle(Cor.Respira, (r - 12.dp.toPx()) * escala, style = Stroke(2.dp.toPx()))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    when {
                        fase >= 0 -> {
                            Text(FASES[fase].nome, color = Cor.Texto, style = MaterialTheme.typography.titleMedium)
                            Text("$restante", color = Cor.Texto, style = MaterialTheme.typography.numeralSmall.tabular())
                        }
                        concluiu -> Text("Pronto ✓", color = Cor.Texto, style = MaterialTheme.typography.titleMedium)
                        else -> Text("~1 min", color = Cor.TextoSec, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                repeat(CICLOS) { k ->
                    Box(
                        Modifier.padding(horizontal = 3.dp).width(16.dp).height(5.dp).clip(RoundedCornerShape(50))
                            .background(if (k < ciclo && (rodando || concluiu)) Cor.Respira else Color(0xFF1B3335)),
                    )
                }
            }
        }
        item { Nota("Inspire 4 s · segure 7 s · expire 8 s. Vibra a cada fase.", Cor.TextoTerc) }
    }
}

// ================================================================ ECG

@Composable
fun TelaEcg() {
    val ctx = LocalContext.current
    val sessao = remember { EcgSessao(ctx) }
    DisposableEffect(Unit) { onDispose { sessao.cancelar() } }
    val estado by sessao.estado.collectAsState()
    val traco by sessao.traco.collectAsState()
    val medindo = estado as? EcgSessao.Estado.Medindo

    TelaLista(botaoBorda = {
        when (estado) {
            is EcgSessao.Estado.Medindo -> BotaoBorda("Parar", Cor.Elevada, Cor.Texto) { sessao.cancelar() }
            is EcgSessao.Estado.Conectando -> BotaoBorda("Aguarde…", Cor.Elevada, Cor.TextoSec) {}
            is EcgSessao.Estado.Concluido, is EcgSessao.Estado.Erro -> BotaoBorda("Medir de novo", Cor.Ecg, Color.White) { sessao.iniciar() }
            else -> BotaoBorda("Iniciar ECG", Cor.Ecg, Color.White) { sessao.iniciar() }
        }
    }) {
        item { Cabecalho("ECG", Cor.Ecg) }
        item {
            val contato = medindo?.contato ?: true
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Etiqueta(if (contato) "dedo no botão superior" else "sem contato · encoste o dedo", if (contato) Cor.Coracao else Cor.Atencao)
            }
        }
        item {
            Canvas(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 14.dp).semantics { contentDescription = "Traçado do ECG" }) {
                val passo = 8.dp.toPx()
                var x = 0f
                while (x <= size.width) { drawLine(Color(0xFF2A1215), Offset(x, 0f), Offset(x, size.height), 1f); x += passo }
                var y = 0f
                while (y <= size.height) { drawLine(Color(0xFF2A1215), Offset(0f, y), Offset(size.width, y), 1f); y += passo }
                val v = traco.takeLast(1000)
                if (v.size > 2) {
                    val mn = v.min(); val mx = v.max(); val faixa = (mx - mn).takeIf { it > 0f } ?: 1f
                    val dx = size.width / (v.size - 1)
                    val p = Path()
                    v.forEachIndexed { i, mv ->
                        val py = size.height * 0.9f - (mv - mn) / faixa * size.height * 0.8f
                        if (i == 0) p.moveTo(0f, py) else p.lineTo(i * dx, py)
                    }
                    drawPath(p, Cor.Ecg, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
        item {
            when (val s = estado) {
                is EcgSessao.Estado.Medindo -> ValorGrande("${s.segundos}", "/ 30 s", null)
                is EcgSessao.Estado.Conectando -> Nota("conectando ao sensor…", Cor.Texto)
                is EcgSessao.Estado.Concluido -> Nota("Salvo · ${s.hz} Hz", Cor.Acao)
                is EcgSessao.Estado.Erro -> Nota(s.msg, Cor.Atencao)
                else -> Nota("Cerca de 30 segundos, braço apoiado e parado.", Cor.TextoSec)
            }
        }
        item { Nota("Não substitui avaliação médica.", Cor.TextoTerc) }
    }
}

// ================================================================ Check-in

private enum class Humor(val rotulo: String, val valor: String, val cor: Color) {
    BEM("Bem", "bem", Color(0xFF8EE5A1)), OK("Ok", "ok", Color(0xFFF1BD60)), MAL("Mal", "mal", Color(0xFFF16C80))
}

@Composable
private fun Rosto(humor: Humor, modifier: Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 24f
        val st = Stroke(1.8f * u, cap = StrokeCap.Round)
        drawCircle(humor.cor, 9f * u, Offset(12f * u, 12f * u), style = st)
        drawCircle(humor.cor, 1.1f * u, Offset(9f * u, 9.5f * u))
        drawCircle(humor.cor, 1.1f * u, Offset(15f * u, 9.5f * u))
        val boca = Path().apply {
            when (humor) {
                Humor.BEM -> { moveTo(8f * u, 14f * u); quadraticTo(12f * u, 18.4f * u, 16f * u, 14f * u) }
                Humor.OK -> { moveTo(8.5f * u, 15f * u); lineTo(15.5f * u, 15f * u) }
                Humor.MAL -> { moveTo(8f * u, 16.5f * u); quadraticTo(12f * u, 12.4f * u, 16f * u, 16.5f * u) }
            }
        }
        drawPath(boca, humor.cor, style = st)
    }
}

/** Check-in em um toque: escolher o humor já registra (sem botão de confirmar). */
@Composable
fun TelaCheckin(voltar: () -> Unit, ir: (String) -> Unit) {
    val ctx = LocalContext.current
    var salvo by remember { mutableStateOf<Humor?>(null) }
    val periodo = when (java.time.LocalTime.now().hour) { in 5..11 -> "manhã"; in 12..17 -> "tarde"; else -> "noite" }
    if (salvo != null) LaunchedEffect(Unit) { delay(1_000); voltar() }

    TelaLista(botaoBorda = { BotaoBorda("Sintoma", Cor.Ecg, Color.White) { ir(Rota.MALESTAR) } }) {
        item { Cabecalho("Check-in · $periodo", Cor.Acao) }
        item {
            Text(
                if (salvo == null) "Como você está?" else "Registrado ✓",
                color = if (salvo == null) Cor.Texto else Cor.Acao, style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
        }
        Humor.entries.forEach { h ->
            item {
                Button(
                    onClick = { if (salvo == null) { Registros.adicionar(ctx, "checkin", h.valor); salvo = h } },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = if (salvo == h) h.cor.copy(alpha = 0.28f) else Cor.Superficie, contentColor = Cor.Texto,
                    ),
                    icon = { Rosto(h, Modifier.size(26.dp)) },
                    label = { Text(h.rotulo) },
                )
            }
        }
    }
}

// ================================================================ Hábitos (toque = +1)

private data class Habito(val nome: String, val icone: ImageVector, val cor: Color)

private val HABITOS = listOf(
    Habito("Café", Icone.Cafe, Color(0xFFF1BD60)),
    Habito("Álcool", Icone.Taca, Color(0xFFF38C9C)),
    Habito("Remédio", Icone.Pilula, Color(0xFFB39AF7)),
    Habito("Água", Icone.Gota, Color(0xFF5CD2E6)),
)

@Composable
fun TelaHabitos() {
    val ctx = LocalContext.current
    val haptico = LocalHapticFeedback.current
    var versao by remember { mutableIntStateOf(0) }
    val contagem = remember(versao) { Registros.hoje(ctx).filter { it.tipo == "habito" }.groupingBy { it.valor }.eachCount() }
    TelaLista {
        item { Cabecalho("Hábitos de hoje", Cor.Habito) }
        item { Nota("Toque para somar +1.", Cor.TextoTerc) }
        HABITOS.forEach { h ->
            item {
                val n = contagem[h.nome] ?: 0
                Button(
                    onClick = {
                        Registros.adicionar(ctx, "habito", h.nome)
                        haptico.performHapticFeedback(HapticFeedbackType.LongPress)
                        versao++
                    },
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${h.nome}, $n hoje, somar um" },
                    colors = ButtonDefaults.filledTonalButtonColors(containerColor = Cor.Superficie, contentColor = Cor.Texto),
                    icon = { IconeTraco(h.icone, h.cor) },
                    secondaryLabel = { Text(if (n == 0) "nenhum hoje" else "×$n hoje", color = Cor.TextoSec) },
                    label = { Text(h.nome) },
                )
            }
        }
    }
}

// ================================================================ Registros (linha do tempo)

private val HHMM_REG = DateTimeFormatter.ofPattern("HH:mm")
private val MESES = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

@Composable
fun TelaRegistros() {
    val ctx = LocalContext.current
    val lista = remember { Registros.listar(ctx, 60) }
    val porDia = remember(lista) { lista.groupBy { Instant.ofEpochMilli(it.ts).atZone(ZoneId.systemDefault()).toLocalDate() } }
    TelaLista {
        item { Cabecalho("Registros", Cor.Registro) }
        if (lista.isEmpty()) item { Nota("Nada registrado ainda.") }
        porDia.forEach { (dia, itens) ->
            item {
                val rotulo = when (dia) {
                    LocalDate.now() -> "Hoje"
                    LocalDate.now().minusDays(1) -> "Ontem"
                    else -> "${dia.dayOfMonth} ${MESES[dia.monthValue - 1]}"
                }
                Text(
                    rotulo, color = Cor.Acao, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
            }
            itens.forEach { r ->
                item {
                    val l = descrever(r)
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Cor.Superficie).padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(l.cor.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                            IconeTraco(l.icone, l.cor, 16.dp)
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(l.titulo, color = Cor.Texto, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                            Text(l.detalhe, color = Cor.TextoSec, style = MaterialTheme.typography.bodyExtraSmall, maxLines = 1)
                        }
                        Text(
                            Instant.ofEpochMilli(r.ts).atZone(ZoneId.systemDefault()).format(HHMM_REG),
                            color = Cor.TextoSec, style = MaterialTheme.typography.labelSmall.tabular(),
                        )
                    }
                }
            }
        }
    }
}

private data class Linha(val icone: ImageVector, val cor: Color, val titulo: String, val detalhe: String)

private fun descrever(r: Registros.Registro): Linha = when (r.tipo) {
    "checkin" -> Linha(Icone.Checkin, Cor.Acao, "Check-in: ${r.valor}", "como você estava")
    "habito" -> {
        val h = HABITOS.firstOrNull { it.nome == r.valor }
        Linha(h?.icone ?: Icone.Cafe, h?.cor ?: Cor.Habito, r.valor, "hábito")
    }
    "ecg" -> Linha(Icone.Ecg, Cor.Ecg, "ECG", r.valor)
    "respiracao" -> Linha(Icone.Vento, Cor.Respira, "Respiração", r.valor)
    "malestar" -> Linha(Icone.Alerta, Cor.Ecg, "Mal-estar", r.valor)
    "ortostatico" -> Linha(Icone.EmPe, Cor.Coracao, "Teste em pé", runCatching {
        val o = org.json.JSONObject(r.valor)
        if (o.has("d") && o.has("m3")) "${o.getInt("m3") - o.getInt("d")} bpm de diferença em pé" else "leitura insuficiente"
    }.getOrDefault(r.valor))
    else -> Linha(Icone.Lista, Cor.Registro, r.tipo, r.valor)
}
