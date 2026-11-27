package app.nossotudo.saude.mobile

import android.content.Context
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/** Treino cronometrado no celular (persiste se o app fechar). */
private object Cronometro {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("cronometro", Context.MODE_PRIVATE)
    fun inicio(ctx: Context) = p(ctx).getLong("inicio", 0L)
    fun modalidade(ctx: Context) = p(ctx).getString("modalidade", null)
    fun iniciar(ctx: Context, m: String) = p(ctx).edit().putLong("inicio", System.currentTimeMillis()).putString("modalidade", m).apply()
    fun limpar(ctx: Context) = p(ctx).edit().clear().apply()
}

private fun duracaoRelogio(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) String.format(PT_BR, "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) else String.format(PT_BR, "%02d:%02d", s / 60, s % 60)
}

private val PERIODOS = listOf(7, 30, 90)

@Composable
fun TelaTreinos(nav: Nav, rolagem: ScrollState) {
    var periodo by rememberSaveable { mutableIntStateOf(0) }
    val dias = PERIODOS[periodo]
    val consulta = rememberConsulta("treinos", "dias" to dias)
    val c = consulta.valor
    val d = c.dados
    var aviso by remember { mutableStateOf<String?>(null) }

    TelaAba("Treinos", rolagem = rolagem, carregando = c.carregando && d != null, aoAtualizar = { consulta.recarregar() }) {
        Segmentado(listOf("7 dias", "30 dias", "90 dias"), periodo) { periodo = it }
        AvisoCache(c)
        aviso?.let { Etiqueta(it, T.Primaria) }
        CartaoCronometro { aviso = it; consulta.recarregar() }
        if (d == null) {
            if (c.falhou) EstadoVazio(Icons.Rounded.FitnessCenter, "Não foi possível carregar", "Sem conexão. Puxe para tentar de novo.", "Tentar de novo") { consulta.recarregar() } else CarregandoEsqueleto()
            return@TelaAba
        }
        val treinos = d.optJSONArray("treinos").objetos().filter { diaLocalDe(it.txt("inicio"))?.let { x -> !x.isBefore(LocalDate.now().minusDays(dias - 1L)) } ?: false }
        if (treinos.isEmpty()) {
            EstadoVazio(Icons.Rounded.FitnessCenter, "Nenhum treino no período", "Grave no Samsung Health do relógio ou use o cronômetro acima. Atividades detectadas pelo batimento aparecem na tela Hoje para confirmar.")
            return@TelaAba
        }
        CartaoPerformance(d, treinos, dias)
        CartaoEsportes(treinos)
        CartaoIntensidade(d, treinos)
        CartaoRecuperacaoCardiaca(d)
        TituloSecao("Histórico")
        Historico(treinos, nav)
        d.num("fcmax")?.let {
            TextoSec("Zonas pela FC máxima de ${it.roundToInt()} bpm (${if (d.optString("fcmax_fonte") == "manual") "definida por você" else "a maior vista em treino"}). Ajuste em Ajustes › Zonas cardíacas.", estilo = T.Legenda)
        }
    }
}

// ---------------------------------------------------------------- cronômetro

