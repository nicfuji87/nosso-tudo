package app.nossotudo.saude.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

private val Fundo = Color(0xFF0B0E0C)
private val Cartao = Color(0xFF151A17)
private val Borda = Color(0xFF232A26)
private val Texto = Color(0xFFF7F6F2)
private val TextoSec = Color(0xFFB4B9B4)
private val Verde = Color(0xFF8FDE95)
private val Ambar = Color(0xFFF2C14B)
private val Coracao = Color(0xFFFF6B7D)
private val Vfc = Color(0xFFB08CFF)
private val Sono = Color(0xFF8EA2FF)
private val Laranja = Color(0xFFF08A3C)

private const val PAINEL = "https://nossotudo.com.br/app/saude"
private val MODALIDADES = listOf("Musculação", "Natação", "Judô", "Jiu-jitsu", "Outro")

private val fmtHora = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
private fun hora(iso: String?) = iso?.let { runCatching { fmtHora.format(Instant.parse(it.replace("+00:00", "Z"))) }.getOrNull() } ?: "—"
private fun JSONObject.d(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null
private fun dur(min: Double) = "${(min / 60).toInt()} h ${String.format(Locale.US, "%02d", (min % 60).roundToInt())}"

private fun abrirPainel(ctx: Context) = ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PAINEL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

@Composable
private fun Bloco(modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(22.dp)).background(Cartao).border(1.dp, Borda, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { conteudo() }
}

@Composable
private fun Metrica(modifier: Modifier, rotulo: String, cor: Color, valor: String, unidade: String = "", rodape: String? = null, rodapeCor: Color = TextoSec) {
    Bloco(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(cor))
            Spacer(Modifier.width(6.dp))
            Text(rotulo, color = TextoSec, fontSize = 12.sp)
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(valor, color = Texto, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
            if (unidade.isNotEmpty()) Text(" $unidade", color = TextoSec, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))
        }
        rodape?.let { Text(it, color = rodapeCor, fontSize = 12.sp) }
    }
}

/** Barra de estágios do sono (proporção de cada estágio). */
@Composable
private fun BarraSono(est: JSONObject) {
    val partes = listOf("profundo" to Color(0xFF3D4FB8), "rem" to Vfc, "leve" to Sono, "acordado" to Ambar)
    val total = partes.sumOf { est.optDouble(it.first, 0.0) }.takeIf { it > 0 } ?: return
    Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))) {
        partes.forEach { (k, c) ->
            val f = (est.optDouble(k, 0.0) / total).toFloat()
            if (f > 0f) Box(Modifier.weight(f).fillMaxSize().background(c))
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        partes.forEach { (k, c) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(c))
                Text(" ${mapOf("profundo" to "prof.", "rem" to "REM", "leve" to "leve", "acordado" to "acord.")[k]} ${est.optInt(k)}m", color = TextoSec, fontSize = 11.sp)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Chips(escolha: String?, aoEscolher: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MODALIDADES.forEach { m ->
            val sel = escolha == m
            Text(
                m, color = if (sel) Color.White else Texto, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (sel) Laranja else Borda).clickable { aoEscolher(m) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            )
        }
    }
}

private fun ms(iso: String) = Instant.parse(iso.replace("+00:00", "Z")).toEpochMilli()

@Composable
private fun CartaoTreino(t: JSONObject, aoSalvar: () -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val partes = t.optJSONArray("partes")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }.orEmpty()
    val podeSeparar = partes.size >= 2
    var separar by remember { mutableStateOf(podeSeparar) }
    var escolha by remember { mutableStateOf(t.optString("palpite").ifEmpty { null }) }
    // uma escolha por parte (começa com o que o Samsung Health indicou, quando dá para mapear)
    val escolhas = remember { mutableStateOf(partes.map { it.optString("modalidade").ifEmpty { null } }) }
    var ocupado by remember { mutableStateOf(false) }

    fun corpo(inicio: Long, fim: Long, modalidade: String?, descartar: Boolean) =
        JSONObject().put("acao", "treino").put("segredo", Conexao.segredo(ctx)).put("inicio", inicio).put("fim", fim)
            .put("descartar", descartar).apply { modalidade?.let { put("modalidade", it) } }

    fun enviar(descartar: Boolean) = escopo.launch {
        ocupado = true
        val pedidos = if (separar && !descartar)
            partes.mapIndexed { i, p -> corpo(ms(p.getString("inicio")), ms(p.getString("fim")), escolhas.value[i], false) }
        else listOf(corpo(ms(t.getString("inicio")), ms(t.getString("fim")), escolha, descartar))
        val ok = runCatching { withContext(Dispatchers.IO) { pedidos.all { Conexao.post(it).first in 200..299 } } }.getOrDefault(false)
        ocupado = false
        if (ok) aoSalvar()
    }
    Bloco {
        Text("Possível treino · ${hora(t.optString("inicio"))}–${hora(t.optString("fim"))}", color = Texto, fontWeight = FontWeight.SemiBold)
        Text("${t.optInt("minutos")} min · média ${t.optInt("fc_media")} · pico ${t.optInt("fc_max")} bpm", color = TextoSec, fontSize = 13.sp)
        if (podeSeparar) {
            Text(
                if (separar) "✦ o Samsung Health registrou ${partes.size} atividades — escolha cada uma" else "✦ separar como no Samsung Health (${partes.size} atividades)",
                color = Vfc, fontSize = 12.sp, modifier = Modifier.clickable { separar = !separar },
            )
        } else if (t.optString("palpite").isNotEmpty()) {
            Text("✦ o Samsung Health registrou ${t.optString("palpite").lowercase()} nesse horário", color = Vfc, fontSize = 12.sp)
        }
        if (separar) {
            partes.forEachIndexed { i, p ->
                Text("${hora(p.optString("inicio"))}–${hora(p.optString("fim"))}", color = Texto, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                Chips(escolhas.value[i]) { m -> escolhas.value = escolhas.value.toMutableList().also { it[i] = m } }
            }
        } else {
            Chips(escolha) { escolha = it }
        }
        val pronto = if (separar) escolhas.value.all { it != null } else escolha != null
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { enviar(false) }, enabled = pronto && !ocupado, colors = ButtonDefaults.buttonColors(containerColor = Laranja)) {
                Text(if (separar) "Confirmar as ${partes.size}" else "Confirmar")
            }
            TextButton(onClick = { enviar(true) }, enabled = !ocupado) { Text("Não foi treino", color = TextoSec) }
        }
    }
}

