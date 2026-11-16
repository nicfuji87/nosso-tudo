package app.nossotudo.saude.wear.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

private val FASES = listOf(Fase("Inspire", 4, 1f), Fase("Segure", 7, 1f), Fase("Expire", 8, 0.78f))
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
        if (!rodando) return@LaunchedEffect
        concluiu = false
        for (c in 1..CICLOS) {
            ciclo = c
            for (i in FASES.indices) {
                fase = i
                haptico.performHapticFeedback(HapticFeedbackType.LongPress)
                coroutineScope {
                    launch {
                        progresso.snapTo(0f)
                        progresso.animateTo(1f, tween(FASES[i].segundos * 1000, easing = LinearEasing))
                    }
                    for (s in FASES[i].segundos downTo 1) { restante = s; delay(1000) }
                }
            }
        }
        fase = -1; rodando = false; concluiu = true
        Registros.adicionar(ctx, "respiracao", "4-7-8 · $CICLOS ciclos")
    }

    val alvo = if (fase < 0) 1f else FASES[fase].escala
    val escala by animateFloatAsState(alvo, tween(if (fase < 0) 400 else FASES[fase].segundos * 1000, easing = LinearEasing), label = "respira")

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Color(0xFF0E2224), e.px(226), style = Stroke(e.px(8)))
            if (fase >= 0) arcoBorda(e, 226, 8, Cor.Respira, -90f, 360f * progresso.value)
            val c = Offset(size.width / 2, size.height / 2 - e.px(4))
            val r = e.px(118) * escala
            drawCircle(Cor.Respira.copy(alpha = 0.06f), r + e.px(32), c, style = Stroke(e.px(22)))
            drawCircle(Cor.Respira.copy(alpha = 0.12f), r + e.px(14), c, style = Stroke(e.px(14)))
            drawCircle(Color(0xFF061416), r, c)
            drawCircle(Cor.Respira, r, c, style = Stroke(e.px(5)))
        }
        Column(
            Modifier.fillMaxSize().clickable(enabled = !rodando) { rodando = true },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when {
                fase >= 0 -> {
                    Text(FASES[fase].nome, color = Cor.Texto, fontSize = e.s(34), fontWeight = FontWeight.SemiBold)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("$restante", color = Cor.Texto, fontSize = e.s(64), fontWeight = FontWeight.Bold)
                        Text(" s", color = Cor.TextoTerc, fontSize = e.s(24), modifier = Modifier.padding(bottom = e.d(10)))
                    }
                }
                concluiu -> Text("Pronto ✓", color = Cor.Texto, fontSize = e.s(30), fontWeight = FontWeight.SemiBold)
                else -> Text("Toque para\niniciar", color = Cor.Texto, fontSize = e.s(26), fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
            Row(Modifier.padding(top = e.d(14)), horizontalArrangement = Arrangement.spacedBy(e.d(8))) {
                repeat(CICLOS) { k ->
                    Box(Modifier.width(e.d(22)).height(e.d(6)).clip(RoundedCornerShape(50))
                        .background(if (k < ciclo) Cor.Respira else Color(0xFF1B3335)))
                }
            }
        }
        Box(Modifier.align(Alignment.TopCenter).padding(top = e.d(52))) { Titulo(e, "Respiração", Icone.Vento, Cor.Respira) }
        Text(
            if (fase >= 0) "ciclo $ciclo de $CICLOS · 4-7-8" else "4-7-8 · ~1 min",
            color = Color(0xFF9AA09B), fontSize = e.s(13),
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = e.d(34)),
        )
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
    val segundos = (estado as? EcgSessao.Estado.Medindo)?.segundos ?: 0

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            // faixa com grade de papel de ECG
            val topo = e.px(150); val alt = e.px(140)
            var x = 0f
            while (x <= size.width) {
                val forte = (x / e.px(10)).toInt() % 5 == 0
                drawLine(if (forte) Color(0xFF45191E) else Color(0xFF2A1215), Offset(x, topo), Offset(x, topo + alt), e.px(if (forte) 1.4 else 1))
                x += e.px(10)
            }
            var y = topo
            while (y <= topo + alt) {
                val forte = ((y - topo) / e.px(10)).toInt() % 5 == 0
                drawLine(if (forte) Color(0xFF45191E) else Color(0xFF2A1215), Offset(0f, y), Offset(size.width, y), e.px(if (forte) 1.4 else 1))
                y += e.px(10)
            }
            // traçado ao vivo (auto-escala na faixa)
            val v = traco.takeLast(1000)
            if (v.size > 2) {
                val mn = v.min(); val mx = v.max(); val faixa = (mx - mn).takeIf { it > 0f } ?: 1f
                val dx = size.width / (v.size - 1)
                val p = Path()
                v.forEachIndexed { i, mv ->
                    val py = topo + alt * 0.9f - (mv - mn) / faixa * alt * 0.8f
                    if (i == 0) p.moveTo(0f, py) else p.lineTo(i * dx, py)
                }
                drawPath(p, Cor.Ecg, style = Stroke(e.px(3), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            // progresso de 30 s na borda
            drawCircle(Color(0xFF2A1215), e.px(226), style = Stroke(e.px(8)))
            if (segundos > 0) arcoBorda(e, 226, 8, Cor.Ecg, -90f, 360f * segundos / 30f)
            // seta para o botão superior
            drawLine(Cor.CoracaoClaro, Offset(e.px(400), e.px(86)), Offset(e.px(422), e.px(64)), e.px(2.5), StrokeCap.Round)
            drawLine(Cor.CoracaoClaro, Offset(e.px(410), e.px(64)), Offset(e.px(422), e.px(64)), e.px(2.5), StrokeCap.Round)
            drawLine(Cor.CoracaoClaro, Offset(e.px(422), e.px(64)), Offset(e.px(422), e.px(76)), e.px(2.5), StrokeCap.Round)
        }
        Column(Modifier.fillMaxWidth().padding(top = e.d(56)), horizontalAlignment = Alignment.CenterHorizontally) {
            Titulo(e, "ECG", Icone.Ecg, Cor.Ecg)
            val contato = (estado as? EcgSessao.Estado.Medindo)?.contato ?: true
            Text(
                if (contato) "dedo no botão superior ↗" else "sem contato — encoste o dedo",
                color = if (contato) Cor.CoracaoClaro else Cor.Habito, fontSize = e.s(12), modifier = Modifier.padding(top = e.d(6)),
            )
        }
        Column(Modifier.fillMaxWidth().offset(y = e.d(300)), horizontalAlignment = Alignment.CenterHorizontally) {
            when (val s = estado) {
                is EcgSessao.Estado.Medindo -> {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("${s.segundos}", color = Cor.Texto, fontSize = e.s(30), fontWeight = FontWeight.Bold)
                        Text(" / 30 s", color = Cor.TextoTerc, fontSize = e.s(16), modifier = Modifier.padding(bottom = e.d(4)))
                    }
                    Spacer(Modifier.height(e.d(8)))
                    Pilula(e, "Parar", { sessao.cancelar() }, fundo = Color(0xFF2A1215), cor = Color(0xFFFFB3BB), icone = Icone.Parar)
                }
                is EcgSessao.Estado.Conectando -> Text("conectando…", color = Cor.Texto, fontSize = e.s(16))
                is EcgSessao.Estado.Concluido -> {
                    Text("Salvo · ${s.hz} Hz", color = Cor.Acao, fontSize = e.s(16), fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(e.d(8)))
                    Pilula(e, "Medir de novo", { sessao.iniciar() }, icone = Icone.Play)
                }
                is EcgSessao.Estado.Erro -> {
                    Text(s.msg, color = Cor.Habito, fontSize = e.s(13), textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = e.d(80)))
                    Spacer(Modifier.height(e.d(8)))
                    Pilula(e, "Tentar de novo", { sessao.iniciar() }, icone = Icone.Play)
                }
                else -> {
                    Text("≈ 30 segundos", color = Cor.TextoSec, fontSize = e.s(14))
                    Spacer(Modifier.height(e.d(8)))
                    Pilula(e, "Iniciar ECG", { sessao.iniciar() }, icone = Icone.Play)
                }
            }
            Text("não substitui avaliação médica", color = Cor.TextoTerc, fontSize = e.s(11), modifier = Modifier.padding(top = e.d(8)))
        }
    }
}