@Composable
private fun CartaoCronometro(aoSalvar: (String) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var inicio by remember { mutableLongStateOf(Cronometro.inicio(ctx)) }
    var modalidade by remember { mutableStateOf(Cronometro.modalidade(ctx) ?: "Jiu-jitsu") }
    var agora by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var escolhendo by remember { mutableStateOf(false) }
    var encerrando by remember { mutableStateOf(false) }
    var esforco by remember { mutableStateOf<Int?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    LaunchedEffect(inicio) { while (inicio > 0) { agora = System.currentTimeMillis(); delay(1000) } }

    if (inicio == 0L && !escolhendo) {
        Row(
            Modifier.fillMaxWidth().clip(T.Forma).background(T.Superficie).clickable(role = Role.Button) { escolhendo = true }
                .heightIn(min = 56.dp).padding(horizontal = T.e4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(32.dp).clip(CircleShape).background(T.Primaria.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.PlayArrow, null, tint = T.Primaria, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(T.e3))
            Column(Modifier.weight(1f)) {
                Text("Cronometrar um treino", style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto)
                Text("Para treinar sem gravar no relógio", style = T.Legenda, color = T.TextoSec)
            }
        }
        return
    }
    Cartao {
        if (inicio == 0L) {
            CabecalhoCartao("Qual modalidade?", Icons.Rounded.Timer, T.TextoSec)
            Chips(Modalidade.TODAS, modalidade, { Modalidade.cor(it) }) { modalidade = it }
            Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                BotaoPrimario("Iniciar", Modifier.weight(1f), icone = Icons.Rounded.PlayArrow) { Cronometro.iniciar(ctx, modalidade); inicio = Cronometro.inicio(ctx); escolhendo = false }
                BotaoSecundario("Cancelar", Modifier.weight(1f)) { escolhendo = false }
            }
            TextoSec("O batimento vem do relógio na próxima sincronização.", estilo = T.Legenda)
        } else {
            CabecalhoCartao("$modalidade em andamento", Modalidade.icone(modalidade), Modalidade.cor(modalidade))
            Text(duracaoRelogio(agora - inicio), style = T.Destaque, color = T.Texto, modifier = Modifier.semantics { contentDescription = "Tempo decorrido ${duracaoRelogio(agora - inicio)}" })
            TextoSec("começou às ${horaDe(java.time.Instant.ofEpochMilli(inicio).toString())}", estilo = T.Legenda)
            if (!encerrando) Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                BotaoPrimario("Encerrar", Modifier.weight(1f), icone = Icons.Rounded.Stop) { encerrando = true }
                BotaoSecundario("Descartar", Modifier.weight(1f)) { Cronometro.limpar(ctx); inicio = 0 }
            } else {
                Text("Esforço percebido (RPE)", style = T.Descricao, color = T.Texto)
                TextoSec("0 = repouso · 5 = puxado · 10 = máximo", estilo = T.Legenda)
                Chips((0..10).map { it.toString() }, esforco?.toString(), { T.Primaria }) { esforco = it.toInt() }
                BotaoPrimario("Salvar treino", Modifier.fillMaxWidth(), habilitado = !ocupado) {
                    escopo.launch {
                        ocupado = true
                        val fim = System.currentTimeMillis()
                        val curto = fim - inicio < 3 * 60_000L
                        val r = if (curto) null else chamar(ctx, "treino") {
                            put("inicio", inicio).put("fim", fim).put("modalidade", modalidade).put("manual", true); esforco?.let { put("esforco", it) }
                        }
                        ocupado = false
                        if (r != null) { aoSalvar("$modalidade salvo (${duracaoRelogio(fim - inicio)})"); Cronometro.limpar(ctx); inicio = 0; encerrando = false; esforco = null }
                        else aoSalvar(if (curto) "Treino muito curto (menos de 3 min)" else "Sem conexão — tente salvar de novo")
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- performance

private data class Barra(val rotulo: String, val carga: Int, val minutos: Int, val mods: List<String>)

private fun barras(treinos: List<JSONObject>, dias: Int): List<Barra> {
    val hoje = LocalDate.now()
    val porDia = treinos.groupBy { diaLocalDe(it.txt("inicio")) }
    fun barra(rot: String, l: List<JSONObject>) = Barra(rot, l.sumOf { it.optInt("carga") }, l.sumOf { it.optInt("minutos") }, l.map { it.txt("modalidade") ?: "Outro" }.distinct())
    if (dias <= 30) return (dias - 1 downTo 0).map { k ->
        val dia = hoje.minusDays(k.toLong())
        barra(if (dias == 7) dia.format(DateTimeFormatter.ofPattern("EEE", PT_BR)).replace(".", "") else dia.format(DateTimeFormatter.ofPattern("dd/MM")), porDia[dia].orEmpty())
    }
    return (12 downTo 0).map { k ->
        val ini = hoje.minusDays(k * 7L + 6); val fim = hoje.minusDays(k * 7L)
        barra("${ini.format(DateTimeFormatter.ofPattern("dd/MM"))}", treinos.filter { t -> diaLocalDe(t.txt("inicio"))?.let { !it.isBefore(ini) && !it.isAfter(fim) } ?: false })
    }
}

@Composable
private fun CartaoPerformance(d: JSONObject, treinos: List<JSONObject>, dias: Int) {
    val minutos = treinos.sumOf { it.optInt("minutos") }
    val carga = treinos.sumOf { it.optInt("carga") }
    val vigoroso = treinos.sumOf { t -> t.optJSONArray("zonas").ints().let { z -> if (z.size == 5) z[3] + z[4] else 0 } }
    val b = barras(treinos, dias)
    var sel by remember(dias) { mutableStateOf<Int?>(null) }
    val rec = d.optJSONObject("recuperacao")
    val prontoEm = instante(rec?.txt("pronto_em"))
    Cartao {
        Text(horasMin(minutos.toDouble()) + " de atividade", style = T.Valor, color = T.Texto)
        TextoSec("${treinos.size} sessões em $dias dias")
        Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
            Estatistica("$carga", "carga acumulada (FC)", Modifier.weight(1f))
            Estatistica(horasMin(vigoroso.toDouble()), "em intensidade vigorosa", Modifier.weight(1f))
            val restante = prontoEm?.let { ChronoUnit.MINUTES.between(java.time.Instant.now(), it) }
            Estatistica(
                when { rec == null -> "—"; restante == null || restante <= 0 -> "concluída"; else -> "~${(restante / 60.0).roundToInt().coerceAtLeast(1)} h" },
                "recuperação (estimativa)", Modifier.weight(1f),
            )
        }
        GraficoTendencia(
            b.map { Ponto(it.rotulo, it.carga.toDouble()) }, T.Primaria, { "${it.roundToInt()}" }, barras = true, altura = 150.dp, vaoMinimo = 20.0,
            aoSelecionar = { sel = it },
        )
        val s = sel?.let { b.getOrNull(it) }
        if (s != null) TextoSec(
            if (s.minutos == 0) "${s.rotulo}: sem treino registrado" else "${s.rotulo}: ${horasMin(s.minutos.toDouble())} · carga ${s.carga} · ${s.mods.joinToString(", ")}",
            cor = T.Texto,
        ) else TextoSec(if (dias == 90) "Carga por semana · toque numa barra para detalhes" else "Carga por dia · toque numa barra para detalhes", estilo = T.Legenda)
        // comparação com a média só com histórico suficiente
        val media = d.num("carga_media_semana")
        val c7 = d.optJSONObject("ultimos7")?.optInt("carga") ?: 0
        if (media != null && media > 0) {
            val r = c7 / media
            TextoSec("Carga 7 dias ${fmt(r, 1)}× a sua média semanal" + if (r > 1.5) " — bem acima do habitual." else if (r > 1.3) " — acima do habitual." else ".", cor = if (r > 1.3) T.Atencao else T.TextoSec, estilo = T.Legenda)
        } else {
            val dh = d.optInt("carga_historico_dias")
            TextoSec("Comparação com a sua média (sobrecarga) a partir de 3 semanas de histórico" + if (dh < 21) " — faltam ${21 - dh} dias." else ".", estilo = T.Legenda)
        }
        TextoSec("Recuperação estimada é uma referência esportiva pela carga, não uma liberação médica.", estilo = T.Legenda, cor = T.TextoTer)
    }
}

@Composable
private fun CartaoEsportes(treinos: List<JSONObject>) {
    val porMod = treinos.groupBy { it.txt("modalidade") ?: "Outro" }.mapValues { (_, l) -> l.sumOf { it.optInt("minutos") } }.toList().sortedByDescending { it.second }
    val total = porMod.sumOf { it.second }.takeIf { it > 0 } ?: return
    Cartao {
        CabecalhoCartao("Distribuição dos esportes")
        Row(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp))) {
            porMod.forEach { (m, v) -> Box(Modifier.weight(v.toFloat() / total).fillMaxHeight().background(Modalidade.cor(m))) }
        }
        porMod.forEach { (m, v) ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 32.dp).semantics(mergeDescendants = true) {}) {
                Icon(Modalidade.icone(m), null, tint = Modalidade.cor(m), modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(T.e2))
                Text(m, style = T.Corpo, color = T.Texto, modifier = Modifier.weight(1f))
                Text("${horasMin(v.toDouble())} · ${v * 100 / total}%", style = T.Descricao.copy(fontFeatureSettings = "tnum"), color = T.TextoSec)
            }
        }
    }
}

@Composable
private fun CartaoIntensidade(d: JSONObject, treinos: List<JSONObject>) {
    val z = IntArray(5)
    treinos.forEach { t -> t.optJSONArray("zonas").ints().forEachIndexed { i, v -> if (i < 5) z[i] += v } }
    val poucoConfiavel = treinos.filter { Modalidade.fcPoucoConfiavel(it.txt("modalidade")) }.sumOf { it.optInt("medidos") }
    Cartao {
        CabecalhoCartao("Intensidade por zona de FC")
        ZonasDetalhadas(z.toList(), d.optJSONArray("zonas_bpm").ints())
        val semLeitura = treinos.sumOf { it.optInt("minutos") } - z.sum()
        if (semLeitura > 0) TextoSec("${horasMin(semLeitura.toDouble())} de treino sem leitura de batimento (fora das zonas).", estilo = T.Legenda)
        if (poucoConfiavel > 0) IndicadorQualidade("${horasMin(poucoConfiavel.toDouble())} em natação/lutas: FC de pulso menos precisa", Estado.ATENCAO)
    }
}

@Composable
private fun CartaoRecuperacaoCardiaca(d: JSONObject) {
    val lista = d.optJSONArray("hrr").objetos()
    Cartao {
        CabecalhoCartao("Recuperação cardíaca", Icons.Rounded.FavoriteBorder, T.Fc)
        if (lista.isEmpty()) {
            TextoSec("Aparece depois de treinos fortes (FC no fim ≥ ${d.optInt("hrr_limiar", 135)} bpm). Ao encerrar, mantenha o relógio firme e fique parado ou caminhe devagar por 2 min.")
            return@Cartao
        }
        val u = lista.last()
        val q = u.optInt("queda1")
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${kotlin.math.abs(q)} bpm", style = T.Valor, color = T.Texto)
            TextoSec("  ${if (q >= 0) "de queda" else "de subida"} em ~1 min · ${u.optString("modalidade", "treino")} ${diaDe(u.txt("inicio"))}", modifier = Modifier.padding(bottom = 3.dp))
        }
        if (u.optString("qualidade") == "limitada") IndicadorQualidade("Poucas leituras nesses minutos", Estado.ATENCAO)
        if (lista.size >= 2) GraficoTendencia(lista.map { Ponto(diaDe(it.txt("inicio")), it.num("queda1"), it.optString("qualidade") == "limitada") }, T.Fc, { "${it.roundToInt()} bpm" }, barras = true, altura = 120.dp, vaoMinimo = 10.0, formatarEixo = { "${it.roundToInt()}" })
        TextoSec(
            "Queda = FC do fim − FC ~1 min depois (positivo é queda). Calculada com médias por minuto do relógio: é aproximada, não é a recuperação cardíaca padronizada (que mede o instante exato do fim e 60 s depois).",
            estilo = T.Legenda,
        )
    }
}

