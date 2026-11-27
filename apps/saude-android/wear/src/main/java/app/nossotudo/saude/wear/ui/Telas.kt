package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumnScope
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.CardDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.ColetaService
import app.nossotudo.saude.wear.EstadoSaude
import app.nossotudo.saude.wear.MonitorCardiaco
import app.nossotudo.saude.wear.ProntidaoServidor
import app.nossotudo.saude.wear.Sync
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object Rota {
    const val HOJE = "hoje"
    const val HUB = HOJE // atalhos antigos do Tile
    const val CORACAO = "coracao"
    const val VFC = "vfc"
    const val PRONTIDAO = "prontidao"
    const val SONO = "sono"
    const val REGISTRAR = "registrar"
    const val TREINOS = "treinos"
    const val MAIS = "mais"
    const val DIAGNOSTICO = "diagnostico"
    const val RESPIRACAO = "respiracao"
    const val ECG = "ecg"
    const val CHECKIN = "checkin"
    const val HABITOS = "habitos"
    const val REGISTROS = "registros"
    const val LABORATORIO = "laboratorio"
    const val CONECTAR = "conectar"
    const val MALESTAR = "malestar"
    const val ORTOSTATICO = "ortostatico"
}

private val HHMM = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
private val HHMMSS = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault())
fun hora(ms: Long): String = if (ms > 0) HHMM.format(Instant.ofEpochMilli(ms)) else SEM_VALOR
fun horaSeg(ms: Long): String = if (ms > 0) HHMMSS.format(Instant.ofEpochMilli(ms)) else SEM_VALOR
/** "2026-11-22" → "22/11" (ou "ontem"). */
fun diaCurto(dia: String?): String = runCatching {
    val d = java.time.LocalDate.parse(dia)
    if (d == java.time.LocalDate.now().minusDays(1)) "ontem" else "%02d/%02d".format(d.dayOfMonth, d.monthValue)
}.getOrDefault("?")

/** Tempo desde um instante, para nunca mostrar valor velho como se fosse atual. */
fun idade(ts: Long, agora: Long = System.currentTimeMillis()): String {
    if (ts <= 0) return "sem leitura"
    val min = (agora - ts) / 60_000
    return when {
        min < 1 -> "agora"
        min < 60 -> "há $min min"
        min < 24 * 60 -> "há ${min / 60} h"
        else -> "há ${min / 1440} d"
    }
}

/**
 * Estado da leitura do batimento, distinguindo horário da LEITURA (amostra) e da CHEGADA do lote:
 * com a tela apagada o SDK entrega em lotes a cada ~3 min, então "há 2 min" pode ser normal.
 */
data class EstadoLeitura(val texto: String, val cor: Color, val aoVivo: Boolean)

fun estadoLeitura(amostraMs: Long, chegadaMs: Long, servicoRodando: Boolean, monitor: MonitorCardiaco.Estado?, agora: Long = System.currentTimeMillis()): EstadoLeitura {
    val idadeAmostra = agora - amostraMs
    return when {
        monitor == MonitorCardiaco.Estado.ERRO -> EstadoLeitura("erro no sensor", Cor.Alerta, false)
        amostraMs > 0 && idadeAmostra < 20_000 -> EstadoLeitura("medindo agora", Cor.Coracao, true)
        !servicoRodando && monitor != MonitorCardiaco.Estado.MEDINDO && monitor != MonitorCardiaco.Estado.CONECTANDO ->
            EstadoLeitura("sensor desconectado · última ${idade(amostraMs, agora)}", Cor.Atencao, false)
        amostraMs > 0 && idadeAmostra < 6 * 60_000 -> EstadoLeitura("última leitura ${idade(amostraMs, agora)}", Cor.TextoSec, false)
        monitor == MonitorCardiaco.Estado.CONECTANDO -> EstadoLeitura("procurando pulso…", Cor.TextoSec, false)
        chegadaMs > 0 && agora - chegadaMs < 6 * 60_000 -> EstadoLeitura("sem pulso · relógio solto?", Cor.Atencao, false)
        else -> EstadoLeitura("sem leitura ${if (amostraMs > 0) idade(amostraMs, agora) else ""}".trim(), Cor.Atencao, false)
    }
}

