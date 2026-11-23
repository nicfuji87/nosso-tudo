package app.nossotudo.saude.mobile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Scale
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

private val PERIODO_DIAS = listOf(7, 30, 90)
private fun rotuloNoite(s: String?) = dataLocal(s)?.format(DateTimeFormatter.ofPattern("dd/MM")) ?: "—"

/** Série de uma métrica por noite, alinhada dia a dia no período (lacunas = null, nunca zero). */
fun serieNoites(noites: List<JSONObject>, campo: String, dias: Int, suspeito: (JSONObject) -> Boolean = { false }): List<Ponto> {
    val m = noites.associateBy { it.optString("noite") }
    return (dias - 1 downTo 0).map { k ->
        val d = LocalDate.now().minusDays(k.toLong())
        val n = m[d.toString()]
        Ponto(d.format(DateTimeFormatter.ofPattern("dd/MM")), n?.num(campo), n?.let(suspeito) ?: false)
    }
}
fun serieDias(lista: List<JSONObject>, campo: String, dias: Int): List<Ponto> {
    val m = lista.associateBy { it.optString("dia") }
    return (dias - 1 downTo 0).map { k ->
        val d = LocalDate.now().minusDays(k.toLong())
        Ponto(d.format(DateTimeFormatter.ofPattern("dd/MM")), m[d.toString()]?.num(campo))
    }
}

private fun campoDe(m: Metrica) = when (m) {
    Metrica.FC -> "fc"; Metrica.VFC -> "vfc"; Metrica.SONO -> "sono_h"; Metrica.SPO2 -> "spo2"; Metrica.PELE -> "pele"
    Metrica.PASSOS -> "total"; Metrica.ENERGIA -> "score"
}
private fun suspeitoDe(m: Metrica): (JSONObject) -> Boolean = when (m) {
    Metrica.SONO -> { n -> n.optString("sono_qualidade") == "suspeito" }
    Metrica.VFC -> { n -> (n.num("vfc_janelas") ?: 99.0) < 12 }
    else -> { _ -> false }
}
private fun normalDe(m: Metrica, normais: JSONObject?) = when (m) {
    Metrica.FC -> normais?.num("fc"); Metrica.VFC -> normais?.num("vfc"); Metrica.PELE -> normais?.num("pele")
    Metrica.SPO2 -> normais?.num("spo2"); Metrica.SONO -> 7.0; else -> null
}
private fun vaoDe(m: Metrica) = when (m) { Metrica.FC -> 10.0; Metrica.VFC -> 15.0; Metrica.SONO -> 3.0; Metrica.SPO2 -> 6.0; Metrica.PELE -> 1.5; Metrica.PASSOS -> 4000.0; Metrica.ENERGIA -> 30.0 }

/** Série do período, sem o trecho inicial vazio (antes do primeiro dado), com no mínimo 7 pontos. */
fun pontosDe(m: Metrica, d: JSONObject, dias: Int): List<Ponto> {
    val p = pontosBrutos(m, d, dias)
    val primeiro = p.indexOfFirst { it.valor != null }
    return if (primeiro <= 0) p else p.drop(minOf(primeiro, p.size - 7).coerceAtLeast(0))
}
fun pontosBrutos(m: Metrica, d: JSONObject, dias: Int): List<Ponto> = when (m) {
    Metrica.PASSOS -> serieDias(d.optJSONArray("passos").objetos(), "total", dias)
    Metrica.ENERGIA -> serieDias(d.optJSONArray("energia").objetos(), "score", dias)
    else -> serieNoites(d.optJSONArray("noites").objetos(), campoDe(m), dias, suspeitoDe(m))
}