// ================================================================ Check-in

private enum class Humor(val rotulo: String, val valor: String, val cor: Color) {
    BEM("Bem", "bem", Color(0xFF7FE08A)), OK("Ok", "ok", Color(0xFFF2C14B)), MAL("Mal", "mal", Color(0xFFFF6B7D))
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

@Composable
fun TelaCheckin(voltar: () -> Unit) {
    val ctx = LocalContext.current
    var escolha by remember { mutableStateOf<Humor?>(null) }
    var salvo by remember { mutableStateOf(false) }
    val periodo = when (java.time.LocalTime.now().hour) { in 5..11 -> "manhã"; in 12..17 -> "tarde"; else -> "noite" }

    if (salvo) LaunchedEffect(Unit) { delay(900); voltar() }

    Redondo { e ->
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconeTraco(Icone.Checkin, Cor.Acao, e.d(17))
                Spacer(Modifier.width(e.d(7)))
                Text("Check-in · $periodo", color = Cor.ProntidaoClaro, fontSize = e.s(14), fontWeight = FontWeight.Medium)
            }
            Text("Como você está?", color = Cor.Texto, fontSize = e.s(24), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = e.d(10)))
            Row(Modifier.padding(top = e.d(20)), horizontalArrangement = Arrangement.spacedBy(e.d(14))) {
                Humor.entries.forEach { h ->
                    val sel = escolha == h
                    Column(
                        Modifier.width(e.d(96)).clickable { escolha = h }.semantics { contentDescription = h.rotulo },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(e.d(84)).clip(CircleShape).background(h.cor.copy(alpha = if (sel) 0.22f else 0.10f))
                                .border(e.d(3), if (sel) h.cor else Color.Transparent, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Rosto(h, Modifier.size(e.d(46))) }
                        Text(h.rotulo, color = if (sel) Cor.Texto else Color(0xFF9AA09B), fontSize = e.s(13),
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = e.d(8)))
                    }
                }
            }
            Spacer(Modifier.height(e.d(22)))
            if (salvo) {
                Text("Registrado ✓", color = Cor.Acao, fontSize = e.s(18), fontWeight = FontWeight.SemiBold)
            } else {
                val ativo = escolha != null
                Pilula(
                    e, "Registrar",
                    { escolha?.let { Registros.adicionar(ctx, "checkin", it.valor); salvo = true } },
                    fundo = if (ativo) Cor.Acao else Cor.Chip, cor = if (ativo) Cor.AcaoTexto else Cor.TextoTerc,
                    modifier = Modifier.width(e.d(180)),
                )
            }
        }
    }
}

