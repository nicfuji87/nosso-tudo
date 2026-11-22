package app.nossotudo.saude.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Aba Saúde: as tendências de 30 dias que importam para o dia a dia — repouso, VFC, sono, SpO₂,
 * temperatura da pele, passos e Energy Score — contra o seu normal, mais composição corporal e
 * os resultados do Samsung Health Monitor. Não é diagnóstico.
 */
@Composable
fun TelaSaude() {
    val ctx = LocalContext.current
    var dados by remember { mutableStateOf<JSONObject?>(null) }
    var erro by remember { mutableStateOf(false) }
    var carregando by remember { mutableStateOf(false) }
    var recarregar by remember { mutableIntStateOf(0) }

    LaunchedEffect(recarregar) {
        carregando = true
        val r = chamar(ctx, "tendencias")
        if (r != null) { dados = r; erro = false } else erro = true
        carregando = false
    }

    Column(
        Modifier.fillMaxSize().background(Cor.Fundo).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Saúde", color = Cor.Texto, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Pequeno("últimos 30 dias · tracejado = o seu normal")
            }
            TextButton(onClick = { recarregar++ }, enabled = !carregando) { Text(if (carregando) "…" else "Atualizar", color = Cor.Verde) }
        }
        val d = dados
        if (d == null) {
            Text(if (erro) "Não deu para carregar agora (sem conexão?)." else "Carregando…", color = Cor.TextoSec)
            return@Column
        }
        val noites = d.optJSONArray("noites").objetos()
        val normais = d.optJSONObject("normais")
        val serie = { k: String -> noites.map { it.num(k) } }
        normais?.let { n ->
            val base = n.optInt("base")
            if (base < 7) Pequeno("Aprendendo o seu normal: $base de 7 noites. Até lá os normais são provisórios.", Cor.Ambar)
        }

        Tendencia("Repouso (menor FC da noite)", Cor.Coracao, serie("fc"), "bpm", normais?.num("fc"), casas = 0, subirRuim = true,
            dica = "Subir 3+ bpm acima do seu normal por 2 noites costuma acompanhar treino pesado, pouco sono, álcool ou início de infecção.")
        Tendencia("VFC noturna", Cor.Roxo, serie("vfc"), "ms", normais?.num("vfc"), casas = 0, subirRuim = false,
            dica = "Maior é melhor. Quedas fortes vêm com estresse, treino duro, álcool ou doença. Noites com captação ruim ficam em branco.")
        Tendencia("Sono", Cor.Azul, serie("sono_h"), "h", 7.5, casas = 1, subirRuim = false,
            dica = "Meta de 7 a 9 h para adultos ativos; regularidade do horário de deitar conta tanto quanto a duração.")
        Tendencia("SpO₂ noturna (média)", Cor.Ciano, serie("spo2"), "%", normais?.num("spo2"), casas = 0, subirRuim = false,
            extra = noites.lastOrNull { it.num("spo2_min") != null }?.num("spo2_min")?.let { "mínima da última noite ${it.roundToInt()}%" },
            dica = "Média acima de 95% é o esperado; quedas pontuais no pulso costumam ser ruído. Quedas frequentes abaixo de 88–90%: vale o teste de apneia.")
        Tendencia("Temperatura da pele (noite)", Cor.Laranja, serie("pele"), "°C", normais?.num("pele"), casas = 1, subirRuim = true,
            extra = noites.lastOrNull()?.optString("fonte_temp")?.takeIf { it == "samsung" }?.let { "última noite pelo Samsung Health" },
            dica = "O que importa é a diferença para o seu normal: +0,5 °C ou mais junto com repouso alto é sinal para observar.")

        val passos = d.optJSONArray("passos").objetos()
        if (passos.isNotEmpty()) Tendencia("Passos por dia", Cor.Verde, passos.map { it.num("total") }, "", null, casas = 0, subirRuim = false, barras = true,
            dica = "7.000 a 10.000 passos por dia já trazem a maior parte do benefício.")
        val energia = d.optJSONArray("energia").objetos()
        if (energia.isNotEmpty()) Tendencia("Energy Score (Samsung)", Cor.Ambar, energia.map { it.num("score") }, "", null, casas = 0, subirRuim = false)

        CartaoCorpo(d)
        CartaoMonitor(d)
        Pequeno("Dados de bem-estar medidos no pulso. Não substituem avaliação médica. Em dor no peito, desmaio ou falta de ar, procure atendimento.")
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun Tendencia(
    titulo: String, cor: Color, valores: List<Double?>, unidade: String, normal: Double?, casas: Int, subirRuim: Boolean,
    extra: String? = null, dica: String? = null, barras: Boolean = false,
) {
    val reais = valores.filterNotNull()
    CartaoNT(titulo = titulo, cor = cor) {
        if (reais.isEmpty()) { Pequeno("Sem dados ainda."); return@CartaoNT }
        val ultimo = valores.lastOrNull { it != null }!!
        val media7 = valores.takeLast(7).filterNotNull().let { if (it.isEmpty()) null else it.average() }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(if (unidade == "" && ultimo >= 1000) milhar(ultimo) else fmt(ultimo, casas), color = Cor.Texto, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
            if (unidade.isNotEmpty()) Text(" $unidade", color = Cor.TextoSec, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))
            Spacer(Modifier.padding(start = 10.dp))
            normal?.let { n ->
                val delta = ultimo - n
                val limiar = if (casas == 0) 1.0 else 0.15
                val (txt, c) = when {
                    abs(delta) < limiar -> "no seu normal" to Cor.TextoSec
                    (delta > 0) == subirRuim -> "${if (delta > 0) "↑" else "↓"} ${fmt(abs(delta), casas)} vs. ${if (titulo == "Sono") "meta" else "normal"}" to Cor.Ambar
                    else -> "${if (delta > 0) "↑" else "↓"} ${fmt(abs(delta), casas)} vs. ${if (titulo == "Sono") "meta" else "normal"}" to Cor.Verde
                }
                Text(txt, color = c, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
            }
        }
        Sparkline(valores, cor, normal = normal, barras = barras)
        Pequeno(listOfNotNull(media7?.let { "média 7 dias ${if (unidade == "" && it >= 1000) milhar(it) else fmt(it, casas)}" }, normal?.let { "normal ${fmt(it, casas)}" }, extra).joinToString(" · "))
        dica?.let { Pequeno(it) }
    }
}

