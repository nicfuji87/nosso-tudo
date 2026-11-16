package app.nossotudo.saude.wear.ui

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.EstadoSaude
import app.nossotudo.saude.wear.MonitorCardiaco

object Rota {
    const val HUB = "hub"
    const val CORACAO = "coracao"
    const val VFC = "vfc"
    const val PRONTIDAO = "prontidao"
    const val SONO = "sono"
    const val RESPIRACAO = "respiracao"
    const val ECG = "ecg"
    const val CHECKIN = "checkin"
    const val HABITOS = "habitos"
    const val REGISTROS = "registros"
    const val LABORATORIO = "laboratorio"
    const val CONECTAR = "conectar"
    const val MALESTAR = "malestar"
}

/** "Ao vivo" só com leitura válida nos últimos 15 s; sensor ligado sem pulso = procurando. */
fun statusLeitura(estado: MonitorCardiaco.Estado, ts: Long, erro: String? = null): String = when {
    estado == MonitorCardiaco.Estado.ERRO -> "erro: $erro"
    estado == MonitorCardiaco.Estado.MEDINDO && System.currentTimeMillis() - ts < 15_000 -> "ao vivo"
    estado == MonitorCardiaco.Estado.MEDINDO || estado == MonitorCardiaco.Estado.CONECTANDO -> "procurando pulso…"
    else -> idade(ts)
}

/** Tempo desde a última leitura, para não mostrar valor velho como se fosse atual. */
fun idade(ts: Long): String {
    if (ts <= 0) return "sem leitura"
    val min = (System.currentTimeMillis() - ts) / 60_000
    return when {
        min < 1 -> "agora"
        min < 60 -> "há $min min"
        min < 24 * 60 -> "há ${min / 60} h"
        else -> "há ${min / 1440} d"
    }
}

// ================================================================ Hub Orbital

private data class Funcao(val nome: String, val icone: ImageVector, val cor: Color, val rota: String)

private val FUNCOES = listOf(
    Funcao("Coração", Icone.Coracao, Cor.Coracao, Rota.CORACAO),
    Funcao("VFC", Icone.Vfc, Cor.Vfc, Rota.VFC),
    Funcao("Prontidão", Icone.Raio, Cor.Prontidao, Rota.PRONTIDAO),
    Funcao("Sono", Icone.Lua, Cor.Sono, Rota.SONO),
    Funcao("Respiração", Icone.Vento, Cor.Respira, Rota.RESPIRACAO),
    Funcao("ECG", Icone.Ecg, Cor.Ecg, Rota.ECG),
    Funcao("Check-in", Icone.Checkin, Cor.Acao, Rota.CHECKIN),
    Funcao("Hábitos", Icone.Cafe, Cor.Habito, Rota.HABITOS),
    Funcao("Registros", Icone.Lista, Cor.Registro, Rota.REGISTROS),
    Funcao("Laboratório", Icone.Frasco, Cor.Lab, Rota.LABORATORIO),
)

/** Canto superior esquerdo de cada botão no anel (px do design, raio 178, a cada 36°). */
private val POSICOES = listOf(
    209f to 31f, 313.6f to 65f, 378.3f to 154f, 378.3f to 264f, 313.6f to 353f,
    209f to 387f, 104.4f to 353f, 39.7f to 264f, 39.7f to 154f, 104.4f to 65f,
)

