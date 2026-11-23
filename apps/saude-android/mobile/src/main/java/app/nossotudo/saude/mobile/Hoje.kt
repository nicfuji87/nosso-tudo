package app.nossotudo.saude.mobile

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.TipsAndUpdates
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import kotlin.math.roundToInt

private const val PAINEL = "https://nossotudo.com.br/app/saude"

/** Mapeia o "alvo" de um ponto de atenção para a página que mostra a evidência. */
fun abrirAlvo(nav: Nav, alvo: String?) = when (alvo) {
    "sono" -> nav.abrir(Rota.SonoDetalhe(null))
    "fc" -> nav.abrir(Rota.MetricaDetalhe(Metrica.FC))
    "vfc" -> nav.abrir(Rota.MetricaDetalhe(Metrica.VFC))
    "spo2" -> nav.abrir(Rota.MetricaDetalhe(Metrica.SPO2))
    "pele" -> nav.abrir(Rota.MetricaDetalhe(Metrica.PELE))
    "sync" -> nav.abrir(Rota.Sincronizacao)
    else -> Unit
}

/** Estado geral da sincronização: o pior entre celular e relógio. */
fun resumoSync(d: JSONObject?): Pair<String?, Estado> {
    val aparelhos = d?.optJSONArray("sincronizacao").objetos()
    if (aparelhos.isEmpty()) return null to Estado.NEUTRO
    val agora = System.currentTimeMillis()
    var pior = Estado.NEUTRO
    aparelhos.forEach { a ->
        val t = instante(if (a.optString("tipo") == "celular") a.txt("ultima_sync") else a.txt("ultimo_envio"))?.toEpochMilli() ?: return@forEach
        val lim = if (a.optString("tipo") == "celular") 6 else 3
        if (agora - t > lim * 3_600_000L) pior = Estado.ATENCAO
        if (a.txt("erro") != null && pior == Estado.NEUTRO) pior = Estado.ATENCAO
    }
    return null to pior
}

