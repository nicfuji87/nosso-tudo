package app.nossotudo.saude.wear.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.EstadoSaude
import app.nossotudo.saude.wear.MonitorCardiaco
import app.nossotudo.saude.wear.Registros
import kotlinx.coroutines.delay
import org.json.JSONObject
import kotlin.math.roundToInt

private enum class FaseTeste { INICIO, DEITADO, EM_PE, RESULTADO }

private const val DEITADO_S = 120
private const val EM_PE_S = 180

private fun vibrar(ctx: Context, ms: Long = 600) {
    val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
    else @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)
    runCatching { v?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)) }
}

/** Média dos valores medidos entre os segundos [de, ate) (ignora segundos sem leitura). */
private fun media(serie: List<Int?>, de: Int, ate: Int): Int? =
    serie.subList(de.coerceIn(0, serie.size), ate.coerceIn(0, serie.size)).filterNotNull().takeIf { it.size >= 5 }?.average()?.roundToInt()

/**
 * Teste ortostático ativo: 2 min deitado e parado → levanta → 3 min em pé parado.
 * Mede quanto o batimento sobe ao ficar de pé (útil para quem sente tontura ao levantar).
 * Não é diagnóstico: o resultado vai para o diário e para o relatório do médico.
 */
@Composable
fun TelaOrtostatico() {
    val ctx = LocalContext.current
    val monitor = remember { MonitorCardiaco(ctx) }
    DisposableEffect(Unit) { monitor.iniciar(); onDispose { monitor.parar() } }
    val bpm by EstadoSaude.bpm.collectAsState()

    var fase by remember { mutableStateOf(FaseTeste.INICIO) }
    var segundos by remember { mutableIntStateOf(0) }
    val deitado = remember { mutableStateListOf<Int?>() }
    val emPe = remember { mutableStateListOf<Int?>() }
    var salvo by remember { mutableStateOf(false) }

    // Relógio do teste: 1 amostra por segundo do batimento mais recente (só se a leitura tiver < 3 s).
    LaunchedEffect(fase) {
        if (fase != FaseTeste.DEITADO && fase != FaseTeste.EM_PE) return@LaunchedEffect
        segundos = 0
        val limite = if (fase == FaseTeste.DEITADO) DEITADO_S else EM_PE_S
        while (segundos < limite) {
            delay(1_000)
            val recente = System.currentTimeMillis() - EstadoSaude.bpmTs.value < 3_000
            val v = if (recente) EstadoSaude.bpm.value else null
            if (fase == FaseTeste.DEITADO) deitado.add(v) else emPe.add(v)
            segundos++
        }
        if (fase == FaseTeste.DEITADO) { vibrar(ctx, 800); fase = FaseTeste.EM_PE } else { vibrar(ctx, 300); fase = FaseTeste.RESULTADO }
    }

    val repouso = remember(fase) { media(deitado, DEITADO_S - 60, DEITADO_S) }
    val pico = remember(fase) { emPe.take(60).filterNotNull().maxOrNull() }
    val m1 = remember(fase) { media(emPe, 50, 70) }
    val m3 = remember(fase) { media(emPe, EM_PE_S - 20, EM_PE_S) }

    fun salvar(sintomas: Boolean) {
        if (salvo) return
        val o = JSONObject().put("s", sintomas)
        repouso?.let { o.put("d", it) }; pico?.let { o.put("p", it) }; m1?.let { o.put("m1", it) }; m3?.let { o.put("m3", it) }
        Registros.adicionar(ctx, "ortostatico", o.toString())
        salvo = true
    }

    Redondo { e ->
        val total = when (fase) { FaseTeste.DEITADO -> DEITADO_S; FaseTeste.EM_PE -> EM_PE_S; else -> 1 }
        val cor = if (fase == FaseTeste.EM_PE) Cor.Coracao else Cor.Sono
        Canvas(Modifier.fillMaxSize()) {
            arcoBorda(e, 226, 10, Color(0xFF16181F), 135f, 270f)
            if (fase == FaseTeste.DEITADO || fase == FaseTeste.EM_PE) arcoBorda(e, 226, 10, cor, 135f, 270f * segundos / total)
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = e.d(56)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Titulo(e, "Teste em pé", Icone.Coracao, Cor.Coracao)
            Spacer(Modifier.height(e.d(10)))
            when (fase) {
                FaseTeste.INICIO -> {
                    Text("2 min deitado e parado,\ndepois 3 min em pé parado.", color = Cor.Texto, fontSize = e.s(15),
                        textAlign = TextAlign.Center)
                    Text("O relógio vibra na hora de levantar.", color = Cor.TextoTerc, fontSize = e.s(12),
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = e.d(6)))
                    Spacer(Modifier.height(e.d(16)))
                    Pilula(e, "Deitei, começar", { deitado.clear(); emPe.clear(); salvo = false; fase = FaseTeste.DEITADO },
                        modifier = Modifier.width(e.d(240)))
                }
                FaseTeste.DEITADO, FaseTeste.EM_PE -> {
                    Text(if (fase == FaseTeste.DEITADO) "Fique deitado e parado" else "Em pé, parado", color = cor,
                        fontSize = e.s(16), fontWeight = FontWeight.SemiBold)
                    Numero(e, bpm?.toString() ?: SEM_VALOR, "bpm", 84)
                    val falta = total - segundos
                    Text("%d:%02d".format(falta / 60, falta % 60), color = Cor.TextoSec, fontSize = e.s(18))
                    if (fase == FaseTeste.EM_PE && segundos < 4) {
                        Text("Levante agora!", color = Cor.Coracao, fontSize = e.s(14), fontWeight = FontWeight.Bold)
                    }
                }
                FaseTeste.RESULTADO -> {
                    val delta = if (repouso != null && m3 != null) m3 - repouso else null
                    Text(delta?.let { "${if (it >= 0) "+" else ""}$it bpm em pé" } ?: "Leitura insuficiente",
                        color = Cor.Texto, fontSize = e.s(24), fontWeight = FontWeight.Bold)
                    Text("deitado ${repouso ?: "—"} · pico ${pico ?: "—"} · 3 min ${m3 ?: "—"}",
                        color = Cor.TextoSec, fontSize = e.s(13), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(e.d(12)))
                    if (!salvo) {
                        Text("Sentiu tontura ou mal-estar?", color = Cor.TextoSec, fontSize = e.s(13))
                        Spacer(Modifier.height(e.d(8)))
                        Row(horizontalArrangement = Arrangement.spacedBy(e.d(10))) {
                            Pilula(e, "Não", { salvar(false) }, fundo = Cor.Chip, cor = Cor.Texto, modifier = Modifier.width(e.d(130)))
                            Pilula(e, "Sim", { salvar(true) }, fundo = Cor.Ecg, cor = Color.White, modifier = Modifier.width(e.d(130)))
                        }
                    } else {
                        Text("Salvo no diário ✓", color = Cor.Acao, fontSize = e.s(16), fontWeight = FontWeight.SemiBold)
                        Text("Aparece no relatório para o médico.", color = Cor.TextoTerc, fontSize = e.s(11))
                    }
                }
            }
        }
    }
}
