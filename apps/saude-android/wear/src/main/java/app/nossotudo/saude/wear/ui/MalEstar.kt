package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.EstadoSaude
import app.nossotudo.saude.wear.Registros
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val SITUACOES = listOf(
    "deitado" to "Deitado",
    "levantando" to "Levantando",
    "parado" to "Parado",
    "esforco" to "No esforço",
)

/**
 * Sintoma / mal-estar em um toque: grava o horário e a situação na hora (funciona sem rede) e envia já.
 * O painel junta o batimento de 10 min antes a 10 min depois para levar ao médico.
 * Não é alerta nem diagnóstico; em dor no peito, desmaio ou falta de ar, procure atendimento.
 */
@Composable
fun TelaMalEstar(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    var registradoAs by remember { mutableStateOf<String?>(null) }
    val bpm by EstadoSaude.bpm.collectAsState()

    TelaLista(botaoBorda = registradoAs?.let { { BotaoBorda("Fazer ECG", Cor.Ecg, Color.White) { ir(Rota.ECG) } } }) {
        item { Cabecalho("Sintoma", Cor.Ecg) }
        if (registradoAs == null) {
            item {
                Text(
                    "O que você estava fazendo?", color = Cor.Texto, style = MaterialTheme.typography.titleSmall,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
            SITUACOES.forEach { (valor, rotulo) ->
                item {
                    Button(
                        onClick = {
                            Registros.malEstar(ctx, valor)
                            registradoAs = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                        },
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Registrar sintoma: $rotulo" },
                        colors = ButtonDefaults.filledTonalButtonColors(containerColor = Cor.Ecg.copy(alpha = 0.16f), contentColor = Cor.Texto),
                        label = { Text(rotulo) },
                    )
                }
            }
            item { Nota("Grava o horário mesmo sem internet.", Cor.TextoTerc) }
        } else {
            item { ValorGrande("✓", "", "registrado às $registradoAs", Cor.Acao, Cor.Acao) }
            bpm?.let { b -> item { LinhaInfo("Batimento agora", "$b bpm") } }
            item {
                Nota(
                    "O batimento de 10 min antes a 10 min depois fica no painel. Dor no peito, desmaio ou falta de ar: procure atendimento.",
                    Cor.TextoTerc,
                )
            }
        }
    }
}