private val EXPLICA = mapOf(
    Metrica.FC to "Menor média da noite medida pelo relógio. Subir 3+ bpm acima do seu normal por 2 noites costuma acompanhar treino pesado, sono curto, álcool ou início de infecção — sem causa definida.",
    Metrica.VFC to "RMSSD dos intervalos entre batimentos durante o sono, só de trechos com boa captação. Maior costuma ser melhor; compare apenas com você mesmo.",
    Metrica.SONO to "Tempo dormido (profundo + REM + leve) do Samsung Health — não inclui acordado nem tempo sem fase. A meta é 7 h.",
    Metrica.SPO2 to "Média noturna do Samsung Health. Mínimas isoladas no pulso costumam ser artefato (movimento, pulseira frouxa); quedas repetidas em várias noites valem o teste de apneia do Samsung Health Monitor.",
    Metrica.PELE to "Mediana da temperatura da pele durante o sono. O que importa é a diferença para o seu normal: +0,5 °C ou mais junto com repouso alto merece observação.",
    Metrica.PASSOS to "Total diário do Samsung Health. 7.000 a 10.000 passos por dia já trazem a maior parte do benefício.",
    Metrica.ENERGIA to "Índice da Samsung (não é calculado pelo Saúde NT). Útil para comparar com a sua prontidão.",
)

@Composable
fun TelaSaude(nav: Nav, rolagem: ScrollState) {
    var periodo by rememberSaveable { mutableIntStateOf(1) }
    val dias = PERIODO_DIAS[periodo]
    val consulta = rememberConsulta("tendencias", "dias" to 90)
    val c = consulta.valor
    val d = c.dados
    TelaAba("Saúde", rolagem = rolagem, carregando = c.carregando && d != null, aoAtualizar = { consulta.recarregar() }) {
        Segmentado(listOf("7D", "30D", "90D"), periodo) { periodo = it }
        AvisoCache(c)
        if (d == null) {
            if (c.falhou) EstadoVazio(Icons.Rounded.MonitorHeart, "Não foi possível carregar", "Sem conexão. Puxe para tentar de novo.", "Tentar de novo") { consulta.recarregar() } else CarregandoEsqueleto()
            return@TelaAba
        }
        CartaoRadar(d, nav)
        listOf(Metrica.FC, Metrica.VFC).forEach { CartaoTendencia(it, d, dias) { nav.abrir(Rota.MetricaDetalhe(it)) } }
        CartaoSonoResumo(d, dias, nav)
        listOf(Metrica.SPO2, Metrica.PELE, Metrica.PASSOS, Metrica.ENERGIA).forEach { CartaoTendencia(it, d, dias) { nav.abrir(Rota.MetricaDetalhe(it)) } }
        CartaoCorpo(d)
        CartaoMonitor(d)
        TextoSec("Dados de bem-estar medidos no pulso. Não substituem avaliação médica. Em dor no peito, desmaio ou falta de ar, procure atendimento.", estilo = T.Legenda)
    }
}

// ---------------------------------------------------------------- radar