@Composable
fun TelaHub(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } }
    val estado by monitor.estado.collectAsState()
    val bpm by EstadoSaude.bpm.collectAsState()
    val ts by EstadoSaude.bpmTs.collectAsState()
    val agora by EstadoSaude.rmssdAgora.collectAsState()
    val janelas by EstadoSaude.janelasHoje.collectAsState()
    val vfc = EstadoSaude.rmssdHoje() ?: agora
    val pront = remember(janelas.size) { EstadoSaude.prontidao() }

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                Color(0xFF151917), radius = e.px(178),
                style = Stroke(e.px(1.5), pathEffect = PathEffect.dashPathEffect(floatArrayOf(e.px(2), e.px(6)))),
            )
        }
        FUNCOES.forEachIndexed { i, f ->
            val (x, y) = POSICOES[i]
            Box(
                Modifier.offset(e.d(x), e.d(y)).size(e.d(62)).clip(CircleShape)
                    .background(f.cor.copy(alpha = 0.14f))
                    .border(e.d(1.5), f.cor.copy(alpha = 0.45f), CircleShape)
                    .clickable { ir(f.rota) }
                    .semantics { contentDescription = f.nome },
                contentAlignment = Alignment.Center,
            ) { IconeTraco(f.icone, f.cor, e.d(26)) }
        }
        Column(
            Modifier.offset(e.d(127), e.d(127)).size(e.d(226)).clip(CircleShape)
                .background(Cor.Disco).border(e.d(1), Cor.DiscoBorda, CircleShape)
                .clickable { ir(Rota.CORACAO) },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("SAÚDE", color = Cor.Salvia, fontSize = e.s(11), fontWeight = FontWeight.SemiBold, letterSpacing = e.s(2))
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconeTraco(Icone.Coracao, Cor.Coracao, e.d(18))
                Spacer(Modifier.width(e.d(6)))
                if (bpm != null) {
                    Text("$bpm", color = Cor.Texto, fontSize = e.s(64), fontWeight = FontWeight.Bold, letterSpacing = e.s(-1))
                } else {
                    Text("– –", color = Cor.TextoTerc, fontSize = e.s(40), fontWeight = FontWeight.Light)
                }
            }
            Text("bpm · " + statusLeitura(estado, ts), color = Cor.TextoSec, fontSize = e.s(13))
            Box(Modifier.padding(vertical = e.d(9)).width(e.d(120)).height(e.d(1)).background(Cor.Divisor))
            Row(horizontalArrangement = Arrangement.spacedBy(e.d(18))) {
                MiniValor(e, vfc?.let { "%.0f".format(it) } ?: "—", " ms", "VFC", Cor.VfcClaro)
                if (pront.pontos != null) MiniValor(e, "${pront.pontos}", "", "prontidão", Cor.ProntidaoClaro)
                else MiniValor(e, "${pront.diasBase}", "/${EstadoSaude.DIAS_BASE}", "base", Cor.ProntidaoClaro)
            }
        }
    }
}

@Composable
private fun MiniValor(e: Escala, valor: String, sufixo: String, rotulo: String, cor: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(valor, color = cor, fontSize = e.s(18), fontWeight = FontWeight.SemiBold)
            if (sufixo.isNotEmpty()) Text(sufixo, color = Cor.TextoSec, fontSize = e.s(11), modifier = Modifier.padding(bottom = e.d(2)))
        }
        Text(rotulo, color = Cor.TextoTerc, fontSize = e.s(10))
    }
}

// ================================================================ Coração

private fun fracaoBpm(v: Int) = ((v - 40f) / (180f - 40f)).coerceIn(0f, 1f)

@Composable
fun TelaCoracao() {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } }
    val estado by monitor.estado.collectAsState()
    val erro by monitor.erro.collectAsState()
    val bpm by EstadoSaude.bpm.collectAsState()
    val ts by EstadoSaude.bpmTs.collectAsState()
    val serie by EstadoSaude.serieBpm.collectAsState()
    val faixa by EstadoSaude.faixaHoje.collectAsState()

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            arcoBorda(e, 226, 10, Color(0xFF241417), 135f, 270f)
            faixa?.let { (mn, mx) ->
                val a = fracaoBpm(mn); val b = fracaoBpm(mx)
                arcoBorda(e, 226, 10, Cor.Coracao, 135f + 270f * a, maxOf(270f * (b - a), 1f))
            }
            bpm?.let { pontoBorda(e, 226, 135f + 270f * fracaoBpm(it), 9, Color.White, Cor.Coracao) }
        }
        Column(Modifier.fillMaxSize().padding(top = e.d(58)), horizontalAlignment = Alignment.CenterHorizontally) {
            Titulo(e, "Coração", Icone.Coracao, Cor.Coracao)
            Spacer(Modifier.height(e.d(12)))
            Numero(e, bpm?.toString() ?: SEM_VALOR, "bpm", 96)
            val status = statusLeitura(estado, ts, erro)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(e.d(7)).clip(CircleShape).background(if (status == "ao vivo") Cor.Coracao else Cor.TextoTerc))
                Spacer(Modifier.width(e.d(6)))
                Text(status, color = Cor.CoracaoClaro, fontSize = e.s(13))
            }
            if (status == "procurando pulso…") {
                Text("use o relógio firme no pulso", color = Cor.TextoTerc, fontSize = e.s(11), modifier = Modifier.padding(top = e.d(4)))
            }
            Spacer(Modifier.height(e.d(12)))
            GraficoLinha(serie.map { it.v }, Cor.Coracao, Modifier.width(e.d(290)).height(e.d(66)))
            Spacer(Modifier.height(e.d(10)))
            if (faixa != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(e.d(8))) {
                    Chip(e, "mín ${faixa!!.first}")
                    Chip(e, "máx ${faixa!!.second}")
                }
                Text("faixa de hoje no arco", color = Cor.TextoTerc, fontSize = e.s(11), modifier = Modifier.padding(top = e.d(6)))
            } else {
                Chip(e, "sem leituras hoje")
            }
        }
    }
}