/** Atualiza o "agora" da tela a cada [ms] (idades e estados sem depender de nova leitura). */
@Composable
fun relogioDaTela(ms: Long = 5_000): Long {
    var agora by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(ms); agora = System.currentTimeMillis() } }
    return agora
}

// ================================================================ Hoje (tela inicial)

/**
 * Tela inicial: prontidão do servidor (a mesma do celular), batimento recente e VFC, radar resumido,
 * as quatro seções e o registro de sintoma no botão de borda. Não liga sensor: lê o que a coleta já mediu.
 */
@Composable
fun TelaHoje(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    val agora = relogioDaTela()
    val bpm by EstadoSaude.bpm.collectAsState()
    val ts by EstadoSaude.bpmTs.collectAsState()
    val janelas by EstadoSaude.janelasHoje.collectAsState()
    val vfc = remember(janelas.size) { EstadoSaude.rmssdHoje() }
    val p = remember(agora / 60_000) { ProntidaoServidor.ler(ctx) }
    val radar = remember(agora / 60_000) { ctx.getSharedPreferences("sync", android.content.Context.MODE_PRIVATE).getString("radar_nivel", null) }
    val leitura = estadoLeitura(ts, EstadoSaude.ultimoLoteMs, ColetaService.rodando, null, agora)

    TelaLista(botaoBorda = { BotaoBorda("Sintoma", cor = Cor.Ecg, corTexto = Color.White) { ir(Rota.MALESTAR) } }) {
        item { Cabecalho("SAÚDE NT", Cor.Acao) }
        item { CartaoProntidao(p, agora) { ir(Rota.PRONTIDAO) } }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val parado = !leitura.aoVivo && (leitura.cor == Cor.Atencao || leitura.cor == Cor.Alerta)
                val rotuloBpm = if (leitura.aoVivo) "agora" else idade(ts, agora)
                MiniCartao(Modifier.weight(1f), bpm?.toString() ?: SEM_VALOR, "bpm", rotuloBpm, if (parado) Cor.Atencao else Cor.Coracao) { ir(Rota.CORACAO) }
                MiniCartao(Modifier.weight(1f), vfc?.let { "%.0f".format(it) } ?: SEM_VALOR, "ms", "VFC hoje", Cor.Vfc) { ir(Rota.VFC) }
            }
        }
        item {
            val (txt, cor) = when (radar) {
                "estresse" -> "Radar: vários sinais fora" to Cor.Atencao
                "observar" -> "Radar: observar" to Cor.Atencao
                "normal" -> "Radar: dentro do normal" to Cor.Acao
                "calibrando" -> "Radar: aprendendo seu normal" to Cor.TextoSec
                else -> "Radar: sem noite medida" to Cor.TextoSec
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Etiqueta(txt, cor) }
        }
        secoes(ir)
    }
}

private fun TransformingLazyColumnScope.secoes(ir: (String) -> Unit) {
    item { BotaoSecao("Coração", "batimento e sinal", Icone.Coracao, Cor.Coracao) { ir(Rota.CORACAO) } }
    item { BotaoSecao("Registrar", "sintoma, check-in, hábitos", Icone.Lapis, Cor.Acao) { ir(Rota.REGISTRAR) } }
    item { BotaoSecao("Treinos", "sessões e recuperação", Icone.Cronometro, Cor.Atencao) { ir(Rota.TREINOS) } }
    item { BotaoSecao("Mais", "ECG, respiração, testes", Icone.Mais, Cor.TextoSec) { ir(Rota.MAIS) } }
}

