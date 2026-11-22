package app.nossotudo.saude.mobile

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Aba Treinos (treinos-v2): cronômetro para treinar sem o Samsung Health, tempo de recuperação,
 * semana (minutos OMS, intensidade 80/20, modalidades), recuperação cardíaca e a lista de treinos
 * com zonas pela sua FC máxima. Os números vêm da Edge Function (ação "treinos").
 */
private val MODALIDADES = listOf("Musculação", "Natação", "Judô", "Jiu-jitsu", "Corrida", "Caminhada", "Outro")
private val ICONE = mapOf(
    "Musculação" to "🏋", "Natação" to "🏊", "Judô" to "🥋", "Jiu-jitsu" to "🥋", "Corrida" to "🏃", "Caminhada" to "🚶",
)

/** Treino cronometrado no celular (fica salvo mesmo se o app fechar). */
private object Cronometro {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("cronometro", Context.MODE_PRIVATE)
    fun inicio(ctx: Context) = p(ctx).getLong("inicio", 0L)
    fun modalidade(ctx: Context) = p(ctx).getString("modalidade", null)
    fun iniciar(ctx: Context, modalidade: String) = p(ctx).edit().putLong("inicio", System.currentTimeMillis()).putString("modalidade", modalidade).apply()
    fun limpar(ctx: Context) = p(ctx).edit().clear().apply()
}

private fun duracao(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) String.format(PT_BR, "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) else String.format(PT_BR, "%02d:%02d", s / 60, s % 60)
}

@Composable
fun TelaTreinos() {
    val ctx = LocalContext.current
    var dados by remember { mutableStateOf<JSONObject?>(null) }
    var erro by remember { mutableStateOf(false) }
    var carregando by remember { mutableStateOf(false) }
    var recarregar by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(recarregar) {
        carregando = true
        val r = chamar(ctx, "treinos")
        if (r != null) { dados = r; erro = false } else erro = true
        carregando = false
    }

    Column(
        Modifier.fillMaxSize().background(Cor.Fundo).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Treinos", color = Cor.Texto, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Pequeno("zonas pela sua FC máxima · recuperação · semana")
            }
            TextButton(onClick = { recarregar++ }, enabled = !carregando) { Text(if (carregando) "…" else "Atualizar", color = Cor.Verde) }
        }
        aviso?.let { Text(it, color = Cor.Verde, fontSize = 13.sp) }
        CartaoCronometro { msg -> aviso = msg; recarregar++ }

        val d = dados
        if (d == null) {
            Text(if (erro) "Não deu para carregar agora (sem conexão?)." else "Carregando…", color = Cor.TextoSec)
            return@Column
        }
        CartaoRecuperacao(d)
        CartaoSemana(d)
        CartaoRecuperacaoCardiaca(d)

        Titulo("Últimos treinos")
        val limites = d.optJSONArray("zonas_bpm")?.let { a -> (0 until a.length()).map { a.optInt(it) } }.orEmpty()
        val lista = d.optJSONArray("treinos").objetos()
        if (lista.isEmpty()) Pequeno("Nenhum treino nos últimos 35 dias.")
        lista.forEach { t -> CartaoTreino(t, limites) { msg -> aviso = msg; recarregar++ } }
        d.num("fcmax")?.let { Pequeno("FC máxima usada nas zonas: ${it.roundToInt()} bpm (a maior que o relógio já viu em treino).") }
        Spacer(Modifier.height(16.dp))
    }
}