// ================================================================ Hábitos (toque = +1)

private data class Habito(val nome: String, val icone: ImageVector, val cor: Color)

private val HABITOS = listOf(
    Habito("Café", Icone.Cafe, Color(0xFFF2C14B)),
    Habito("Álcool", Icone.Taca, Color(0xFFFF8FA0)),
    Habito("Remédio", Icone.Pilula, Color(0xFFB08CFF)),
    Habito("Água", Icone.Gota, Color(0xFF45E3EA)),
)

@Composable
fun TelaHabitos() {
    val ctx = LocalContext.current
    val haptico = LocalHapticFeedback.current
    var versao by remember { mutableIntStateOf(0) }
    val contagem = remember(versao) {
        Registros.hoje(ctx).filter { it.tipo == "habito" }.groupingBy { it.valor }.eachCount()
    }
    Redondo { e ->
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("Hábitos de hoje", color = Cor.Texto, fontSize = e.s(16), fontWeight = FontWeight.SemiBold)
            Text("toque para somar +1", color = Color(0xFF9AA09B), fontSize = e.s(12), modifier = Modifier.padding(top = e.d(4)))
            Spacer(Modifier.height(e.d(14)))
            HABITOS.chunked(2).forEach { linha ->
                Row(horizontalArrangement = Arrangement.spacedBy(e.d(10)), modifier = Modifier.padding(bottom = e.d(10))) {
                    linha.forEach { h ->
                        val n = contagem[h.nome] ?: 0
                        Box(
                            Modifier.width(e.d(145)).height(e.d(112)).clip(RoundedCornerShape(e.d(28)))
                                .background(h.cor.copy(alpha = 0.12f))
                                .clickable {
                                    Registros.adicionar(ctx, "habito", h.nome)
                                    haptico.performHapticFeedback(HapticFeedbackType.LongPress)
                                    versao++
                                }
                                .semantics { contentDescription = "${h.nome}, $n hoje, somar um" }
                                .padding(e.d(14)),
                        ) {
                            IconeTraco(h.icone, h.cor, e.d(26))
                            Box(
                                Modifier.align(Alignment.TopEnd).size(e.d(26)).clip(CircleShape).background(h.cor),
                                contentAlignment = Alignment.Center,
                            ) { Text("+", color = Color(0xFF111111), fontSize = e.s(18), fontWeight = FontWeight.Bold) }
                            Column(Modifier.align(Alignment.BottomStart)) {
                                Text("×$n", color = Cor.Texto, fontSize = e.s(26), fontWeight = FontWeight.Bold)
                                Text(h.nome, color = Color(0xFFC9CCC8), fontSize = e.s(13))
                            }
                        }
                    }
                }
            }
        }
    }
}