@Composable
fun TelaHoje(nav: Nav, rolagem: ScrollState) {
    val ctx = LocalContext.current
    val consulta = rememberConsulta("hoje")
    val c = consulta.valor
    val d = c.dados
    var aviso by remember { mutableStateOf<String?>(null) }
    val hora = LocalTime.now().hour
    val saudacao = when (hora) { in 5..11 -> "Bom dia"; in 12..17 -> "Boa tarde"; else -> "Boa noite" }
    val (_, estadoSync) = resumoSync(d)

    TelaAba(
        titulo = saudacao, subtitulo = diaLongo(), rolagem = rolagem, carregando = c.carregando && d != null,
        aoAtualizar = { SamsungSync.agora(ctx); consulta.recarregar() },
        topo = {
            StatusSync(
                if (c.em > 0) "Atualizado às ${horaDe(java.time.Instant.ofEpochMilli(c.em).toString())}" else "Sem dados",
                estadoSync, c.carregando && d == null,
            ) { nav.abrir(Rota.Sincronizacao) }
        },
    ) {
        AvisoCache(c)
        aviso?.let { Etiqueta(it, T.Primaria, Icons.Rounded.CheckCircle) }
        if (d == null) {
            if (c.falhou) EstadoVazio(Icons.Rounded.Link, "Não foi possível carregar", "Sem conexão com o Nosso Tudo. Puxe para tentar de novo ou confira a conexão em Ajustes.", "Tentar de novo") { consulta.recarregar() }
            else CarregandoEsqueleto()
            return@TelaAba
        }
        CartaoProntidaoPrincipal(d, nav)
        CartaoAtencao(d, nav)
        TituloSecao("Seus indicadores")
        GradeIndicadores(d, nav)
        TreinosAConfirmar(d) { aviso = it; consulta.recarregar() }
        CartaoProximoTreino(d, nav)
        CartaoNoite(d)
        CartaoSemanaResumo(d, nav)
        DiarioRapido { aviso = it }
        Row(
            Modifier.fillMaxWidth().clip(T.FormaPeq).clickable(role = Role.Button) {
                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PAINEL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }.heightIn(min = 48.dp).padding(horizontal = T.e2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Relatório para o médico e histórico completo no site", style = T.Descricao, color = T.TextoSec, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = T.TextoSec, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
fun CarregandoEsqueleto() {
    Column(verticalArrangement = Arrangement.spacedBy(T.e3)) {
        listOf(220.dp, 110.dp, 140.dp).forEach { h -> Box(Modifier.fillMaxWidth().height(h).clip(T.Forma).background(T.Superficie)) }
    }
}

// ---------------------------------------------------------------- prontidão

private fun tituloNivel(nivel: String?) = when (nivel) {
    "alto" -> "Recuperação dentro do habitual"
    "moderado" -> "Recuperação um pouco abaixo do habitual"
    "baixo" -> "Recuperação abaixo do habitual"
    else -> "Dados insuficientes hoje"
}
private fun textoNivel(nivel: String?) = when (nivel) {
    "alto" -> "Seus indicadores da noite estão no seu padrão pessoal."
    "moderado" -> "Alguns indicadores ficaram abaixo do seu padrão. Ajuste a intensidade ao que sentir."
    "baixo" -> "Seus indicadores sugerem priorizar descanso e atividades leves hoje."
    else -> "Sem repouso e VFC desta noite não dá para calcular a prontidão. Durma com o relógio no pulso."
}
fun corNivel(nivel: String?) = when (nivel) { "alto" -> T.Primaria; "moderado" -> T.Atencao; "baixo" -> T.Alerta; else -> T.TextoSec }

@Composable
private fun CartaoProntidaoPrincipal(d: JSONObject, nav: Nav) {
    val p = d.optJSONObject("prontidao") ?: JSONObject()
    val nivel = p.txt("nivel")
    val score = p.num("score")?.roundToInt()
    val cor = corNivel(nivel)
    var aberto by rememberSaveable { mutableStateOf(false) }
    val normais = d.optJSONObject("normais")
    val ent = p.optJSONObject("entradas") ?: JSONObject()
    val sono = p.optJSONObject("sono") ?: JSONObject()
    val faltando = p.optJSONArray("faltando").textos()

    Cartao(onClick = { aberto = !aberto }, padding = T.e5, descricao = "Prontidão ${score ?: "sem nota"} de 100. ${tituloNivel(nivel)}. Toque para ver como foi calculada.") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Minha prontidão", style = T.Rotulo, color = T.TextoSec, modifier = Modifier.weight(1f))
            Icon(if (aberto) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null, tint = T.TextoSec)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            AnelProntidao(score, cor)
            Spacer(Modifier.width(T.e4))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(tituloNivel(nivel), style = T.TituloCartao, color = cor)
                Text(textoNivel(nivel), style = T.Descricao, color = T.TextoSec)
                ChipsConfianca(p, faltando)
            }
        }
        Divisor()
        // os três sinais que mais pesam
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            val sonoH = sono.num("horas")
            val sonoEstado = sono.txt("estado")
            val (sonoValor, sonoNota, sonoCor) = when (sonoEstado) {
                "finalizado" -> Triple(sonoH?.let { horasMin(it * 60) } ?: "—", sonoH?.let { if (it < (sono.num("meta") ?: 7.0)) "abaixo da meta" else "na meta" } ?: "", if ((sonoH ?: 0.0) < (sono.num("meta") ?: 7.0)) T.Atencao else T.TextoSec)
                "contraditorio" -> Triple(sonoH?.let { horasMin(it * 60) } ?: "—", "registro contraditório", T.Atencao)
                "parcial" -> Triple(sonoH?.let { horasMin(it * 60) } ?: "—", "dados parciais", T.Atencao)
                "aguardando" -> Triple("…", "aguardando Samsung Health", T.TextoSec)
                else -> Triple("—", "sem registro", T.TextoSec)
            }
            MiniSinal("Sono", sonoValor, sonoNota, sonoCor, Modifier.weight(1f)) { nav.abrir(Rota.SonoDetalhe(null)) }
            Box(Modifier.width(1.dp).fillMaxHeight().background(T.Borda))
            val fc = ent.num("fc"); val fcn = ent.num("fc_normal") ?: normais?.num("fc")
            val vfc = variacao(fc, fcn, Metrica.FC)
            MiniSinal("FC repouso", fc?.let { "${it.roundToInt()} bpm" } ?: "—", vfc?.texto?.replace(" vs. seu normal", " vs. normal") ?: "sem leitura", vfc?.let { corDoEstado(it.estado) } ?: T.TextoSec, Modifier.weight(1f)) { nav.abrir(Rota.MetricaDetalhe(Metrica.FC)) }
            Box(Modifier.width(1.dp).fillMaxHeight().background(T.Borda))
            val hv = ent.num("vfc"); val hvn = ent.num("vfc_normal") ?: normais?.num("vfc")
            val vh = variacao(hv, hvn, Metrica.VFC)
            MiniSinal("VFC", hv?.let { "${it.roundToInt()} ms" } ?: "—", vh?.texto?.replace(" vs. seu normal", " vs. normal") ?: "sem leitura", vh?.let { corDoEstado(it.estado) } ?: T.TextoSec, Modifier.weight(1f)) { nav.abrir(Rota.MetricaDetalhe(Metrica.VFC)) }
        }
        AnimatedVisibility(aberto) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = T.e2)) {
                Text("Como foi calculada", style = T.Rotulo, color = T.TextoSec)
                p.optJSONArray("fatores").objetos().forEach { f ->
                    val ef = f.optInt("efeito")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(f.optString("texto"), style = T.Descricao, color = T.Texto, modifier = Modifier.weight(1f))
                        Text(if (ef < 0) "−${-ef}" else "0", style = T.Descricao.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"), color = if (ef <= -10) T.Atencao else T.TextoSec)
                    }
                }
                if (faltando.isNotEmpty()) TextoSec("Fora do cálculo: ${faltando.joinToString { mapOf("sono" to "sono", "vfc" to "VFC", "repouso" to "FC de repouso")[it] ?: it }}" + (sono.txt("motivo")?.let { " — $it" } ?: ""))
                TextoSec(
                    "Índice próprio (${p.optString("algoritmo")}), não é medida clínica. Parte de 100 e desconta desvios do seu padrão: " +
                        "FC de repouso, VFC e sono dormido (até −25 cada) e carga semanal (só com 3 semanas de histórico).",
                    estilo = T.Legenda,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipsConfianca(p: JSONObject, faltando: List<String>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when (p.txt("confianca")) {
            "alta" -> Etiqueta("Confiança alta", T.Primaria)
            "media" -> Etiqueta("Confiança média", T.Atencao)
            "baixa" -> Etiqueta("Confiança baixa", T.Atencao)
        }
        if (p.optBoolean("calibrando")) Etiqueta("Referência provisória", T.TextoSec)
        if ("sono" in faltando && p.optJSONObject("sono")?.txt("estado") != "ausente") Etiqueta("Sono fora do cálculo", T.Atencao)
    }
}

@Composable
private fun MiniSinal(rotulo: String, valor: String, nota: String, corNota: androidx.compose.ui.graphics.Color, modifier: Modifier, aoTocar: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClick = aoTocar).padding(horizontal = 6.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(rotulo, style = T.Legenda, color = T.TextoSec)
        Text(valor, style = T.ValorPeq, color = T.Texto, maxLines = 1)
        Text(nota, style = T.Legenda, color = corNota, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

// ---------------------------------------------------------------- atenção

@Composable
private fun CartaoAtencao(d: JSONObject, nav: Nav) {
    val itens = d.optJSONArray("atencao").objetos()
    Cartao {
        CabecalhoCartao("O que merece sua atenção", Icons.Rounded.TipsAndUpdates, T.Atencao)
        if (itens.isEmpty()) {
            TextoSec("Nada fora do seu padrão hoje.")
        } else itens.forEach { a ->
            val acao = when (a.optString("alvo")) { "sono" -> "Ver sono"; "sync" -> "Ver sincronização"; "spo2" -> "Ver oxigenação"; else -> "Ver tendência" }
            CartaoInsight(a.optString("titulo"), a.optString("evidencia"), if (a.optString("nivel") == "info") Estado.NEUTRO else Estado.ATENCAO, acao) { abrirAlvo(nav, a.txt("alvo")) }
        }
    }
}

// ---------------------------------------------------------------- indicadores

/** Últimos 7 valores de uma série por noite, alinhados por data (lacunas = null). */
fun ultimos7(noites: List<JSONObject>, campo: String, dias: Int = 7): List<Double?> {
    val porNoite = noites.associateBy { it.optString("noite") }
    return (dias - 1 downTo 0).map { porNoite[LocalDate.now().minusDays(it.toLong()).toString()]?.num(campo) }
}
fun ultimos7Dia(lista: List<JSONObject>, dias: Int = 7): List<Double?> {
    val m = lista.associateBy { it.optString("dia") }
    return (dias - 1 downTo 0).map { m[LocalDate.now().minusDays(it.toLong()).toString()]?.num("valor") }
}

@Composable
private fun GradeIndicadores(d: JSONObject, nav: Nav) {
    val serie = d.optJSONObject("serie") ?: JSONObject()
    val noites = serie.optJSONArray("noites").objetos()
    val normais = d.optJSONObject("normais")
    val hoje = LocalDate.now().toString()

    @Composable
    fun noite(m: Metrica, campo: String, mod: Modifier, normal: Double?) {
        val alvo = noites.lastOrNull { it.num(campo) != null }
        val v = alvo?.num(campo)
        var q: Pair<String, Estado>? = if (alvo != null && alvo.optString("noite") != hoje) "de ${noiteCurta(alvo.optString("noite"))}" to Estado.NEUTRO else null
        if (m == Metrica.SPO2 && alvo?.optString("spo2_qualidade") == "suspeita") q = "mínima ${alvo.num("spo2_min")?.roundToInt()}% suspeita" to Estado.ATENCAO
        if (m == Metrica.SONO && alvo?.optString("sono_qualidade") == "suspeito") q = "registro contraditório" to Estado.ATENCAO
        if (m == Metrica.SONO && alvo?.optString("sono_estado") == "parcial") q = "dados parciais" to Estado.ATENCAO
        val varia = if (q == null) variacao(v, if (m == Metrica.SONO) 7.0 else normal, m) else null
        CartaoMetrica(m, v?.let { valorFmt(it, m) } ?: "—", varia, ultimos7(noites, campo), mod, qualidade = q,
            rodape = if (v == null) "sem leitura" else null, normal = if (m == Metrica.SONO) 7.0 else normal,
            onClick = { if (m == Metrica.SONO) nav.abrir(Rota.SonoDetalhe(null)) else nav.abrir(Rota.MetricaDetalhe(m)) })
    }
    @Composable
    fun diaria(m: Metrica, chave: String, mod: Modifier) {
        val lista = serie.optJSONArray(chave).objetos()
        val ult = lista.lastOrNull()
        val v = ult?.num("valor")
        val media = lista.takeLast(8).dropLast(1).mapNotNull { it.num("valor") }.takeIf { it.size >= 3 }?.average()
        val q = ult?.takeIf { it.optString("dia") != hoje }?.let { "de ${noiteCurta(it.optString("dia"))}" to Estado.NEUTRO }
        val rod = media?.let { "média 7 d ${valorFmt(it, m)}" }
        CartaoMetrica(m, v?.let { valorFmt(it, m) } ?: "—", null, ultimos7Dia(lista), mod, rodape = rod ?: if (v == null) "sem leitura" else null,
            qualidade = q, onClick = { nav.abrir(Rota.MetricaDetalhe(m)) })
    }
    Column(verticalArrangement = Arrangement.spacedBy(T.e3)) {
        Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
            noite(Metrica.FC, "fc", Modifier.weight(1f), normais?.num("fc"))
            noite(Metrica.VFC, "vfc", Modifier.weight(1f), normais?.num("vfc"))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
            noite(Metrica.SONO, "sono_h", Modifier.weight(1f), null)
            noite(Metrica.SPO2, "spo2", Modifier.weight(1f), normais?.num("spo2"))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(T.e3)) {
            diaria(Metrica.ENERGIA, "energia", Modifier.weight(1f))
            diaria(Metrica.PASSOS, "passos", Modifier.weight(1f))
        }
    }
}

// ---------------------------------------------------------------- próximo treino, noite e semana

@Composable
private fun CartaoProximoTreino(d: JSONObject, nav: Nav) {
    val p = d.optJSONObject("prontidao")
    val nivel = p?.txt("nivel")
    val texto = when (nivel) {
        "baixo" -> "Sua recuperação estimada está abaixo do habitual. Técnica ou atividade leve combinam melhor com hoje."
        "moderado" -> "Alguns indicadores abaixo do seu padrão. Se treinar, ajuste a intensidade pela sensação."
        "alto" -> "Seus indicadores estão no seu padrão pessoal."
        else -> "Sem dados suficientes desta noite para uma sugestão."
    }
    Cartao {
        CabecalhoCartao("Planejando seu próximo treino?", Icons.Rounded.FitnessCenter, T.TextoSec)
        Text(texto, style = T.Corpo, color = T.Texto)
        TextoSec("Tontura, visão escurecendo, dor no peito ou falta de ar valem mais que qualquer pontuação: pare e procure avaliação. O app não avalia segurança cardiovascular.", estilo = T.Legenda)
        LinkAcao("Ver análise de treino") { nav.aba(1) }
    }
}

@Composable
private fun CartaoNoite(d: JSONObject) {
    val s = d.optJSONObject("prontidao")?.optJSONObject("sono") ?: return
    val deitar = s.txt("deitar") ?: return
    val reg = s.num("regularidade_min")?.roundToInt()
    Cartao {
        CabecalhoCartao("Hoje à noite", Icons.Rounded.Bedtime, T.Sono)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(deitar, style = T.Valor, color = T.Texto)
            Spacer(Modifier.width(T.e2))
            TextoSec("para acordar ${s.optString("acordar")} com 7h30 na cama", modifier = Modifier.padding(bottom = 3.dp))
        }
        if (reg != null) TextoSec(if (reg > 45) "Seus horários de dormir variam ±$reg min — regularidade também conta." else "Horários regulares (±$reg min).", estilo = T.Legenda)
    }
}

@Composable
private fun CartaoSemanaResumo(d: JSONObject, nav: Nav) {
    val s = d.optJSONObject("semana") ?: return
    val u = s.optJSONObject("ultimos7") ?: JSONObject()
    val zonas = u.optJSONArray("zonas").ints()
    val total = zonas.sum().takeIf { it > 0 }
    val porDia = s.optJSONArray("por_dia").objetos()
    Cartao(onClick = { nav.aba(1) }) {
        CabecalhoCartao("Últimos 7 dias", Icons.Rounded.FitnessCenter, T.TextoSec)
        Row(horizontalArrangement = Arrangement.spacedBy(T.e4)) {
            Estatistica(horasMin(u.optDouble("minutos", 0.0)), "de atividade", Modifier.weight(1f))
            Estatistica("${u.optInt("treinos")}", "treinos", Modifier.weight(1f))
            Estatistica("${u.optInt("carga")}", "carga (FC)", Modifier.weight(1f))
        }
        if (total != null) {
            BarraZonas(zonas, 8.dp)
            val leve = (zonas[0] + zonas[1]) * 100 / total
            val mod = zonas[2] * 100 / total
            TextoSec("Leve $leve% · moderado $mod% · vigoroso ${100 - leve - mod}%", estilo = T.Legenda)
        }
        if (porDia.isNotEmpty()) MiniGrafico(porDia.map { it.num("carga")?.takeIf { v -> v > 0 } }, T.Primaria, barras = true, altura = 36.dp)
        LinkAcao("Ver semana completa") { nav.aba(1) }
    }
}

// ---------------------------------------------------------------- treinos a confirmar (detectados pelo batimento)

@Composable
private fun TreinosAConfirmar(d: JSONObject, aoSalvar: (String) -> Unit) {
    val lista = d.optJSONArray("treinos").objetos()
    if (lista.isEmpty()) return
    TituloSecao("Treinos a confirmar")
    lista.forEach { t -> CartaoConfirmar(t, aoSalvar) }
}

@Composable
private fun CartaoConfirmar(t: JSONObject, aoSalvar: (String) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val partes = t.optJSONArray("partes").objetos()
    val podeSeparar = partes.size >= 2
    var separar by remember { mutableStateOf(podeSeparar) }
    var escolha by remember { mutableStateOf(t.txt("palpite")) }
    var escolhas by remember { mutableStateOf(partes.map { it.txt("modalidade") }) }
    var ocupado by remember { mutableStateOf(false) }
    fun ms(iso: String) = instante(iso)!!.toEpochMilli()
    fun enviar(descartar: Boolean) = escopo.launch {
        ocupado = true
        val pedidos = if (separar && !descartar) partes.mapIndexed { i, p -> Triple(ms(p.getString("inicio")), ms(p.getString("fim")), escolhas[i]) }
        else listOf(Triple(ms(t.getString("inicio")), ms(t.getString("fim")), escolha))
        val ok = pedidos.all { (a, b, m) -> chamar(ctx, "treino") { put("inicio", a).put("fim", b).put("descartar", descartar); m?.let { put("modalidade", it) } } != null }
        ocupado = false
        if (ok) aoSalvar(if (descartar) "Descartado" else "Treino salvo")
    }
    Cartao {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Atividade detectada · ${horaDe(t.txt("inicio"))}–${horaDe(t.txt("fim"))}", style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto)
                TextoSec("${t.optInt("minutos")} min · FC média ${t.optInt("fc_media")} · pico ${t.optInt("fc_max")} bpm", estilo = T.Legenda)
            }
        }
        if (podeSeparar) LinkAcao(if (separar) "Registrar como um treino só" else "Separar como no Samsung Health (${partes.size})") { separar = !separar }
        if (separar) partes.forEachIndexed { i, p ->
            TextoSec("${horaDe(p.txt("inicio"))}–${horaDe(p.txt("fim"))}" + (p.txt("modalidade")?.let { " · Samsung: $it" } ?: ""), estilo = T.Legenda)
            Chips(Modalidade.TODAS, escolhas[i], { Modalidade.cor(it) }) { m -> escolhas = escolhas.toMutableList().also { l -> l[i] = m } }
        } else {
            if (escolha == null) TextoSec("Escolha a modalidade", cor = T.Atencao, estilo = T.Legenda)
            Chips(Modalidade.TODAS, escolha, { Modalidade.cor(it) }) { escolha = it }
        }
        val pronto = if (separar) escolhas.all { it != null } else escolha != null
        Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
            BotaoPrimario(if (separar) "Confirmar ${partes.size}" else "Confirmar", Modifier.weight(1f), habilitado = pronto && !ocupado) { enviar(false) }
            BotaoSecundario("Não foi treino", Modifier.weight(1f), habilitado = !ocupado) { enviar(true) }
        }
    }
}

