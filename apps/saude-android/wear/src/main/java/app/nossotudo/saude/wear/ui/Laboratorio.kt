package app.nossotudo.saude.wear.ui

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.ColetaService
import app.nossotudo.saude.wear.Sensores
import app.nossotudo.saude.wear.iniciarColeta
import app.nossotudo.saude.wear.pararColeta
import kotlinx.coroutines.delay
import java.io.File

/** Ferramentas da Fase 1: coleta contínua para análise no PC e capacidades do relógio. */
@Composable
fun TelaLaboratorio(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    var resumo by remember { mutableStateOf(ColetaService.resumo) }
    var rodando by remember { mutableStateOf(ColetaService.rodando) }
    var capacidades by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (true) { resumo = ColetaService.resumo; rodando = ColetaService.rodando; delay(1500) }
    }

    Redondo { e ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = e.d(56), bottom = e.d(70), start = e.d(60), end = e.d(60)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(e.d(10)),
        ) {
            Titulo(e, "Laboratório", Icone.Frasco, Cor.Lab)
            val sync = remember(resumo) { app.nossotudo.saude.wear.Sync.status(ctx) }
            Pilula(e, if (sync.vinculado) "Nosso Tudo · conectado" else "Conectar ao Nosso Tudo", { ir(Rota.CONECTAR) })
            if (sync.vinculado) {
                val auto = remember(resumo) { app.nossotudo.saude.wear.Automatico.ligadoPeloUsuario(ctx) }
                Pilula(
                    e, if (auto) "Medição automática: ligada" else "Medição automática: desligada",
                    { app.nossotudo.saude.wear.Automatico.definir(ctx, !auto); resumo = ColetaService.resumo },
                    fundo = if (auto) Cor.Acao.copy(alpha = 0.18f) else Cor.Chip, cor = if (auto) Cor.ProntidaoClaro else Cor.TextoSec,
                )
            }
            Text(resumo, color = Cor.TextoSec, fontSize = e.s(13), textAlign = TextAlign.Center)
            val laboratorio = rodando && ColetaService.modo == ColetaService.MODO_LAB
            if (!laboratorio) {
                Pilula(e, "Coletar (HR, acel, temp)", { ctx.iniciarColeta(comPpg = false) }, icone = Icone.Play)
                Pilula(e, "Coletar + PPG 25 Hz", { ctx.iniciarColeta(comPpg = true) }, fundo = Cor.Chip, cor = Cor.Texto)
            } else {
                Pilula(e, "Parar coleta", { ctx.pararColeta() }, fundo = Color(0xFF2A1215), cor = Color(0xFFFFB3BB), icone = Icone.Parar)
            }
            Pilula(e, "Capacidades do relógio", {
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
            }, fundo = Cor.Chip, cor = Cor.Texto)
            capacidades?.let { Text(it, color = Cor.TextoTerc, fontSize = e.s(11), textAlign = TextAlign.Center) }
            Spacer(Modifier.height(e.d(4)))
            Text("Os dados ficam no relógio até o PC puxar.", color = Cor.TextoTerc, fontSize = e.s(11), textAlign = TextAlign.Center,
                modifier = Modifier.width(e.d(300)))
        }
    }
}