/** Botão de lista com ícone, rótulo e descrição curta (nada de ícone sem nome). */
@Composable
fun BotaoSecao(titulo: String, descricao: String?, icone: androidx.compose.ui.graphics.vector.ImageVector, cor: Color, habilitado: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = habilitado,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.filledTonalButtonColors(containerColor = Cor.Superficie, contentColor = Cor.Texto),
        icon = { IconeTraco(icone, if (habilitado) cor else Cor.TextoTerc) },
        secondaryLabel = descricao?.let { d -> { Text(d, color = Cor.TextoSec, maxLines = 2) } },
        label = { Text(titulo, maxLines = 1) },
    )
}

@Composable
private fun CartaoProntidao(p: ProntidaoServidor.Leitura, agora: Long, onClick: () -> Unit) {
    val hoje = p.deHoje && p.score != null
    val cor = if (hoje) corNivel(p.nivel) else Cor.TextoSec
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = if (hoje) "Prontidão ${p.score} de 100, ${tituloNivel(p.nivel)}" else "Prontidão de hoje indisponível"
        },
        colors = CardDefaults.cardColors(containerColor = Cor.Superficie),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Prontidão", color = Cor.TextoSec, style = MaterialTheme.typography.labelMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (hoje) "${p.score}" else SEM_VALOR, color = cor, style = MaterialTheme.typography.numeralSmall.tabular())
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(
                        if (hoje) tituloNivel(p.nivel) else "Aguardando a noite",
                        color = if (hoje) cor else Cor.TextoSec, style = MaterialTheme.typography.labelMedium, maxLines = 2,
                    )
                    Text(
                        when {
                            !hoje && p.recebidaEm > 0 -> "última: ${diaCurto(p.dia)}"
                            !hoje -> "sem dados do servidor"
                            p.provisoria -> "provisória · ${hora(p.recebidaEm)}"
                            else -> "atualizada ${hora(p.recebidaEm)}"
                        },
                        color = if (hoje && !p.provisoria) Cor.TextoSec else Cor.Atencao, style = MaterialTheme.typography.labelSmall, maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun MiniCartao(modifier: Modifier, valor: String, unidade: String, rotulo: String, cor: Color, onClick: () -> Unit) {
    Card(
        onClick = onClick, modifier = modifier.semantics { contentDescription = "$rotulo: $valor $unidade" },
        colors = CardDefaults.cardColors(containerColor = Cor.Superficie),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 8.dp),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(valor, color = Cor.Texto, style = MaterialTheme.typography.titleLarge.tabular(), maxLines = 1)
                if (valor != SEM_VALOR) Text(" $unidade", color = Cor.TextoSec, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 3.dp))
            }
            Text(rotulo, color = cor, style = MaterialTheme.typography.labelSmall, maxLines = 1, textAlign = TextAlign.Center)
        }
    }
}

// ================================================================ Coração

private fun fracaoBpm(v: Int) = ((v - 40f) / (180f - 40f)).coerceIn(0f, 1f)