// ================================================================ VFC

@Composable
fun TelaVfc() {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } }
    val agora by EstadoSaude.rmssdAgora.collectAsState()
    val qualidade by EstadoSaude.qualidadeIbi.collectAsState()
    val janelas by EstadoSaude.janelasHoje.collectAsState()
    val hoje = EstadoSaude.rmssdHoje()
    val variacao = remember(janelas.size) { EstadoSaude.variacaoVs7d() }

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            arcoBorda(e, 226, 8, Color(0xFF1B1526), 135f, 270f)
            qualidade?.let { arcoBorda(e, 226, 8, Cor.Vfc, 135f, 270f * it) }
        }
        Column(Modifier.fillMaxSize().padding(top = e.d(58)), horizontalAlignment = Alignment.CenterHorizontally) {
            Titulo(e, "VFC (HRV)", Icone.Vfc, Cor.Vfc)
            Spacer(Modifier.height(e.d(12)))
            Numero(e, (hoje ?: agora)?.let { "%.0f".format(it) } ?: SEM_VALOR, "ms", 88)
            Text(
                when {
                    hoje != null -> "RMSSD · mediana de hoje"
                    agora != null -> "RMSSD · agora"
                    else -> "medindo… fique parado"
                },
                color = Cor.VfcClaro, fontSize = e.s(13),
            )
            Spacer(Modifier.height(e.d(14)))
            val ultimas = janelas.takeLast(14)
            if (ultimas.isNotEmpty()) {
                val mn = ultimas.minOf { it.rmssd }; val mx = ultimas.maxOf { it.rmssd }
                Row(Modifier.height(e.d(72)), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(e.d(5))) {
                    ultimas.forEach { j ->
                        val h = 14f + if (mx > mn) (j.rmssd - mn) / (mx - mn) * 58f else 40f
                        Box(
                            Modifier.width(e.d(13)).height(e.d(h)).clip(RoundedCornerShape(e.d(4)))
                                .background(if (j.cobertura >= 0.6f) Cor.Vfc else Color(0xFF2A2F2C)),
                        )
                    }
                }
                Text("janelas de 5 min · cinza = sinal fraco", color = Cor.TextoTerc, fontSize = e.s(11), modifier = Modifier.padding(top = e.d(6)))
            } else {
                Text("1ª janela de 5 min em breve", color = Cor.TextoTerc, fontSize = e.s(12))
            }
            Spacer(Modifier.height(e.d(10)))
            Row(horizontalArrangement = Arrangement.spacedBy(e.d(8))) {
                variacao?.let {
                    Chip(e, "${if (it >= 0) "↑" else "↓"} ${"%.0f".format(kotlin.math.abs(it))}% vs. 7 dias",
                        fundo = Cor.Prontidao.copy(alpha = 0.16f), cor = Cor.ProntidaoClaro, negrito = true)
                }
                qualidade?.let { Chip(e, "sinal ${(it * 100).toInt()}%") }
            }
        }
    }
}