// ================================================================ Registros (linha do tempo)

private val HHMM = DateTimeFormatter.ofPattern("HH:mm")
private val MESES = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

@Composable
fun TelaRegistros() {
    val ctx = LocalContext.current
    val lista = remember { Registros.listar(ctx, 60) }
    Redondo { e ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = e.d(52), bottom = e.d(80)),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Titulo(e, "Registros", Icone.Lista, Cor.Registro)
            if (lista.isEmpty()) {
                Text("Nada registrado ainda", color = Cor.TextoTerc, fontSize = e.s(13), modifier = Modifier.padding(top = e.d(40)))
            }
            var diaAnterior: LocalDate? = null
            lista.forEach { r ->
                val t = Instant.ofEpochMilli(r.ts).atZone(ZoneId.systemDefault())
                val dia = t.toLocalDate()
                if (dia != diaAnterior) {
                    val rotulo = when (dia) {
                        LocalDate.now() -> "HOJE"
                        LocalDate.now().minusDays(1) -> "ONTEM"
                        else -> "${dia.dayOfMonth} ${MESES[dia.monthValue - 1]}".uppercase()
                    }
                    Text(rotulo, color = Cor.Salvia, fontSize = e.s(11), fontWeight = FontWeight.SemiBold, letterSpacing = e.s(1.8),
                        modifier = Modifier.padding(top = e.d(14), bottom = e.d(4)))
                    diaAnterior = dia
                }
                val (icone, cor, titulo, detalhe) = descrever(r)
                Row(Modifier.width(e.d(330)).height(e.d(52)), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(e.d(36)).fillMaxSize(), contentAlignment = Alignment.Center) {
                        Box(Modifier.width(e.d(2)).fillMaxSize().background(Color(0xFF1E2420)))
                        Box(
                            Modifier.size(e.d(36)).clip(CircleShape).background(Color.Black).padding(e.d(2))
                                .clip(CircleShape).background(cor.copy(alpha = 0.16f)),
                            contentAlignment = Alignment.Center,
                        ) { IconeTraco(icone, cor, e.d(17)) }
                    }
                    Spacer(Modifier.width(e.d(12)))
                    Column(Modifier.weight(1f)) {
                        Text(titulo, color = Cor.Texto, fontSize = e.s(15), fontWeight = FontWeight.SemiBold, maxLines = 1)
                        Text(detalhe, color = Color(0xFF9AA09B), fontSize = e.s(12), maxLines = 1)
                    }
                    Text(t.format(HHMM), color = Color(0xFFC9CCC8), fontSize = e.s(14))
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
    else -> Linha(Icone.Lista, Cor.Registro, r.tipo, r.valor)
}