@Composable
fun TelaCoracao() {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } } // só liga sensor se a coleta contínua não estiver rodando
    val estadoMon by monitor.estado.collectAsState()
    val agora = relogioDaTela(2_000)
    val bpm by EstadoSaude.bpm.collectAsState()
    val ts by EstadoSaude.bpmTs.collectAsState()
    val serie by EstadoSaude.serieBpm.collectAsState()
    val faixa by EstadoSaude.faixaHoje.collectAsState()
    val qualidade by EstadoSaude.qualidadeIbi.collectAsState()
    val leitura = estadoLeitura(ts, EstadoSaude.ultimoLoteMs, ColetaService.rodando, estadoMon, agora)

    TelaLista {
        item { Cabecalho("Coração", Cor.Coracao) }
        item { ValorGrande(bpm?.toString() ?: SEM_VALOR, "bpm", null) }
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Etiqueta(leitura.texto, leitura.cor) } }
        item {
            GraficoLinha(
                serie.map { it.v }, Cor.Coracao,
                Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 12.dp).semantics { contentDescription = "Batimento recente" },
            )
        }
        item {
            Column {
                LinhaInfo("Leitura", horaSeg(ts))
                LinhaInfo("Lote chegou", horaSeg(EstadoSaude.ultimoLoteMs))
                faixa?.let { (mn, mx) -> LinhaInfo("Faixa de hoje", "$mn–$mx bpm") }
                qualidade?.let { LinhaInfo("Sinal (IBI)", "${(it * 100).toInt()}%", if (it < 0.6f) Cor.Atencao else Cor.Texto) }
            }
        }
        item {
            Canvas(Modifier.fillMaxWidth().height(10.dp).padding(horizontal = 18.dp)) {
                drawRoundRect(Cor.Elevada, cornerRadius = CornerRadius(size.height / 2))
                faixa?.let { (mn, mx) ->
                    val a = fracaoBpm(mn) * size.width; val b = fracaoBpm(mx) * size.width
                    drawRoundRect(Cor.Coracao.copy(alpha = 0.55f), Offset(a, 0f), Size((b - a).coerceAtLeast(size.height), size.height), CornerRadius(size.height / 2))
                }
                bpm?.let { drawCircle(Color.White, size.height * 0.75f, Offset(fracaoBpm(it) * size.width, size.height / 2)) }
            }
        }
        item { Nota("Com a tela apagada, o relógio entrega o batimento em lotes a cada ~3 min.", Cor.TextoTerc) }
    }
}

// ================================================================ VFC

@Composable
fun TelaVfc() {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } }
    val agoraRmssd by EstadoSaude.rmssdAgora.collectAsState()
    val qualidade by EstadoSaude.qualidadeIbi.collectAsState()
    val janelas by EstadoSaude.janelasHoje.collectAsState()
    val hoje = remember(janelas.size) { EstadoSaude.rmssdHoje() }
    val variacao = remember(janelas.size) { EstadoSaude.variacaoVs7d() }

    TelaLista {
        item { Cabecalho("VFC", Cor.Vfc) }
        item {
            ValorGrande(
                (hoje ?: agoraRmssd)?.let { "%.0f".format(it) } ?: SEM_VALOR, "ms",
                when { hoje != null -> "mediana de hoje"; agoraRmssd != null -> "agora · fique parado"; else -> "medindo…" }, Cor.Vfc,
            )
        }
        item {
            val ultimas = janelas.takeLast(16)
            if (ultimas.isEmpty()) Nota("A 1ª janela de 5 min aparece em breve.")
            else Canvas(Modifier.fillMaxWidth().height(44.dp).padding(horizontal = 16.dp).semantics { contentDescription = "Janelas de VFC de hoje" }) {
                val mn = ultimas.minOf { it.rmssd }; val mx = ultimas.maxOf { it.rmssd }
                val w = size.width / ultimas.size
                ultimas.forEachIndexed { i, j ->
                    val h = size.height * (0.25f + if (mx > mn) 0.75f * (j.rmssd - mn) / (mx - mn) else 0.5f)
                    drawRoundRect(
                        if (j.cobertura >= 0.8f) Cor.Vfc else Color(0xFF3A3F45),
                        Offset(i * w + w * 0.15f, size.height - h), Size(w * 0.7f, h), CornerRadius(3.dp.toPx()),
                    )
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                variacao?.let { Etiqueta("${if (it >= 0) "+" else "−"}${"%.0f".format(kotlin.math.abs(it))}% vs. 7 dias", Cor.Vfc) }
            }
        }
        item { qualidade?.let { LinhaInfo("Sinal (IBI)", "${(it * 100).toInt()}%", if (it < 0.6f) Cor.Atencao else Cor.Texto) } }
        item { Nota("Janelas de 5 min. Cinza = captação abaixo de 80% (fora da VFC do dia no servidor).", Cor.TextoTerc) }
    }
}

// ================================================================ Prontidão (do servidor)