@Composable
private fun CartaoRadar(d: JSONObject, nav: Nav) {
    val noites = d.optJSONArray("noites").objetos()
    val normais = d.optJSONObject("normais")
    val hoje = LocalDate.now().toString()
    val n = noites.lastOrNull { it.optString("noite") == hoje }
    data class Item(val m: Metrica, val estado: Estado, val texto: String)
    val itens = listOf(Metrica.FC, Metrica.VFC, Metrica.PELE, Metrica.SPO2, Metrica.SONO).map { m ->
        val campo = campoDe(m)
        val v = n?.num(campo)
        when {
            n == null || v == null -> Item(m, Estado.SEM_DADO, "sem leitura desta noite")
            suspeitoDe(m)(n) -> Item(m, Estado.SEM_DADO, if (m == Metrica.SONO) "registro contraditório" else "leitura suspeita")
            else -> {
                val va = variacao(v, normalDe(m, normais), m)
                Item(m, va?.estado ?: Estado.NEUTRO, "${valorFmt(v, m)}${if (m.unidade.isNotEmpty() && m != Metrica.SONO) " ${m.unidade}" else ""} · ${va?.texto ?: "sem referência"}")
            }
        }
    }
    val estaveis = itens.count { it.estado == Estado.NEUTRO || it.estado == Estado.BOM }
    val atencao = itens.count { it.estado == Estado.ATENCAO || it.estado == Estado.ALERTA }
    val semDado = itens.count { it.estado == Estado.SEM_DADO }
    val base = normais?.num("base")?.roundToInt() ?: 0
    Cartao {
        CabecalhoCartao("Radar de saúde · noite de hoje", Icons.Rounded.Radar, T.TextoSec)
        Row(horizontalArrangement = Arrangement.spacedBy(T.e4)) {
            Estatistica("$estaveis", "estáveis", cor = T.Primaria)
            Estatistica("$atencao", if (atencao == 1) "merece atenção" else "merecem atenção", cor = if (atencao > 0) T.Atencao else T.TextoSec)
            Estatistica("$semDado", "sem dado confiável", cor = T.TextoSec)
        }
        itens.forEach { i ->
            Row(
                Modifier.fillMaxWidth().clip(T.FormaPeq).clickable(role = Role.Button) {
                    if (i.m == Metrica.SONO) nav.abrir(Rota.SonoDetalhe(null)) else nav.abrir(Rota.MetricaDetalhe(i.m))
                }.heightIn(min = 40.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (i.estado == Estado.SEM_DADO) T.TextoTer else corDoEstado(i.estado).takeIf { i.estado != Estado.NEUTRO } ?: T.Primaria))
                Spacer(Modifier.width(T.e3))
                Text(i.m.curto, style = T.Descricao, color = T.Texto, modifier = Modifier.width(92.dp))
                Text(i.texto, style = T.Legenda, color = T.TextoSec, modifier = Modifier.weight(1f))
            }
        }
        TextoSec(
            (if (base < 7) "Referência provisória ($base de 7 noites). " else "") +
                "Desvio da sua média pessoal não é anormalidade clínica; \"sem dado confiável\" é problema de coleta, não do corpo.",
            estilo = T.Legenda,
        )
    }
}

// ---------------------------------------------------------------- cartão de tendência

@Composable
fun CartaoTendencia(m: Metrica, d: JSONObject, dias: Int, aoAbrir: (() -> Unit)?) {
    val pts = pontosDe(m, d, dias)
    val todos90 = pontosDe(m, d, 90).map { it.valor }
    val normal = normalDe(m, d.optJSONObject("normais"))
    val ultimo = pts.lastOrNull { it.valor != null }
    val m7 = pts.takeLast(7).mapNotNull { it.valor }.takeIf { it.isNotEmpty() }?.average()
    val m30 = pontosDe(m, d, 30).mapNotNull { it.valor }.takeIf { it.size >= 7 }?.average()
    Cartao(onClick = aoAbrir) {
        CabecalhoCartao(m.nome, m.icone, m.cor)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(ultimo?.valor?.let { valorFmt(it, m) } ?: "—", style = T.Valor, color = T.Texto)
            if (m.unidade.isNotEmpty() && m != Metrica.SONO && ultimo != null) Text(" ${m.unidade}", style = T.Descricao, color = T.TextoSec, modifier = Modifier.padding(bottom = 3.dp))
            Spacer(Modifier.width(T.e2))
            val va = variacao(ultimo?.valor, normal, m)
            if (va != null && ultimo?.suspeito != true) Text(va.texto, style = T.Legenda, color = corDoEstado(va.estado), modifier = Modifier.padding(bottom = 4.dp))
            if (ultimo?.suspeito == true) IndicadorQualidade("leitura suspeita", Estado.ATENCAO)
        }
        GraficoTendencia(
            pts, m.cor, { valorFmt(it, m) }, normal = if (m == Metrica.PASSOS || m == Metrica.ENERGIA) null else normal,
            faixa = if (m == Metrica.SONO || m == Metrica.PASSOS || m == Metrica.ENERGIA) null else faixaHabitual(todos90),
            mediaMovel = if (dias >= 30 && m != Metrica.PASSOS) mediaMovel(pts.map { it.valor }) else null,
            barras = m == Metrica.PASSOS || m == Metrica.SONO, vaoMinimo = vaoDe(m), zeroNaBase = m == Metrica.PASSOS || m == Metrica.SONO,
            formatarEixo = if (m == Metrica.PASSOS) { v -> if (v >= 1000) "${fmt(v / 1000, 0)} mil" else fmt(v, 0) } else if (m == Metrica.SONO) { v -> "${fmt(v, 0)} h" } else null,
        )
        if (pts.size < dias) TextoSec("Histórico desde ${pts.firstOrNull()?.rotulo ?: "—"}.", estilo = T.Legenda, cor = T.TextoTer)
        TextoSec(
            listOfNotNull(
                ultimo?.let { "última ${it.rotulo}" }, m7?.let { "média 7 d ${valorFmt(it, m)}" }, m30?.let { "30 d ${valorFmt(it, m)}" },
                normal?.takeIf { m != Metrica.SONO }?.let { "normal ${valorFmt(it, m)}" },
            ).joinToString(" · "),
            estilo = T.Legenda,
        )
    }
}