// ---------------------------------------------------------------- diário rápido

private val DIARIO = listOf(
    "malestar" to "Mal-estar", "sintoma" to "Sintoma", "medicamento" to "Remédio", "alcool" to "Álcool",
    "cafeina" to "Cafeína", "doenca" to "Fiquei doente", "estresse" to "Estresse", "nota" to "Nota",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DiarioRapido(aoSalvar: (String) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var aberto by remember { mutableStateOf<Pair<String, String>?>(null) }
    Cartao {
        CabecalhoCartao("Registrar no diário", Icons.Rounded.EditNote, T.TextoSec)
        TextoSec("Ajuda a entender desvios depois (ex.: álcool antes de uma noite com VFC baixa).", estilo = T.Legenda)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(T.e2), verticalArrangement = Arrangement.spacedBy(T.e2)) {
            DIARIO.forEach { (tipo, rotulo) ->
                Box(
                    Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(50)).border(1.dp, T.Borda, RoundedCornerShape(50))
                        .clickable(role = Role.Button) { aberto = tipo to rotulo }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(rotulo, style = T.Descricao, color = if (tipo == "malestar") T.Alerta else T.Texto) }
            }
        }
    }
    aberto?.let { (tipo, rotulo) ->
        var nota by remember(tipo) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { aberto = null },
            containerColor = T.Elevada,
            title = { Text(rotulo, color = T.Texto) },
            text = { OutlinedTextField(nota, { nota = it }, label = { Text(if (tipo == "medicamento") "Qual e quanto" else "Observação (opcional)") }, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(onClick = {
                    val n = nota; aberto = null
                    escopo.launch {
                        val ok = chamar(ctx, "evento") { put("tipo", tipo).put("inicio", System.currentTimeMillis()); if (n.isNotBlank()) put("nota", n) } != null
                        aoSalvar(if (ok) "$rotulo registrado" else "Não deu para salvar agora")
                    }
                }) { Text("Salvar", color = T.Primaria) }
            },
            dismissButton = { TextButton(onClick = { aberto = null }) { Text("Cancelar", color = T.TextoSec) } },
        )
    }
}