// ================================================================ Prontidão

@Composable
fun TelaProntidao() {
    val p = remember { EstadoSaude.prontidao() }
    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            if (p.pontos == null) {
                val passo = 270f / EstadoSaude.DIAS_BASE
                for (k in 0 until EstadoSaude.DIAS_BASE) {
                    arcoBorda(e, 222, 16, if (k < p.diasBase) Cor.Prontidao else Color(0xFF18211B),
                        135f + k * passo, passo - 1.6f, StrokeCap.Butt)
                }
            } else {
                arcoBorda(e, 222, 16, Color(0xFF18211B), 135f, 270f)
                arcoBorda(e, 222, 16, Cor.Prontidao, 135f, 270f * p.pontos / 100f)
            }
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = e.d(92)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Titulo(e, "Prontidão", Icone.Raio, Cor.Prontidao)
            Spacer(Modifier.height(e.d(10)))
            if (p.pontos == null) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("${p.diasBase}", color = Cor.Texto, fontSize = e.s(88), fontWeight = FontWeight.Bold)
                    Text("/${EstadoSaude.DIAS_BASE}", color = Cor.TextoTerc, fontSize = e.s(34), fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(bottom = e.d(12)))
                }
                Text("dias de linha de base", color = Cor.ProntidaoClaro, fontSize = e.s(14))
                Text(
                    "Sua nota aparece quando o relógio conhecer a sua VFC normal. Use-o à noite para acelerar.",
                    color = Cor.TextoSec, fontSize = e.s(13), textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = e.d(12)),
                )
                Spacer(Modifier.height(e.d(12)))
                Chip(e, "faltam ${EstadoSaude.DIAS_BASE - p.diasBase} noites")
            } else {
                Numero(e, "${p.pontos}", tamanho = 88)
                Text("recuperação", color = Cor.ProntidaoClaro, fontSize = e.s(14))
                Spacer(Modifier.height(e.d(12)))
                Chip(e, p.texto, fundo = Cor.Prontidao.copy(alpha = 0.16f), cor = Cor.ProntidaoClaro, negrito = true)
                Text("apoio à decisão — não decide sozinho", color = Cor.TextoTerc, fontSize = e.s(11),
                    modifier = Modifier.padding(top = e.d(8)))
            }
        }
    }
}

// ================================================================ Sono (Fase 2)

@Composable
fun TelaSono() {
    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                Color(0xFF2A3150), radius = e.px(226),
                style = Stroke(e.px(3), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(e.px(2), e.px(10)))),
            )
            listOf(Triple(120f, 96f, 1.6f), Triple(352f, 88f, 1.2f), Triple(390f, 160f, 1.8f), Triple(86f, 170f, 1.2f)).forEach { (x, y, r) ->
                drawCircle(Cor.Sono, e.px(r), androidx.compose.ui.geometry.Offset(e.px(x), e.px(y)))
            }
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = e.d(84)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(e.d(64)).clip(CircleShape).background(Cor.Sono.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                IconeTraco(Icone.Lua, Cor.Sono, e.d(32))
            }
            Text("Sono", color = Cor.Texto, fontSize = e.s(18), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = e.d(10)))
            Row(Modifier.padding(top = e.d(14)).height(e.d(54)), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(e.d(4))) {
                listOf(30, 44, 54, 40, 26, 44, 54, 50, 34, 22, 40, 52, 44, 30, 20, 36).forEach { h ->
                    Box(Modifier.width(e.d(12)).height(e.d(h)).border(e.d(1.5), Color(0xFF3A4370), RoundedCornerShape(e.d(4))))
                }
            }
            Text("Fases e duração do sono chegam pelo Samsung Health do celular.", color = Cor.TextoSec,
                fontSize = e.s(13), textAlign = TextAlign.Center, modifier = Modifier.padding(top = e.d(14)))
            Spacer(Modifier.height(e.d(12)))
            Chip(e, "disponível na Fase 2", fundo = Cor.Sono.copy(alpha = 0.14f), cor = Color(0xFFC9D2FF), negrito = true)
        }
    }
}