// ---------------------------------------------------------------- sono (resumo na aba)

@Composable
private fun CartaoSonoResumo(d: JSONObject, dias: Int, nav: Nav) {
    val noites = d.optJSONArray("noites").objetos().filter { it.num("sono_h") != null }
    val ult = noites.lastOrNull()
    val pts = pontosDe(Metrica.SONO, d, dias)
    val validas = noites.takeLast(7).filter { it.optString("sono_qualidade") != "suspeito" }.mapNotNull { it.num("sono_h") }
    Cartao(onClick = { nav.abrir(Rota.SonoDetalhe(null)) }) {
        CabecalhoCartao("Sono", Icons.Rounded.Bedtime, T.Sono)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(ult?.num("sono_h")?.let { horasMin(it * 60) } ?: "—", style = T.Valor, color = T.Texto)
            Spacer(Modifier.width(T.e2))
            TextoSec(ult?.let { "dormidas · ${noiteCurta(it.optString("noite"))}" } ?: "sem sono registrado", modifier = Modifier.padding(bottom = 3.dp))
        }
        when (ult?.optString("sono_qualidade")) {
            "suspeito" -> IndicadorQualidade(ult.txt("sono_motivo") ?: "registro contraditório", Estado.ATENCAO)
            "incompleto" -> IndicadorQualidade(ult.txt("sono_motivo") ?: "fases incompletas", Estado.NEUTRO)
        }
        GraficoTendencia(pts, T.Sono, { horasMin(it * 60) }, normal = 7.0, barras = true, vaoMinimo = 3.0, altura = 150.dp, formatarEixo = { "${fmt(it, 0)} h" })
        TextoSec(
            listOfNotNull(validas.takeIf { it.isNotEmpty() }?.average()?.let { "média 7 noites ${horasMin(it * 60)}" }, "meta 7h00", "tracejado = meta").joinToString(" · "),
            estilo = T.Legenda,
        )
        LinkAcao("Ver fases, horários e regularidade") { nav.abrir(Rota.SonoDetalhe(null)) }
    }
}

// ---------------------------------------------------------------- corpo e monitor

@Composable
private fun CartaoCorpo(d: JSONObject) {
    val corpo = d.optJSONArray("corpo").objetos()
    Cartao {
        CabecalhoCartao("Composição corporal", Icons.Rounded.Scale, T.TextoSec)
        val u = corpo.lastOrNull()
        if (u == null) {
            TextoSec("Meça no relógio: Samsung Health › Composição corporal (dois dedos nos botões, ~15 s). Em jejum e de manhã para comparar melhor.")
            return@Cartao
        }
        Row(horizontalArrangement = Arrangement.spacedBy(T.e4)) {
            Estatistica(u.num("peso")?.let { "${fmt(it, 1)} kg" } ?: "—", "peso", Modifier.weight(1f))
            Estatistica(u.num("gordura_pct")?.let { "${fmt(it, 1)}%" } ?: "—", "gordura (estim.)", Modifier.weight(1f))
            Estatistica(u.num("musculo_kg")?.let { "${fmt(it, 1)} kg" } ?: "—", "músculo (estim.)", Modifier.weight(1f))
        }
        if (corpo.size >= 2) GraficoTendencia(corpo.map { Ponto(diaDe(it.txt("ts")), it.num("gordura_pct")) }, T.Pele, { "${fmt(it, 1)}%" }, altura = 120.dp, vaoMinimo = 3.0)
        TextoSec("Medido ${diaDe(u.txt("ts"))}. Bioimpedância de relógio é estimativa: varia com hidratação, horário e contato dos dedos — compare tendências, não medidas isoladas.", estilo = T.Legenda)
    }
}