@Composable
fun TelaProntidao() {
    val ctx = LocalContext.current
    val p = remember { ProntidaoServidor.ler(ctx) }
    val hoje = p.deHoje && p.score != null
    TelaLista {
        item { Cabecalho("Prontidão", Cor.Acao) }
        item {
            ValorGrande(if (hoje) "${p.score}" else SEM_VALOR, "", if (hoje) tituloNivel(p.nivel) else "sem nota de hoje", corNivel(p.nivel), corNivel(p.nivel))
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                when {
                    !hoje -> Etiqueta("aguardando a noite", Cor.TextoSec)
                    p.provisoria -> Etiqueta("referência provisória", Cor.Atencao)
                    else -> Etiqueta("confiança ${when (p.confianca) { "alta" -> "alta"; "media" -> "média"; "baixa" -> "baixa"; else -> "?" }}", Cor.Acao)
                }
            }
        }
        if (hoje) {
            p.fatores.forEach { f ->
                item { LinhaInfo(f.texto, if (f.efeito < 0) "−${-f.efeito}" else "0", if (f.efeito <= -10) Cor.Atencao else Cor.TextoSec) }
            }
            p.motivoConfianca?.let { m -> item { Nota(m, Cor.TextoTerc) } }
        }
        item {
            Nota(
                if (hoje) "Mesma nota do celular (${p.algoritmo ?: "servidor"}), recebida às ${hora(p.recebidaEm)}. Índice próprio, não é medida clínica."
                else "A nota sai depois que a noite chega ao servidor (relógio + Samsung Health). O relógio não calcula uma nota própria.",
                Cor.TextoTerc,
            )
        }
    }
}

// ================================================================ Sono (resumo do servidor)

@Composable
fun TelaSono() {
    val ctx = LocalContext.current
    val p = remember { ProntidaoServidor.ler(ctx) }
    val h = p.sonoHoras
    TelaLista {
        item { Cabecalho("Sono", Cor.Sono) }
        item {
            ValorGrande(
                h?.let { "${it.toInt()}h${"%02d".format(((it % 1) * 60).toInt())}" } ?: SEM_VALOR, "",
                if (h != null && p.deHoje) "dormidas esta noite" else "sem sono de hoje", Cor.Sono,
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                when (p.sonoEstado) {
                    "contraditorio" -> Etiqueta("registro contraditório", Cor.Atencao)
                    "parcial" -> Etiqueta("dados parciais", Cor.Atencao)
                    "aguardando" -> Etiqueta("aguardando Samsung Health", Cor.TextoSec)
                    else -> if (p.recebidaEm > 0) Etiqueta("atualizado ${hora(p.recebidaEm)}", Cor.TextoSec)
                }
            }
        }
        p.sonoMotivo?.let { m -> item { Nota(m, Cor.TextoTerc) } }
        p.deitar?.let { d -> item { LinhaInfo("Deitar hoje", d, Cor.Sono) } }
        p.acordar?.let { a -> item { LinhaInfo("Acordar típico", a) } }
        item { Nota("Fases e detalhes no app do celular. O relógio não faz outra coleta para esta tela.", Cor.TextoTerc) }
    }
}

// ================================================================ Seções

@Composable
fun TelaRegistrar(ir: (String) -> Unit) {
    TelaLista {
        item { Cabecalho("Registrar") }
        item { BotaoSecao("Sintoma / mal-estar", "grava a hora, mesmo sem internet", Icone.Alerta, Cor.Ecg) { ir(Rota.MALESTAR) } }
        item { BotaoSecao("Check-in", "como você está", Icone.Checkin, Cor.Acao) { ir(Rota.CHECKIN) } }
        item { BotaoSecao("Hábitos", "café, álcool, remédio, água", Icone.Cafe, Cor.Habito) { ir(Rota.HABITOS) } }
        item { BotaoSecao("Ver registros", null, Icone.Lista, Cor.Registro) { ir(Rota.REGISTROS) } }
    }
}

