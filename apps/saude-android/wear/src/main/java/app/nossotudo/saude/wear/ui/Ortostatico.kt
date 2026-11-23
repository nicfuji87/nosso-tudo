package app.nossotudo.saude.wear.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.LinearProgressIndicator
import androidx.wear.compose.material3.MaterialTheme
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

    val total = when (fase) { FaseTeste.DEITADO -> DEITADO_S; FaseTeste.EM_PE -> EM_PE_S; else -> 1 }
    val cor = if (fase == FaseTeste.EM_PE) Cor.Coracao else Cor.Sono

    TelaLista(botaoBorda = when (fase) {
        FaseTeste.INICIO -> ({ BotaoBorda("Começar") { deitado.clear(); emPe.clear(); salvo = false; fase = FaseTeste.DEITADO } })
        FaseTeste.DEITADO, FaseTeste.EM_PE -> ({ BotaoBorda("Cancelar", Cor.Elevada, Cor.Texto) { fase = FaseTeste.INICIO } })
        FaseTeste.RESULTADO -> null
    }) {
        item { Cabecalho("Teste em pé", Cor.Coracao) }
        when (fase) {
            FaseTeste.INICIO -> {
                item { Nota("Deite antes de começar: 2 min deitado e parado, depois 3 min em pé parado.", Cor.Texto) }
                item { Nota("O relógio vibra na hora de levantar.", Cor.TextoTerc) }
            }
            FaseTeste.DEITADO, FaseTeste.EM_PE -> {
                item {
                    Text(
                        if (fase == FaseTeste.DEITADO) "Fique deitado e parado" else if (segundos < 4) "Levante agora!" else "Em pé, parado",
                        color = cor, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    )
                }
                item { ValorGrande(bpm?.toString() ?: SEM_VALOR, "bpm", null) }
                item {
                    val falta = total - segundos
                    Nota("faltam %d:%02d".format(falta / 60, falta % 60), Cor.TextoSec)
                }
                item {
                    LinearProgressIndicator(
                        progress = { segundos / total.toFloat() },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(6.dp),
                        colors = androidx.wear.compose.material3.ProgressIndicatorDefaults.colors(indicatorColor = cor, trackColor = Cor.Elevada),
                    )
                }
            }
            FaseTeste.RESULTADO -> {
                val delta = if (repouso != null && m3 != null) m3 - repouso else null
                item {
                    ValorGrande(delta?.let { "${if (it >= 0) "+" else ""}$it" } ?: SEM_VALOR, "bpm",
                        if (delta != null) "diferença em pé" else "leitura insuficiente")
                }
                item {
                    Column0 {
                        LinhaInfo("Deitado", repouso?.let { "$it bpm" } ?: SEM_VALOR)
                        LinhaInfo("Pico (1º min)", pico?.let { "$it bpm" } ?: SEM_VALOR)
                        LinhaInfo("Aos 3 min", m3?.let { "$it bpm" } ?: SEM_VALOR)
                    }
                }
                if (!salvo) {
                    item { Nota("Sentiu tontura ou mal-estar?", Cor.Texto) }
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Button(
                                onClick = { salvar(false) }, modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.filledTonalButtonColors(containerColor = Cor.Superficie, contentColor = Cor.Texto),
                                label = { Text("Não") },
                            )
                            Button(
                                onClick = { salvar(true) }, modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = Cor.Ecg, contentColor = Color.White),
                                label = { Text("Sim") },
                            )
                        }
                    }
                } else {
                    item { Nota("Salvo no diário ✓ · aparece no relatório para o médico.", Cor.Acao) }
                }
            }
        }
    }
}

@Composable
private fun Column0(conteudo: @Composable () -> Unit) = androidx.compose.foundation.layout.Column { conteudo() }