@Composable
private fun CartaoMonitor(d: JSONObject) {
    Cartao {
        CabecalhoCartao("Samsung Health Monitor", Icons.Rounded.MonitorHeart, T.Vfc)
        val ap = d.optJSONObject("apneia")
        LinhaInfo(
            "Apneia do sono",
            when (ap?.txt("sinal")) { "DETECTED" -> "sinais detectados"; "NOT_DETECTED" -> "sem sinais"; null -> "não feito"; else -> "inconclusivo" },
            if (ap?.txt("sinal") == "DETECTED") T.Alerta else T.Texto,
        )
        if (ap == null) TextoSec("Ative no app Samsung Health Monitor: 2 noites com 4 h ou mais em até 10 dias.", estilo = T.Legenda)
        val ritmo = d.optInt("ritmo_irregular")
        LinhaInfo("Ritmo irregular (último ano)", if (ritmo > 0) "$ritmo aviso(s)" else "nenhum aviso", if (ritmo > 0) T.Alerta else T.Texto)
        if (ap?.txt("sinal") == "DETECTED" || ritmo > 0) TextoSec("Leve esse resultado ao médico.", cor = T.Alerta, estilo = T.Legenda)
    }
}

// ---------------------------------------------------------------- página: detalhe de um indicador

@Composable
fun TelaMetricaDetalhe(m: Metrica, nav: Nav) {
    var periodo by rememberSaveable { mutableIntStateOf(1) }
    val consulta = rememberConsulta("tendencias", "dias" to 90)
    val d = consulta.valor.dados
    TelaDetalhe(m.nome, "Fonte: ${if (m == Metrica.PASSOS || m == Metrica.ENERGIA || m == Metrica.SONO) "Samsung Health" else if (m == Metrica.SPO2) "Samsung Health (relógio)" else "Galaxy Watch · Saúde NT"}", nav) {
        Segmentado(listOf("7D", "30D", "90D"), periodo) { periodo = it }
        if (d == null) { if (consulta.valor.falhou) EstadoVazio(m.icone, "Não foi possível carregar", "Sem conexão.", "Tentar de novo") { consulta.recarregar() } else CarregandoEsqueleto(); return@TelaDetalhe }
        CartaoTendencia(m, d, PERIODO_DIAS[periodo], null)
        val pts = pontosDe(m, d, 90)
        val reais = pts.mapNotNull { it.valor }
        Cartao {
            CabecalhoCartao("Números do período")
            val p = pontosDe(m, d, PERIODO_DIAS[periodo]).mapNotNull { it.valor }
            LinhaInfo("Média", p.takeIf { it.isNotEmpty() }?.average()?.let { valorFmt(it, m) } ?: "—")
            LinhaInfo("Menor · maior", if (p.isEmpty()) "—" else "${valorFmt(p.min(), m)} · ${valorFmt(p.max(), m)}")
            LinhaInfo("Dias com dado", "${p.size} de ${PERIODO_DIAS[periodo]}")
            faixaHabitual(reais.map { it })?.let { (a, b) -> LinhaInfo("Faixa habitual (90 d)", "${valorFmt(a, m)} – ${valorFmt(b, m)}") }
            val susp = pts.takeLast(PERIODO_DIAS[periodo]).count { it.suspeito }
            if (susp > 0) LinhaInfo("Leituras suspeitas", "$susp", T.Atencao)
            if (m == Metrica.SPO2) {
                val mins = d.optJSONArray("noites").objetos().takeLast(14).mapNotNull { it.num("spo2_min") }
                LinhaInfo("Noites com mínima < 88% (14 d)", "${mins.count { it < 88 }}", if (mins.count { it < 88 } >= 3) T.Atencao else T.Texto)
            }
        }
        Cartao {
            CabecalhoCartao("Como ler")
            TextoSec(EXPLICA[m] ?: "")
            TextoSec("Faixa sombreada = onde seus valores costumam ficar (90 dias). Tracejado = seu normal. Linha fina = média móvel de 7 dias. Pontos vazados = leitura suspeita.", estilo = T.Legenda)
        }
    }
}