/** Iniciar / encerrar um treino pelo celular (para quando não gravar no Samsung Health do relógio). */
@Composable
private fun CartaoCronometro(aoSalvar: (String) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var inicio by remember { mutableLongStateOf(Cronometro.inicio(ctx)) }
    var modalidade by remember { mutableStateOf(Cronometro.modalidade(ctx) ?: "Jiu-jitsu") }
    var agora by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var encerrando by remember { mutableStateOf(false) }
    var esforco by remember { mutableStateOf<Int?>(null) }
    var ocupado by remember { mutableStateOf(false) }

    LaunchedEffect(inicio) { while (inicio > 0) { agora = System.currentTimeMillis(); delay(1000) } }

    CartaoNT(titulo = if (inicio > 0) "Treino em andamento" else "Cronometrar um treino", cor = if (inicio > 0) Cor.Laranja else Cor.TextoSec) {
        if (inicio == 0L) {
            Pequeno("Vai treinar sem gravar no relógio? Escolha e toque em Iniciar — o batimento vem do relógio na próxima sincronização.")
            Chips(MODALIDADES, modalidade) { modalidade = it }
            Button(
                onClick = { Cronometro.iniciar(ctx, modalidade); inicio = Cronometro.inicio(ctx) },
                colors = ButtonDefaults.buttonColors(containerColor = Cor.Laranja),
            ) { Text("Iniciar $modalidade") }
        } else {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(duracao(agora - inicio), color = Cor.Texto, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                Text("  ${ICONE[modalidade] ?: "⏱"} $modalidade", color = Cor.TextoSec, fontSize = 15.sp, modifier = Modifier.padding(bottom = 8.dp))
            }
            Pequeno("começou ${horaDe(java.time.Instant.ofEpochMilli(inicio).toString())}")
            if (!encerrando) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { encerrando = true }, colors = ButtonDefaults.buttonColors(containerColor = Cor.Laranja)) { Text("Encerrar") }
                    TextButton(onClick = { Cronometro.limpar(ctx); inicio = 0 }) { Text("Cancelar", color = Cor.TextoSec) }
                }
            } else {
                Pequeno("Esforço percebido (0 = repouso · 10 = máximo)")
                Chips((0..10).map { it.toString() }, esforco?.toString()) { esforco = it.toInt() }
                Button(
                    enabled = !ocupado,
                    onClick = {
                        escopo.launch {
                            ocupado = true
                            val fim = System.currentTimeMillis()
                            val r = if (fim - inicio < 3 * 60_000L) null else chamar(ctx, "treino") {
                                put("inicio", inicio).put("fim", fim).put("modalidade", modalidade).put("manual", true)
                                esforco?.let { put("esforco", it) }
                            }
                            ocupado = false
                            val tempo = duracao(fim - inicio)
                            val curto = fim - inicio < 3 * 60_000L
                            if (r != null) {
                                Cronometro.limpar(ctx); inicio = 0; encerrando = false; esforco = null
                                aoSalvar("$modalidade salvo ✓ ($tempo)")
                            } else aoSalvar(if (curto) "Treino muito curto (menos de 3 min)." else "Não deu para salvar — tente de novo com internet.")
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Cor.Verde),
                ) { Text("Salvar treino", color = Cor.VerdeEscuro) }
            }
        }
    }
}

/** Tempo de recuperação (recuperacao-tempo-v1) + prontidão de hoje + carga da semana. */
@Composable
private fun CartaoRecuperacao(d: JSONObject) {
    val rec = d.optJSONObject("recuperacao")
    val pront = d.optJSONObject("prontidao")
    val restantes = rec?.optInt("horas_restantes") ?: 0
    val (cor, titulo) = when {
        rec == null -> Cor.Verde to "Descansado"
        restantes == 0 -> Cor.Verde to "Recuperado"
        restantes <= 12 -> Cor.Ambar to "Quase lá"
        else -> Cor.Coracao to "Recuperando"
    }
    CartaoNT(titulo = "Recuperação", cor = cor) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(titulo, color = cor, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            if (restantes > 0) Text("  faltam ~$restantes h", color = Cor.Texto, fontSize = 16.sp, modifier = Modifier.padding(bottom = 4.dp))
        }
        if (rec != null) {
            val mods = rec.optJSONArray("modalidades")?.let { a -> (0 until a.length()).joinToString(" + ") { a.optString(it) } } ?: "treino"
            Pequeno(
                "Último bloco: $mods (${diaDe(rec.optString("fim"))}, carga ${rec.optInt("carga_bloco")}) pede ~${rec.optInt("horas_necessarias")} h. " +
                    if (restantes > 0) "Treino forte de novo a partir de ${diaDe(rec.optString("pronto_em"))} ${horaDe(rec.optString("pronto_em"))}; até lá, técnica ou leve." else "Pode treinar forte.",
            )
        } else Pequeno("Nenhum treino puxado nos últimos 4 dias.")
        pront?.let { p ->
            p.num("score")?.let { s ->
                Pequeno(
                    "Prontidão de hoje ${s.roundToInt()}" + (p.optJSONObject("sono")?.num("horas")?.let { h -> " · sono ${fmt(h, 1)} h" } ?: ""),
                    if (s >= 80) Cor.Verde else if (s >= 60) Cor.Ambar else Cor.Coracao,
                )
            }
        }
        val c7 = d.optJSONObject("ultimos7")?.optInt("carga") ?: 0
        val media = d.optInt("carga_media_semana")
        if (media > 0) {
            val razao = c7.toDouble() / media
            Pequeno(
                "Carga 7 dias $c7 · sua média semanal $media (${fmt(razao, 1)}×)" +
                    if (razao > 1.5) " — bem acima do habitual: risco maior de lesão." else if (razao > 1.3) " — acima do habitual." else "",
                if (razao > 1.3) Cor.Ambar else Cor.TextoSec,
            )
        }
    }
}

