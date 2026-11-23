package app.nossotudo.saude.wear.ui

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.Automatico
import app.nossotudo.saude.wear.ColetaService
import app.nossotudo.saude.wear.Sensores
import app.nossotudo.saude.wear.Sync
import app.nossotudo.saude.wear.iniciarColeta
import app.nossotudo.saude.wear.pararColeta
import kotlinx.coroutines.delay
import java.io.File

/** Laboratório técnico: medição automática, coleta bruta para análise no PC e capacidades do relógio. */
@Composable
fun TelaLaboratorio(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    var resumo by remember { mutableStateOf(ColetaService.resumo) }
    var rodando by remember { mutableStateOf(ColetaService.rodando) }
    var capacidades by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (true) { resumo = ColetaService.resumo; rodando = ColetaService.rodando; delay(1500) }
    }
    val sync = remember(resumo) { Sync.status(ctx) }
    val auto = remember(resumo) { Automatico.ligadoPeloUsuario(ctx) }
    val laboratorio = rodando && ColetaService.modo == ColetaService.MODO_LAB

    TelaLista {
        item { Cabecalho("Laboratório técnico", Cor.Lab) }
        if (!sync.vinculado) {
            item { BotaoSecao("Conectar ao Nosso Tudo", null, Icone.Elo, Cor.Acao) { ir(Rota.CONECTAR) } }
        } else {
            item {
                SwitchButton(
                    checked = auto,
                    onCheckedChange = { Automatico.definir(ctx, it); resumo = ColetaService.resumo },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Medição automática") },
                    secondaryLabel = { Text(if (auto) "ligada · dia e noite" else "desligada") },
                )
            }
        }
        item { Nota(resumo, Cor.TextoSec) }
        if (!laboratorio) {
            item { BotaoSecao("Coletar HR, acel, temp", "arquivos no relógio", Icone.Play, Cor.Lab) { ctx.iniciarColeta(comPpg = false) } }
            item { BotaoSecao("Coletar + PPG 25 Hz", "mais bateria", Icone.Play, Cor.Lab) { ctx.iniciarColeta(comPpg = true) } }
        } else {
            item { BotaoSecao("Parar coleta", null, Icone.Parar, Color(0xFFFFB3BB)) { ctx.pararColeta() } }
        }
        item {
            BotaoSecao("Capacidades do relógio", "rastreadores Samsung", Icone.Sinal, Cor.Lab) {
                capacidades = "Consultando…"
                val s = Sensores(ctx)
                s.conectar(
                    onOk = {
                        val tipos = s.suportados().map { it.name }.sorted()
                        File(ctx.filesDir, "capacidades.txt").writeText(
                            "modelo=${Build.MODEL} sdk=${Build.VERSION.SDK_INT}\nbuild=${Build.DISPLAY}\n" +
                                "rastreadores_suportados=${tipos.size}\n" + tipos.joinToString("\n"),
                        )
                        capacidades = "${tipos.size} rastreadores: " + tipos.joinToString(", ")
                        s.desconectar()
                    },
                    onFalha = { err ->
                        capacidades = "Falha: ${Sensores.descreverErro(err)}"
                        s.desconectar()
                        if (err.hasResolution()) (ctx as? Activity)?.let { a -> a.runOnUiThread { err.resolve(a) } }
                    },
                )
            }
        }
        capacidades?.let { c -> item { Nota(c, Cor.TextoTerc) } }
        item { Nota("Os dados brutos ficam no relógio até o PC puxar.", Cor.TextoTerc) }
    }
}