// ---------------------------------------------------------------- página: sono

@Composable
fun TelaSonoDetalhe(noiteInicial: String?, nav: Nav) {
    var noite by rememberSaveable { mutableStateOf(noiteInicial) }
    val consulta = rememberConsulta("sono", "noite" to noite, "dias" to 30)
    val d = consulta.valor.dados
    val sel = d?.optJSONObject("noite")
    TelaDetalhe("Sono", sel?.let { "Noite de ${noiteCurta(it.optString("noite"))}" }, nav) {
        if (d == null) { if (consulta.valor.falhou) EstadoVazio(Icons.Rounded.Bedtime, "Não foi possível carregar", "Sem conexão.", "Tentar de novo") { consulta.recarregar() } else CarregandoEsqueleto(); return@TelaDetalhe }
        val sessoes = d.optJSONArray("sessoes").objetos()
        if (sel == null) { EstadoVazio(Icons.Rounded.Bedtime, "Sem sono registrado", "Durma com o relógio e deixe o Samsung Health sincronizar pelo celular."); return@TelaDetalhe }
        // seletor de noites
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(T.e2)) {
            sessoes.reversed().take(14).forEach { s ->
                val esta = s.optString("noite") == sel.optString("noite")
                Column(
                    Modifier.clip(RoundedCornerShape(12.dp)).background(if (esta) T.Elevada else T.Superficie)
                        .border(1.dp, if (esta) T.Sono else T.Borda, RoundedCornerShape(12.dp))
                        .clickable(role = Role.Tab) { noite = s.optString("noite") }.padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(noiteCurta(s.optString("noite")), style = T.Legenda, color = T.TextoSec)
                    Text(horasMin(s.optDouble("dormido_min")), style = T.Descricao.copy(fontWeight = FontWeight.SemiBold), color = if (s.optString("qualidade") == "suspeito") T.Atencao else T.Texto)
                }
            }
        }
        val dur = sel.optDouble("duracao_min"); val dorm = sel.optDouble("dormido_min")
        Cartao {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(horasMin(dorm), style = T.Destaque.copy(fontSize = 40.sp), color = T.Texto)
                Spacer(Modifier.width(T.e2))
                TextoSec("dormidas de ${horasMin(dur)} na cama", modifier = Modifier.padding(bottom = 6.dp))
            }
            TextoSec("${horaDe(sel.txt("inicio"))} → ${horaDe(sel.txt("fim"))}" + (sel.num("nota")?.let { " · nota Samsung ${it.roundToInt()}" } ?: ""))
            when {
                sel.optString("estado") == "parcial" -> IndicadorQualidade("Dados parciais — o Samsung Health ainda pode atualizar", Estado.ATENCAO)
                sel.optString("qualidade") == "suspeito" -> IndicadorQualidade(sel.optString("motivo"), Estado.ATENCAO)
                sel.optString("qualidade") == "incompleto" -> IndicadorQualidade(sel.optString("motivo"), Estado.NEUTRO)
            }
            Hipnograma(d.optJSONArray("estagios"), instante(sel.txt("inicio")), instante(sel.txt("fim")))
            val fases = listOf(
                Triple("Profundo", sel.optDouble("profundo_min"), T.SonoProfundo), Triple("REM", sel.optDouble("rem_min"), T.SonoRem),
                Triple("Leve", sel.optDouble("leve_min"), T.SonoLeve), Triple("Acordado", sel.optDouble("acordado_min"), T.SonoAcordado),
                Triple("Sem fase", sel.optDouble("sem_fase_min"), T.SemFase),
            )
            fases.forEach { (nome, v, cor) ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(cor)); Spacer(Modifier.width(T.e2))
                    Text(nome, style = T.Descricao, color = T.Texto, modifier = Modifier.width(80.dp))
                    Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(T.Elevada)) {
                        Box(Modifier.fillMaxWidth((v / dur.coerceAtLeast(1.0)).toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(cor))
                    }
                    Text("${horasMin(v)} · ${(v * 100 / dur.coerceAtLeast(1.0)).roundToInt()}%", style = T.Legenda, color = T.TextoSec, modifier = Modifier.width(90.dp).padding(start = T.e2))
                }
            }
        }
        Cartao {
            CabecalhoCartao("Qual valor entra nos cálculos")
            TextoSec(
                when {
                    sel.optString("estado") == "parcial" -> "Nenhum ainda: a sessão está sendo atualizada. A prontidão é calculada sem o sono até a sessão fechar."
                    sel.optString("qualidade") == "suspeito" -> "Nenhum: o registro é contraditório (${sel.optString("motivo")}). A prontidão desta noite foi calculada sem o sono para não punir um erro de medição."
                    else -> "O tempo dormido (${horasMin(dorm)}), que exclui o tempo acordado e o tempo sem fase identificada. O tempo na cama (${horasMin(dur)}) não é usado."
                },
            )
            sel.num("fc_media")?.let { TextoSec("FC média do relógio durante a sessão: ${it.roundToInt()} bpm.", estilo = T.Legenda) }
        }
        d.optJSONObject("spo2")?.let { sp ->
            Cartao {
                CabecalhoCartao("Oxigenação desta noite", Metrica.SPO2.icone, T.Oxigenio)
                LinhaInfo("Média", "${sp.num("media")?.let { fmt(it, 0) } ?: "—"}%")
                val mn = sp.num("min")
                LinhaInfo("Mínima", "${mn?.let { fmt(it, 0) } ?: "—"}%", if ((mn ?: 100.0) < 85) T.Atencao else T.Texto)
                LinhaInfo("Leituras", "${sp.optInt("leituras")}")
                if ((mn ?: 100.0) < 85) TextoSec("Mínima isolada abaixo de 85% no pulso costuma ser artefato. Uma única queda não é diagnóstico; quedas repetidas em várias noites merecem o teste de apneia.", estilo = T.Legenda)
            }
        }
        Regularidade(sessoes)
    }
}