/** Semana: minutos OMS, intensidade 80/20, modalidades e comparação com a semana anterior. */
@Composable
private fun CartaoSemana(d: JSONObject) {
    val s = d.optJSONObject("semana") ?: return
    val ant = d.optJSONObject("semana_anterior")
    val z = s.optJSONArray("zonas")?.let { a -> (0 until 5).map { a.optInt(it) } } ?: List(5) { 0 }
    CartaoNT(titulo = "Esta semana", cor = Cor.Laranja) {
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Column { Text("${s.optInt("treinos")}", color = Cor.Texto, fontSize = 24.sp, fontWeight = FontWeight.SemiBold); Pequeno("treinos") }
            Column { Text("${s.optInt("minutos")}", color = Cor.Texto, fontSize = 24.sp, fontWeight = FontWeight.SemiBold); Pequeno("minutos") }
            Column { Text("${s.optInt("carga")}", color = Cor.Texto, fontSize = 24.sp, fontWeight = FontWeight.SemiBold); Pequeno("carga") }
        }
        ant?.let { a ->
            val dm = s.optInt("minutos") - a.optInt("minutos")
            Pequeno("Semana passada: ${a.optInt("treinos")} treinos, ${a.optInt("minutos")} min (${if (dm >= 0) "+" else ""}$dm min nesta)")
        }
        // OMS: 150–300 min de moderado por semana (vigoroso conta em dobro)
        val oms = s.optInt("minutos_oms")
        Spacer(Modifier.height(4.dp))
        Pequeno("Atividade que conta para a OMS: $oms de 150 min (meta 150–300; vigoroso conta em dobro)", Cor.Texto)
        Progresso(oms / 300f, if (oms >= 150) Cor.Verde else Cor.Ambar)
        // distribuição de intensidade: a maioria dos atletas evolui melhor com ~80% leve e ~20% forte
        val total = z.sum()
        if (total > 0) {
            val leve = z[0] + z[1]
            val forte = z[3] + z[4]
            Spacer(Modifier.height(4.dp))
            BarraZonas(z)
            Pequeno(
                "Leve ${(leve * 100 / total)}% · moderado ${(z[2] * 100 / total)}% · forte ${(forte * 100 / total)}%" +
                    if (forte * 100 / total > 30) " — muito tempo em zona forte; o ideal costuma ser ~80% leve / 20% forte." else "",
            )
        }
        s.optJSONObject("por_modalidade")?.let { m ->
            val itens = m.keys().asSequence().map { it to m.optInt(it) }.sortedByDescending { it.second }.toList()
            if (itens.isNotEmpty()) Pequeno(itens.joinToString(" · ") { (k, v) -> "${ICONE[k] ?: "•"} $k $v min" })
        }
    }
}