private val DIARIO = listOf(
    "malestar" to "Mal-estar", "sintoma" to "Sintoma", "medicamento" to "Remédio", "alcool" to "Álcool",
    "cafeina" to "Cafeína", "doenca" to "Fiquei doente", "estresse" to "Estresse", "nota" to "Nota",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TelaHoje() {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var dados by remember { mutableStateOf<JSONObject?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var carregando by remember { mutableStateOf(false) }
    var recarregar by remember { mutableIntStateOf(0) }
    var diario by remember { mutableStateOf<Pair<String, String>?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(recarregar) {
        carregando = true; erro = null
        runCatching {
            withContext(Dispatchers.IO) { Conexao.post(JSONObject().put("acao", "hoje").put("segredo", Conexao.segredo(ctx))) }
        }.onSuccess { (http, r) -> if (http in 200..299 && r.optBoolean("ok")) dados = r else erro = r.optString("erro", "HTTP $http") }
            .onFailure { erro = "sem conexão" }
        carregando = false
    }

    Column(
        Modifier.fillMaxSize().background(Fundo).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.foundation.Image(painterResource(R.drawable.logo_nt_selo), "Nosso Tudo", Modifier.size(40.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Hoje", color = Texto, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Text(
                    java.time.LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", Locale.forLanguageTag("pt-BR"))),
                    color = TextoSec, fontSize = 13.sp,
                )
            }
            TextButton(onClick = { recarregar++ }, enabled = !carregando) { Text(if (carregando) "…" else "Atualizar", color = Verde) }
        }

        erro?.let { Text("Não deu para carregar: $it", color = Ambar, fontSize = 13.sp) }
        aviso?.let { Text(it, color = Verde, fontSize = 13.sp) }
        val d = dados ?: run { if (erro == null) Text("Carregando…", color = TextoSec); return@Column }

        // ---- Radar
        val radar = d.optJSONObject("radar")
        val nivel = radar?.optString("nivel") ?: "sem"
        val (corRadar, tituloRadar, textoRadar) = when (nivel) {
            "estresse" -> Triple(Ambar, "Corpo sob estresse", "Sinais fora do seu normal por mais de uma noite. Um dia mais leve e atenção a sintomas.")
            "observar" -> Triple(Color(0xFF7FB7D6), "Observar", "Algum sinal saiu do normal esta noite. Uma noite só costuma dizer pouco.")
            "normal" -> Triple(Verde, "Dentro do seu normal", "Repouso, VFC e pele na sua faixa.")
            "calibrando" -> Triple(TextoSec, "Conhecendo o seu normal", "O radar compara com você mesmo a partir de 7 noites medidas (${minOf(7, (radar?.optInt("base") ?: 0) + 1)} de 7).")
            else -> Triple(TextoSec, "Sem noite medida", "Durma com o relógio para o radar avaliar a noite.")
        }
        Bloco {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(corRadar))
                Spacer(Modifier.width(8.dp))
                Text("Radar de Saúde", color = TextoSec, fontSize = 12.sp)
            }
            Text(tituloRadar, color = corRadar, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Text(textoRadar, color = TextoSec, fontSize = 13.sp)
        }

        // ---- Sono + Energy
        val sono = d.optJSONObject("sono")
        val est = sono?.optJSONObject("estagios_min")
        val dormido = est?.let { it.optDouble("leve", 0.0) + it.optDouble("profundo", 0.0) + it.optDouble("rem", 0.0) }
        Bloco {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(Sono)); Spacer(Modifier.width(6.dp))
                Text("Sono", color = TextoSec, fontSize = 12.sp, modifier = Modifier.weight(1f))
                d.optJSONObject("energia")?.d("score")?.let {
                    Text("Energy Score ", color = TextoSec, fontSize = 12.sp)
                    Text("${it.roundToInt()}", color = Verde, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (sono != null && dormido != null) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(dur(dormido), color = Texto, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
                    sono.d("nota")?.let { Text("  nota ${it.roundToInt()}", color = TextoSec, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp)) }
                }
                Text("${hora(sono.optString("inicio"))} – ${hora(sono.optString("fim"))}", color = TextoSec, fontSize = 12.sp)
                BarraSono(est)
            } else Text("Sem sono do Samsung Health nas últimas noites.", color = TextoSec, fontSize = 13.sp)
        }

        // ---- Métricas da noite
        val noite = d.optJSONObject("noite")
        fun delta(v: Double?, n: Double?, unidade: String, pct: Boolean = false, inverso: Boolean = false): Pair<String?, Color> {
            if (v == null || n == null || nivel == "calibrando") return null to TextoSec
            val x = if (pct) (v / n - 1) * 100 else v - n
            if (abs(x) < (if (pct) 3.0 else 1.0)) return "no seu normal" to TextoSec
            val ruim = if (inverso) x < 0 else x > 0
            return "${if (x > 0) "↑" else "↓"} ${abs(x).roundToInt()}${if (pct) "%" else " $unidade"} vs. normal" to (if (ruim) Ambar else Verde)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val rep = noite?.d("fc_repouso")
            val (t1, c1) = delta(rep, radar?.d("fc_normal"), "bpm")
            Metrica(Modifier.weight(1f), "Repouso", Coracao, rep?.roundToInt()?.toString() ?: "—", "bpm", t1 ?: "menor média da noite", c1)
            val v = noite?.d("vfc_noturna")
            val (t2, c2) = delta(v, radar?.d("vfc_normal"), "ms", pct = true, inverso = true)
            Metrica(Modifier.weight(1f), "VFC", Vfc, v?.roundToInt()?.toString() ?: "—", "ms", t2 ?: "RMSSD no sono", c2)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val sp = d.optJSONObject("spo2")
            Metrica(Modifier.weight(1f), "SpO₂", Color(0xFF45E3EA), sp?.d("media")?.roundToInt()?.toString() ?: "—", "%", sp?.d("min")?.let { "mínimo ${it.roundToInt()}%" })
            val pele = noite?.d("temp_pele")
            Metrica(Modifier.weight(1f), "Pele", Laranja, pele?.let { String.format(Locale("pt", "BR"), "%.1f", it) } ?: "—", "°C", "média no sono")
        }

        // ---- Treinos a confirmar
        val treinos = d.optJSONArray("treinos")
        if (treinos != null && treinos.length() > 0) {
            Text("Treinos a confirmar", color = Texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            for (i in 0 until treinos.length()) CartaoTreino(treinos.getJSONObject(i)) { aviso = "Treino salvo ✓"; recarregar++ }
        }

        // ---- Diário rápido
        Text("Diário rápido", color = Texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            DIARIO.forEach { (tipo, rotulo) ->
                Text(
                    rotulo, color = if (tipo == "malestar") Coracao else Texto, fontSize = 14.sp,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Cartao).border(1.dp, Borda, RoundedCornerShape(50))
                        .clickable { diario = tipo to rotulo }.padding(horizontal = 14.dp, vertical = 9.dp),
                )
            }
        }

        Button(
            onClick = { abrirPainel(ctx) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Verde),
        ) { Text("Ver painel completo", color = Color(0xFF0E2A14), fontWeight = FontWeight.SemiBold) }
        Text("Gráficos, noites, bateria do relógio e relatório para o médico ficam no site.", color = TextoSec, fontSize = 12.sp)
        Spacer(Modifier.height(16.dp))
    }

    diario?.let { (tipo, rotulo) ->
        var nota by remember(tipo) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { diario = null },
            title = { Text(rotulo) },
            text = {
                OutlinedTextField(
                    nota, { nota = it }, label = { Text(if (tipo == "medicamento") "Qual e quanto" else "Observação (opcional)") },
                    singleLine = false, modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val n = nota
                    diario = null
                    escopo.launch {
                        val corpo = JSONObject().put("acao", "evento").put("segredo", Conexao.segredo(ctx)).put("tipo", tipo)
                            .put("inicio", System.currentTimeMillis()).apply { if (n.isNotBlank()) put("nota", n) }
                        val ok = runCatching { withContext(Dispatchers.IO) { Conexao.post(corpo).first in 200..299 } }.getOrDefault(false)
                        aviso = if (ok) "$rotulo registrado no diário ✓" else "Não deu para salvar agora"
                    }
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { diario = null }) { Text("Cancelar") } },
        )
    }
}