/** Linha do tempo das fases (hipnograma): acordado no topo, profundo embaixo; lacunas = sem fase. */
@Composable
private fun Hipnograma(estagios: JSONArray?, ini: Instant?, fim: Instant?) {
    if (estagios == null || estagios.length() == 0 || ini == null || fim == null) return
    val medidor = rememberTextMeasurer()
    val total = (fim.toEpochMilli() - ini.toEpochMilli()).toDouble().coerceAtLeast(1.0)
    val linhas = mapOf("acordado" to 0, "rem" to 1, "leve" to 2, "profundo" to 3)
    val cores = mapOf("acordado" to T.SonoAcordado, "rem" to T.SonoRem, "leve" to T.SonoLeve, "profundo" to T.SonoProfundo)
    var toque by remember { mutableStateOf<Float?>(null) }
    val segs = (0 until estagios.length()).mapNotNull { i -> estagios.optJSONArray(i)?.let { Triple(it.optLong(0), it.optLong(1), it.optString(2)) } }
    Canvas(
        Modifier.fillMaxWidth().height(150.dp).semantics { contentDescription = "Linha do tempo das fases do sono, de ${horaDe(ini.toString())} a ${horaDe(fim.toString())}" }
            .pointerInput(segs) { detectTapGestures { toque = it.x / size.width } },
    ) {
        val esq = 64.dp.toPx(); val base = 18.dp.toPx(); val topo = 22.dp.toPx()
        val w = size.width - esq; val h = (size.height - base - topo) / 4
        val estilo = TextStyle(fontSize = 10.sp, color = T.TextoTer)
        listOf("Acordado", "REM", "Leve", "Profundo").forEachIndexed { i, n ->
            drawText(medidor, n, Offset(0f, topo + i * h + h / 2 - 7.dp.toPx()), estilo)
            drawLine(T.Borda, Offset(esq, topo + i * h + h / 2), Offset(size.width, topo + i * h + h / 2), 1f)
        }
        segs.forEach { (a, b, tipo) ->
            val l = linhas[tipo] ?: return@forEach
            val x0 = esq + ((a - ini.toEpochMilli()) / total * w).toFloat()
            val x1 = esq + ((b - ini.toEpochMilli()) / total * w).toFloat()
            drawRoundRect(cores[tipo] ?: T.SemFase, Offset(x0, topo + l * h + h * 0.18f), Size(max(2f, x1 - x0), h * 0.64f), CornerRadius(3f))
        }
        listOf(0.0, 0.5, 1.0).forEach { f ->
            val t = Instant.ofEpochMilli(ini.toEpochMilli() + (total * f).toLong())
            val txt = horaDe(t.toString())
            val lw = medidor.measure(txt, estilo).size.width
            drawText(medidor, txt, Offset((esq + (w * f).toFloat() - lw / 2).coerceIn(esq, size.width - lw), size.height - base + 4.dp.toPx()), estilo)
        }
        toque?.let { fx ->
            val x = fx * size.width
            if (x >= esq) {
                val ms = ini.toEpochMilli() + ((x - esq) / w * total).toLong()
                val seg = segs.firstOrNull { ms in it.first..it.second }
                val txt = "${horaDe(Instant.ofEpochMilli(ms).toString())} · ${seg?.third?.replaceFirstChar { it.uppercase() } ?: "sem fase"}"
                drawLine(T.TextoSec, Offset(x, topo), Offset(x, size.height - base), 1.5f)
                val lay = medidor.measure(txt, TextStyle(fontSize = 11.sp, color = T.Texto, fontWeight = FontWeight.SemiBold))
                val bx = (x - lay.size.width / 2f).coerceIn(0f, size.width - lay.size.width)
                drawText(lay, topLeft = Offset(bx, 0f))
            }
        }
    }
}