// ---------------------------------------------------------------- histórico

@Composable
private fun Historico(treinos: List<JSONObject>, nav: Nav) {
    val porDia = treinos.groupBy { diaLocalDe(it.txt("inicio")) }.toSortedMap(compareByDescending { it })
    Cartao(padding = T.e2) {
        var primeiro = true
        porDia.forEach { (dia, lista) ->
            if (!primeiro) Divisor()
            primeiro = false
            Text(dia?.let { cabecalhoDia(it) } ?: "—", style = T.Rotulo, color = T.TextoSec, modifier = Modifier.padding(start = T.e2, top = T.e2))
            lista.forEach { t -> LinhaTreino(t) { nav.abrir(Rota.TreinoDetalhe(t.getString("id"))) } }
        }
    }
}

@Composable
private fun LinhaTreino(t: JSONObject, aoTocar: () -> Unit) {
    val m = t.txt("modalidade") ?: "Outro"
    val det = listOfNotNull(
        t.num("distancia_m")?.takeIf { it >= 100 }?.let { if (it >= 1000) "${fmt(it / 1000, 2)} km" else "${it.roundToInt()} m" },
        t.num("fc_media")?.let { "FC média ${it.roundToInt()}" },
        t.num("fc_pico")?.let { "pico ${it.roundToInt()}" },
    ).joinToString(" · ").ifEmpty { "sem batimento medido" }
    Row(
        Modifier.fillMaxWidth().clip(T.FormaPeq).clickable(role = Role.Button, onClick = aoTocar).heightIn(min = 56.dp).padding(horizontal = T.e2, vertical = 6.dp)
            .semantics(mergeDescendants = true) { contentDescription = "$m, ${t.optInt("minutos")} minutos, $det, carga ${t.optInt("carga")}. Abrir detalhes." },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Modalidade.cor(m).copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
            Icon(Modalidade.icone(m), null, tint = Modalidade.cor(m), modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(T.e3))
        Column(Modifier.weight(1f)) {
            Text("$m — ${t.optInt("minutos")} min", style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(det, style = T.Legenda, color = T.TextoSec, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${t.optInt("carga")}", style = T.ValorPeq, color = T.Texto)
            Text("carga", style = T.Legenda, color = T.TextoTer)
        }
    }
}

// ---------------------------------------------------------------- detalhe do treino

@Composable
fun TelaTreinoDetalhe(id: String, nav: Nav) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val consulta = rememberConsulta("treino_detalhe", "id" to id)
    val d = consulta.valor.dados
    val t = d?.optJSONObject("treino")
    val m = t?.txt("modalidade") ?: "Outro"
    var aviso by remember { mutableStateOf<String?>(null) }
    var confirmarExcluir by remember { mutableStateOf(false) }

    TelaDetalhe(m, t?.let { "${diaDe(it.txt("inicio"))} · ${horaDe(it.txt("inicio"))}–${horaDe(it.txt("fim"))}" }, nav) {
        if (t == null) {
            if (consulta.valor.falhou) EstadoVazio(Icons.Rounded.FitnessCenter, "Não foi possível carregar", "Sem conexão.", "Tentar de novo") { consulta.recarregar() } else CarregandoEsqueleto()
            return@TelaDetalhe
        }
        aviso?.let { Etiqueta(it, T.Primaria) }
        val limites = d.optJSONArray("zonas_bpm").ints()
        Cartao {
            Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
                Estatistica("${t.optInt("minutos")} min", "duração", Modifier.weight(1f))
                Estatistica(t.num("fc_media")?.let { "${it.roundToInt()}" } ?: "—", "FC média", Modifier.weight(1f))
                Estatistica(t.num("fc_pico")?.let { "${it.roundToInt()}" } ?: "—", "FC máxima", Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
                Estatistica(t.num("distancia_m")?.takeIf { it >= 100 }?.let { if (it >= 1000) "${fmt(it / 1000, 2)} km" else "${it.roundToInt()} m" } ?: "—", "distância", Modifier.weight(1f))
                Estatistica("${t.optInt("carga")}", "carga (FC)", Modifier.weight(1f))
                Estatistica(t.num("carga_rpe")?.let { "${it.roundToInt()}" } ?: "—", "carga (RPE × min)", Modifier.weight(1f))
            }
            t.num("calorias")?.let { TextoSec("${it.roundToInt()} kcal (Samsung Health)", estilo = T.Legenda) }
        }
        // curva de FC
        val serie = d.optJSONArray("serie").objetos()
        Cartao {
            CabecalhoCartao("Frequência cardíaca", Icons.Rounded.FavoriteBorder, T.Fc)
            if (serie.isEmpty()) TextoSec("Sem batimento medido neste treino.") else {
                fun zona(b: Double) = when { limites.size < 4 -> ""; b < limites[0] -> " · Z1"; b < limites[1] -> " · Z2"; b < limites[2] -> " · Z3"; b < limites[3] -> " · Z4"; else -> " · Z5" }
                GraficoTendencia(
                    serie.map { Ponto(horaDe(it.txt("t")), it.num("bpm"), it.optInt("n") < 20) }, T.Fc, { "${it.roundToInt()} bpm${zona(it)}" },
                    altura = 200.dp, vaoMinimo = 30.0, formatarEixo = { "${it.roundToInt()}" },
                )
                TextoSec("Média por minuto, de 3 min antes a 6 min depois. Minutos com poucas leituras aparecem vazados. Toque ou deslize para ver valores.", estilo = T.Legenda)
            }
        }
        Cartao {
            CabecalhoCartao("Tempo por zona")
            ZonasDetalhadas(t.optJSONArray("zonas").ints(), limites)
        }
        // recuperação
        Cartao {
            CabecalhoCartao("Recuperação após o esforço")
            val r = t.optJSONObject("recuperacao")
            if (r != null) {
                val q1 = r.optInt("queda1")
                Text("De ${r.optInt("fc_fim")} bpm ${if (q1 >= 0) "caiu" else "subiu"} ${kotlin.math.abs(q1)} em ~1 min" + (r.num("queda2")?.let { " e ${if (it >= 0) "caiu" else "subiu"} ${kotlin.math.abs(it).roundToInt()} em ~2 min" } ?: ""), style = T.Corpo, color = T.Texto)
                if (r.optString("qualidade") == "limitada") IndicadorQualidade("Poucas leituras nesses minutos", Estado.ATENCAO)
                TextoSec("Valor descritivo, pelas médias por minuto. Só compare com treinos parecidos.", estilo = T.Legenda)
            } else TextoSec(
                when {
                    m == "Natação" -> "Não medida: na água o sensor de pulso não é confiável."
                    (t.num("fc_pico") ?: 0.0) < 100 -> "Não medida: o esforço terminou com FC baixa."
                    else -> "Não medida: faltaram leituras confiáveis logo depois do fim (relógio frouxo, movimento ou outro treino em seguida)."
                },
            )
        }
        EditorTreino(t) { campos ->
            escopo.launch {
                val ok = chamar(ctx, "treino_editar") { put("id", id); campos(this) } != null
                aviso = if (ok) "Salvo" else "Não deu para salvar"
                if (ok) consulta.recarregar()
            }
        }
        // fonte e qualidade
        Cartao {
            CabecalhoCartao("Fonte e qualidade")
            LinhaInfo("Origem", when (t.optString("origem")) { "samsung" -> "Samsung Health"; "manual" -> "Cronômetro do celular"; "detectado" -> "Detectado pelo batimento"; else -> t.optString("origem") })
            val minutos = t.optInt("minutos").coerceAtLeast(1); val medidos = t.optInt("medidos").coerceAtMost(minutos)
            LinhaInfo("Minutos com batimento", "$medidos de $minutos (${medidos * 100 / minutos}%)", if (medidos * 100 / minutos < 70) T.Atencao else T.Texto)
            if (t.optBoolean("fc_confiavel", true).not()) IndicadorQualidade("FC de pulso menos precisa em ${m.lowercase()}", Estado.ATENCAO)
            TextoSec("Carga (FC): minutos ponderados pela FC (100–119 = 1, 120–139 = 2, 140–159 = 3, ≥ 160 = 4). Carga (RPE × min): esforço percebido × duração. São unidades diferentes e não se somam.", estilo = T.Legenda)
        }
        BotaoSecundario("Excluir treino", Modifier.fillMaxWidth(), cor = T.Alerta, icone = Icons.Rounded.Delete) { confirmarExcluir = true }
    }
    if (confirmarExcluir) AlertDialog(
        onDismissRequest = { confirmarExcluir = false }, containerColor = T.Elevada,
        title = { Text("Excluir este treino?", color = T.Texto) },
        text = { Text("Ele sai do histórico, das zonas e da carga. Treinos do Samsung Health ficam marcados como descartados e não voltam na próxima sincronização.", color = T.TextoSec) },
        confirmButton = {
            TextButton(onClick = {
                confirmarExcluir = false
                escopo.launch { if (chamar(ctx, "treino_editar") { put("id", id).put("descartar", true) } != null) nav.voltar() else aviso = "Não deu para excluir" }
            }) { Text("Excluir", color = T.Alerta) }
        },
        dismissButton = { TextButton(onClick = { confirmarExcluir = false }) { Text("Cancelar", color = T.TextoSec) } },
    )
}

/** Modalidade, RPE, observações e — em lutas — técnica × randori/rolas. */
@Composable
private fun EditorTreino(t: JSONObject, salvar: (JSONObject.() -> Unit) -> Unit) {
    var modalidade by remember(t) { mutableStateOf(t.txt("modalidade")) }
    var rpe by remember(t) { mutableStateOf(t.num("esforco")?.roundToInt()) }
    var nota by remember(t) { mutableStateOf(t.txt("nota") ?: "") }
    var tecnica by remember(t) { mutableStateOf(t.num("tecnica_min")?.roundToInt()?.toString() ?: "") }
    var randori by remember(t) { mutableStateOf(t.num("randori_min")?.roundToInt()?.toString() ?: "") }
    val luta = modalidade == "Judô" || modalidade == "Jiu-jitsu"
    Cartao {
        CabecalhoCartao("Seu registro")
        Text("Modalidade", style = T.Descricao, color = T.TextoSec)
        Chips(Modalidade.TODAS, modalidade, { Modalidade.cor(it) }) { modalidade = it }
        Text("Esforço percebido (RPE 0–10)", style = T.Descricao, color = T.TextoSec)
        Chips((0..10).map { it.toString() }, rpe?.toString(), { T.Primaria }) { rpe = it.toInt() }
        if (luta) {
            Text(if (modalidade == "Judô") "Técnica × randori (min)" else "Técnica × rolas (min)", style = T.Descricao, color = T.TextoSec)
            Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                OutlinedTextField(tecnica, { tecnica = it.filter(Char::isDigit).take(3) }, label = { Text("Técnica") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                OutlinedTextField(randori, { randori = it.filter(Char::isDigit).take(3) }, label = { Text(if (modalidade == "Judô") "Randori" else "Rolas") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
            }
        }
        OutlinedTextField(nota, { nota = it.take(500) }, label = { Text("Observações") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        BotaoPrimario("Salvar alterações", Modifier.fillMaxWidth()) {
            salvar {
                modalidade?.let { put("modalidade", it) }
                rpe?.let { put("esforco", it) }
                put("nota", nota)
                if (luta) { put("tecnica_min", tecnica.toIntOrNull() ?: JSONObject.NULL); put("randori_min", randori.toIntOrNull() ?: JSONObject.NULL) }
            }
        }
    }
}