/** Recuperação cardíaca: quanto a FC cai no 1º minuto depois do treino (maior = melhor condicionamento). */
@Composable
private fun CartaoRecuperacaoCardiaca(d: JSONObject) {
    val lista = d.optJSONArray("hrr").objetos()
    CartaoNT(titulo = "Recuperação cardíaca", cor = Cor.Coracao) {
        if (lista.isEmpty()) {
            Pequeno("Aparece depois de treinos fortes que terminam sem outro em seguida (ex.: o último do dia). Na natação o sensor não mede bem.")
            return@CartaoNT
        }
        val media = d.num("hrr_media")?.roundToInt()
        Row(verticalAlignment = Alignment.Bottom) {
            Text("−${media ?: "—"}", color = Cor.Coracao, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("  bpm no 1º minuto, em média", color = Cor.TextoSec, fontSize = 13.sp, modifier = Modifier.padding(bottom = 5.dp))
        }
        val max = (lista.maxOf { it.optInt("queda1") }).coerceAtLeast(30)
        Row(Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
            lista.forEach { x ->
                val q = x.optInt("queda1").coerceAtLeast(1)
                Box(Modifier.weight(1f).fillMaxHeight(q.toFloat() / max).clip(RoundedCornerShape(3.dp)).background(Cor.Coracao.copy(alpha = 0.75f)))
            }
        }
        lista.lastOrNull()?.let { u ->
            Pequeno("Último: ${u.optString("modalidade", "treino")} ${diaDe(u.optString("inicio"))} — de ${u.optInt("fc_fim")} caiu ${u.optInt("queda1")} bpm em ~1 min" +
                (u.num("queda2")?.let { " e ${it.roundToInt()} em ~2 min" } ?: ""))
        }
        Pequeno("Quanto mais cai, melhor o condicionamento. Medida aproximada (média por minuto do relógio): compare com você mesmo. Quedas pequenas que se repetem depois de treinos fortes merecem conversa com o médico.")
    }
}

@Composable
private fun CartaoTreino(t: JSONObject, limites: List<Int>, aoMudar: (String) -> Unit) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var aberto by remember { mutableStateOf(false) }
    var confirmar by remember { mutableStateOf(false) }
    val mod = t.optString("modalidade").ifEmpty { "Treino" }
    val zonas = t.optJSONArray("zonas")?.let { a -> (0 until 5).map { a.optInt(it) } } ?: emptyList()
    val origem = when (t.optString("origem")) { "samsung" -> "Samsung Health"; "manual" -> "cronometrado"; "detectado" -> "detectado"; else -> "" }

    CartaoNT(Modifier.clickable { aberto = !aberto }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${ICONE[mod] ?: "⏱"}  $mod", color = Cor.Texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Pequeno("${diaDe(t.optString("inicio"))} ${horaDe(t.optString("inicio"))}–${horaDe(t.optString("fim"))}")
        }
        Pequeno(
            listOfNotNull(
                "${t.optInt("minutos")} min",
                t.num("fc_media")?.let { "FC média ${it.roundToInt()}" },
                t.num("fc_pico")?.let { "pico ${it.roundToInt()}" },
                t.num("carga")?.takeIf { it > 0 }?.let { "carga ${it.roundToInt()}" },
                t.num("calorias")?.let { "${it.roundToInt()} kcal" },
                t.num("distancia_m")?.takeIf { it > 0 }?.let { if (it >= 1000) "${fmt(it / 1000, 2)} km" else "${it.roundToInt()} m" },
                t.num("esforco")?.let { "esforço ${it.roundToInt()}/10" },
            ).joinToString(" · "),
            Cor.Texto,
        )
        if (zonas.sum() > 0) BarraZonas(zonas, 8) else Pequeno("Sem batimento do relógio neste horário.")
        t.optJSONObject("recuperacao")?.let { r ->
            Pequeno("❤ Recuperação: de ${r.optInt("fc_fim")} caiu ${r.optInt("queda1")} bpm em ~1 min" + (r.num("queda2")?.let { " · ${it.roundToInt()} em ~2 min" } ?: ""), Cor.Coracao)
        }
        if (origem.isNotEmpty()) Pequeno(origem + if (mod == "Natação") " · FC na água é pouco confiável" else "")

        if (aberto) {
            if (zonas.sum() > 0) LegendaZonas(zonas, limites)
            Pequeno("Trocar a modalidade:")
            Chips(MODALIDADES, mod) { novo ->
                escopo.launch {
                    val r = chamar(ctx, "treino_editar") { put("id", t.optString("id")).put("modalidade", novo) }
                    aoMudar(if (r != null) "Agora é $novo ✓" else "Não deu para salvar.")
                }
            }
            OutlinedButton(onClick = { confirmar = true }) { Text("Excluir este treino", color = Cor.Coracao) }
        }
    }
    if (confirmar) {
        AlertDialog(
            onDismissRequest = { confirmar = false },
            title = { Text("Excluir $mod?") },
            text = { Text("Some da carga, da semana e da recuperação. Se veio do Samsung Health, não volta na próxima sincronização.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmar = false
                    escopo.launch {
                        val r = chamar(ctx, "treino_editar") { put("id", t.optString("id")).put("descartar", true) }
                        aoMudar(if (r != null) "$mod excluído." else "Não deu para excluir.")
                    }
                }) { Text("Excluir", color = Cor.Coracao) }
            },
            dismissButton = { TextButton(onClick = { confirmar = false }) { Text("Cancelar") } },
        )
    }
}
