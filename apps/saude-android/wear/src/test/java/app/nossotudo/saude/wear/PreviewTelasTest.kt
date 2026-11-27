package app.nossotudo.saude.wear

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.core.app.ApplicationProvider
import androidx.wear.compose.material3.AppScaffold
import app.nossotudo.saude.wear.ui.SaudeWearTema
import app.nossotudo.saude.wear.ui.TelaCheckin
import app.nossotudo.saude.wear.ui.TelaConectar
import app.nossotudo.saude.wear.ui.TelaCoracao
import app.nossotudo.saude.wear.ui.TelaDiagnostico
import app.nossotudo.saude.wear.ui.TelaEcg
import app.nossotudo.saude.wear.ui.TelaHabitos
import app.nossotudo.saude.wear.ui.TelaHoje
import app.nossotudo.saude.wear.ui.TelaLaboratorio
import app.nossotudo.saude.wear.ui.TelaMais
import app.nossotudo.saude.wear.ui.TelaMalEstar
import app.nossotudo.saude.wear.ui.TelaOrtostatico
import app.nossotudo.saude.wear.ui.TelaProntidao
import app.nossotudo.saude.wear.ui.TelaRegistrar
import app.nossotudo.saude.wear.ui.TelaRegistros
import app.nossotudo.saude.wear.ui.TelaRespiracao
import app.nossotudo.saude.wear.ui.TelaSono
import app.nossotudo.saude.wear.ui.TelaTreinos
import app.nossotudo.saude.wear.ui.TelaVfc
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate

/**
 * Previews reais das telas no formato do Galaxy Watch6 (tela redonda, 480 px, ~226 dp, 340 dpi),
 * com dados de exemplo. Não roda nos testes normais: só com -Psaude.previews.
 * Saída: PNGs em wear/build/previews
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w226dp-h226dp-round-watch-340dpi")
class PreviewTelasTest {
    @get:Rule val regra = createComposeRule()
    private val ctx: Context get() = ApplicationProvider.getApplicationContext()
    private val saida = File("build/previews").apply { mkdirs() }

    @Suppress("UNCHECKED_CAST")
    private fun fluxo(nome: String, valor: Any?) {
        val f = EstadoSaude::class.java.getDeclaredField(nome).apply { isAccessible = true }
        (f.get(null) as MutableStateFlow<Any?>).value = valor
    }

    private fun servico(rodando: Boolean) {
        ColetaService::class.java.getDeclaredField("rodando").apply { isAccessible = true }.setBoolean(null, rodando)
    }

    @Before fun dados() {
        assumeTrue("previews só com -Psaude.previews", System.getProperty("saude.previews") == "true")
        val agora = System.currentTimeMillis()
        EstadoSaude.iniciar(ctx)
        servico(true) // a coleta contínua alimenta o estado: as telas não tentam ligar o sensor Samsung
        fluxo("_bpm", 64)
        fluxo("_bpmTs", agora - 95_000)
        EstadoSaude.ultimoLoteMs = agora - 80_000
        fluxo("_serieBpm", (0 until 60).map { EstadoSaude.Ponto(agora - (60 - it) * 60_000L, 62f + 6f * kotlin.math.sin(it / 6.0).toFloat() + (it % 7)) })
        fluxo("_faixaHoje", 52 to 118)
        fluxo("_qualidadeIbi", 0.86f)
        fluxo("_rmssdAgora", 41f)
        fluxo("_janelasHoje", (0 until 14).map { EstadoSaude.Janela(agora - (14 - it) * 300_000L, 32f + (it * 7 % 19), if (it == 4) 0.6f else 0.95f) })

        ProntidaoServidor.salvar(
            ctx,
            JSONObject()
                .put("dia", LocalDate.now().toString()).put("score", 72).put("nivel", "moderado")
                .put("confianca", "media").put("referencia_provisoria", false)
                .put("confianca_motivo", "2 de 3 sinais medidos; base de 18 noites")
                .put("algoritmo", "prontidao-v2")
                .put(
                    "fatores", JSONArray()
                        .put(JSONObject().put("texto", "5 h 40 min dormidos").put("efeito", -12))
                        .put(JSONObject().put("texto", "VFC 34 ms (normal 41)").put("efeito", -8))
                        .put(JSONObject().put("texto", "Repouso 56 bpm (normal 55)").put("efeito", 0)),
                )
                .put("sono", JSONObject().put("horas", 5.67).put("estado", "completo").put("deitar", "23:10").put("acordar", "06:45")),
            agora - 25 * 60_000L,
        )
        ctx.getSharedPreferences("sync", Context.MODE_PRIVATE).edit()
            .putString("radar_nivel", "normal").putBoolean("vinculado", true).putString("nome", "Nicolas")
            .putLong("ultimo_envio", agora - 12 * 60_000L).apply()
        File(ctx.filesDir, "registros.jsonl").writeText(
            listOf(
                Triple(agora - 20 * 60_000L, "habito", "Café"),
                Triple(agora - 95 * 60_000L, "checkin", "bem"),
                Triple(agora - 3 * 3_600_000L, "malestar", "levantando"),
                Triple(agora - 26 * 3_600_000L, "respiracao", "4-7-8 · 4 ciclos"),
                Triple(agora - 27 * 3_600_000L, "ortostatico", "{\"s\":false,\"d\":58,\"p\":92,\"m1\":84,\"m3\":79}"),
            ).asReversed().joinToString("\n", postfix = "\n") { (ts, t, v) ->
                JSONObject().put("id", "x$ts").put("ts", ts).put("tipo", t).put("valor", v).toString()
            },
        )
    }

    private fun tela(nome: String, rolar: Int = 0, conteudo: @Composable () -> Unit) {
        regra.mainClock.autoAdvance = false // relógios da tela (delay em laço) nunca deixariam o Compose ocioso
        regra.setContent {
            Box(Modifier.fillMaxSize().background(Color(0xFF202020))) {
                Box(Modifier.fillMaxSize().clip(CircleShape)) {
                    SaudeWearTema { AppScaffold { conteudo() } }
                }
            }
        }
        regra.mainClock.advanceTimeBy(1_500)
        regra.onRoot().captureRoboImage(File(saida, "$nome.png").path)
        repeat(rolar) { k ->
            regra.onRoot().performTouchInput { swipeUp(startY = centerY + height * 0.3f, endY = centerY - height * 0.3f) }
            regra.mainClock.advanceTimeBy(1_500)
            regra.onRoot().captureRoboImage(File(saida, "${nome}_${k + 2}.png").path)
        }
    }

    private val nada: (String) -> Unit = {}

    @Test fun hoje() = tela("01_hoje", rolar = 2) { TelaHoje(nada) }
    @Test fun hojeFonteGrande() { RuntimeEnvironment.setFontScale(1.24f); tela("01_hoje_fonte_grande", rolar = 1) { TelaHoje(nada) } }
    @Test fun hojeSemNota() {
        ctx.getSharedPreferences("sync", Context.MODE_PRIVATE).edit().putString("pront_dia", LocalDate.now().minusDays(1).toString()).apply()
        servico(false)
        fluxo("_bpmTs", System.currentTimeMillis() - 42 * 60_000L)
        tela("02_hoje_sem_nota_e_sensor_parado") { TelaHoje(nada) }
    }
    @Test fun coracao() = tela("03_coracao", rolar = 1) { TelaCoracao() }
    @Test fun vfc() = tela("04_vfc", rolar = 1) { TelaVfc() }
    @Test fun prontidao() = tela("05_prontidao", rolar = 1) { TelaProntidao() }
    @Test fun sono() = tela("06_sono", rolar = 1) { TelaSono() }
    @Test fun registrar() = tela("07_registrar") { TelaRegistrar(nada) }
    @Test fun treinos() = tela("08_treinos", rolar = 1) { TelaTreinos(nada) }
    @Test fun mais() = tela("09_mais", rolar = 2) { TelaMais(nada) }
    @Test fun diagnostico() = tela("10_diagnostico", rolar = 1) { TelaDiagnostico() }
    @Test fun sintoma() = tela("11_sintoma", rolar = 1) { TelaMalEstar(nada) }
    @Test fun checkin() = tela("12_checkin") { TelaCheckin({}, nada) }
    @Test fun habitos() = tela("13_habitos", rolar = 1) { TelaHabitos() }
    @Test fun registros() = tela("14_registros", rolar = 1) { TelaRegistros() }
    @Test fun respiracao() = tela("15_respiracao") { TelaRespiracao() }
    @Test fun ecg() = tela("16_ecg") { TelaEcg() }
    @Test fun ortostatico() = tela("17_teste_em_pe") { TelaOrtostatico() }
    @Test fun laboratorio() = tela("18_laboratorio", rolar = 1) { TelaLaboratorio(nada) }
    @Test fun conectar() = tela("19_conexao") { TelaConectar() }
}