@Composable
private fun CartaoCorpo(d: JSONObject) {
    val corpo = d.optJSONArray("corpo").objetos()
    CartaoNT(titulo = "Composição corporal", cor = Color(0xFF7FB7D6)) {
        val u = corpo.lastOrNull()
        if (u == null) {
            Pequeno("Meça no relógio: Samsung Health › Composição corporal (2 dedos nos botões, ~15 s, em jejum e de manhã para comparar melhor). Útil para musculação e para a categoria de peso no judô.")
            return@CartaoNT
        }
        Text(
            listOfNotNull(u.num("peso")?.let { "${fmt(it, 1)} kg" }, u.num("gordura_pct")?.let { "${fmt(it, 1)}% gordura" }, u.num("musculo_kg")?.let { "músculo ${fmt(it, 1)} kg" }).joinToString(" · "),
            color = Cor.Texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
        )
        Pequeno("medido ${diaDe(u.optString("ts"))}")
        if (corpo.size >= 2) Sparkline(corpo.map { it.num("gordura_pct") }, Color(0xFF7FB7D6))
    }
}

@Composable
private fun CartaoMonitor(d: JSONObject) {
    CartaoNT(titulo = "Samsung Health Monitor", cor = Cor.Roxo) {
        val ap = d.optJSONObject("apneia")
        Pequeno(
            when (ap?.optString("sinal")) {
                "DETECTED" -> "Apneia do sono: sinais detectados (${diaDe(ap.optString("ts"))}) — leve ao médico."
                "NOT_DETECTED" -> "Apneia do sono: sem sinais (${diaDe(ap.optString("ts"))})."
                null -> "Apneia do sono: ainda não feito. Ative no Samsung Health Monitor (2 noites com 4 h ou mais em até 10 dias)."
                else -> "Apneia do sono: inconclusivo (${diaDe(ap.optString("ts"))})."
            },
            Cor.Texto,
        )
        val ritmo = d.optInt("ritmo_irregular")
        Pequeno(if (ritmo > 0) "Ritmo irregular: $ritmo aviso(s) no último ano — leve ao médico." else "Ritmo irregular: nenhum aviso.", Cor.Texto)
    }
}