@Composable
fun TelaTreinos(ir: (String) -> Unit) {
    TelaLista {
        item { Cabecalho("Treinos", Cor.Atencao) }
        item { Nota("Grave o treino no Samsung Health do relógio: o Saúde NT importa sozinho e mostra zonas e carga no celular.") }
        item { BotaoSecao("Sessão com recuperação", "em breve · Laboratório de Recuperação", Icone.Cronometro, Cor.Atencao, habilitado = false) {} }
        item { BotaoSecao("Teste em pé", "ortostático · 5 min", Icone.EmPe, Cor.Coracao) { ir(Rota.ORTOSTATICO) } }
        item { BotaoSecao("Coração agora", null, Icone.Coracao, Cor.Coracao) { ir(Rota.CORACAO) } }
    }
}

@Composable
fun TelaMais(ir: (String) -> Unit) {
    TelaLista {
        item { Cabecalho("Mais") }
        item { BotaoSecao("ECG", "30 s · dedo no botão", Icone.Ecg, Cor.Ecg) { ir(Rota.ECG) } }
        item { BotaoSecao("Respiração", "4-7-8 · ~1 min", Icone.Vento, Cor.Respira) { ir(Rota.RESPIRACAO) } }
        item { BotaoSecao("Teste em pé", "ortostático", Icone.EmPe, Cor.Coracao) { ir(Rota.ORTOSTATICO) } }
        item { BotaoSecao("VFC", "janelas de hoje", Icone.Vfc, Cor.Vfc) { ir(Rota.VFC) } }
        item { BotaoSecao("Sono", "resumo da noite", Icone.Lua, Cor.Sono) { ir(Rota.SONO) } }
        item { BotaoSecao("Registros", "histórico", Icone.Lista, Cor.Registro) { ir(Rota.REGISTROS) } }
        item { BotaoSecao("Diagnóstico", "coleta e envio", Icone.Sinal, Cor.TextoSec) { ir(Rota.DIAGNOSTICO) } }
        item { BotaoSecao("Laboratório técnico", "coleta para análise", Icone.Frasco, Cor.Lab) { ir(Rota.LABORATORIO) } }
        item { BotaoSecao("Conexão", "Nosso Tudo", Icone.Elo, Cor.Acao) { ir(Rota.CONECTAR) } }
    }
}

// ================================================================ Diagnóstico da coleta

@Composable
fun TelaDiagnostico() {
    val ctx = LocalContext.current
    val agora = relogioDaTela(3_000)
    val status = remember(agora) { Sync.status(ctx) }
    val diag = remember(agora) { runCatching { ColetaService.instancia?.diagSensor() }.getOrNull() }
    val ts by EstadoSaude.bpmTs.collectAsState()
    TelaLista {
        item { Cabecalho("Diagnóstico") }
        item {
            Column {
                LinhaInfo("Versão", app.nossotudo.saude.wear.BuildConfig.VERSION_NAME)
                LinhaInfo("Coleta contínua", if (ColetaService.rodando) "ligada" else "parada", if (ColetaService.rodando) Cor.Acao else Cor.Atencao)
                LinhaInfo("Sensor", diag?.optString("estado") ?: "—", if (diag?.optString("estado") == "RECEIVING") Cor.Acao else Cor.Atencao)
                LinhaInfo("Última leitura", "${horaSeg(ts)} (${idade(ts, agora)})")
                LinhaInfo("Último lote", horaSeg(EstadoSaude.ultimoLoteMs))
                diag?.let { d ->
                    LinhaInfo("Reconexões", "${d.optInt("reconexoes")}")
                    d.optJSONObject("alarme")?.let { a ->
                        LinhaInfo("Vigia (execuções)", "${a.optInt("executados")}")
                        LinhaInfo("Atraso do alarme", "${a.optLong("ultimo_atraso_s", -1).takeIf { it >= 0 } ?: "—"} s")
                    }
                }
                LinhaInfo("Último envio", if (status.ultimoEnvio > 0) "${hora(status.ultimoEnvio)} (${idade(status.ultimoEnvio, agora)})" else "nunca")
                LinhaInfo("Pendentes", "${status.pendentes}")
                status.erro?.let { LinhaInfo("Erro", it, Cor.Atencao) }
            }
        }
    }
}