@Composable
private fun Regularidade(sessoes: List<JSONObject>) {
    val ok = sessoes.filter { it.optString("qualidade") != "suspeito" && it.optString("estado") == "finalizado" }.takeLast(14)
    if (ok.size < 3) return
    fun minDoDia(iso: String?, ajusteNoite: Boolean): Double? = instante(iso)?.atZone(ZONA)?.toLocalTime()?.let {
        val m = it.hour * 60 + it.minute.toDouble()
        if (ajusteNoite && m < 12 * 60) m + 24 * 60 else m
    }
    val deitar = ok.mapNotNull { minDoDia(it.txt("inicio"), true) }
    val acordar = ok.mapNotNull { minDoDia(it.txt("fim"), false) }
    fun dp(v: List<Double>): Double { val m = v.average(); return sqrt(v.sumOf { (it - m) * (it - m) } / max(1, v.size - 1)) }
    fun hhmm(m: Double): String { val x = ((m % 1440) + 1440) % 1440; return String.format(PT_BR, "%02d:%02d", (x / 60).toInt(), (x % 60).toInt()) }
    val dormido7 = ok.takeLast(7).map { it.optDouble("dormido_min") }
    Cartao {
        CabecalhoCartao("Regularidade (${ok.size} noites)")
        LinhaInfo("Deitar (média)", "${hhmm(deitar.average())} ±${dp(deitar).roundToInt()} min")
        LinhaInfo("Acordar (média)", "${hhmm(acordar.average())} ±${dp(acordar).roundToInt()} min")
        LinhaInfo("Dormido, média 7 noites", horasMin(dormido7.average()), if (dormido7.average() < 7 * 60) T.Atencao else T.Texto)
        LinhaInfo("Diferença para a meta (7h00)", "${sinalDelta(dormido7.average() - 420)} min", if (dormido7.average() < 420) T.Atencao else T.Primaria)
        TextoSec("Horários estáveis (variação abaixo de ~30 min) ajudam tanto quanto a duração. Noites com registro contraditório ficam fora destas contas.", estilo = T.Legenda)
    }
}
