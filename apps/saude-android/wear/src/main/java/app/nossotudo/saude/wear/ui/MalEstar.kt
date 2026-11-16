package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
 * Mal-estar em um toque: grava o horário e a situação na hora (funciona sem rede) e envia já.
 * O painel junta o batimento de 10 min antes a 10 min depois para levar ao médico.
 * Não é alerta nem diagnóstico; em dor no peito, desmaio ou falta de ar, procure atendimento.
 */
@Composable
fun TelaMalEstar(ir: (String) -> Unit) {
    val ctx = LocalContext.current
    var registradoAs by remember { mutableStateOf<String?>(null) }
    val bpm by EstadoSaude.bpm.collectAsState()

    Redondo { e ->
        Column(
            Modifier.fillMaxSize().padding(horizontal = e.d(48)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Titulo(e, "Mal-estar", Icone.Ecg, Cor.Ecg)
            if (registradoAs == null) {
                Text(
                    "O que você estava fazendo?", color = Cor.Texto, fontSize = e.s(17), fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center, modifier = Modifier.padding(top = e.d(10), bottom = e.d(14)),
                )
                SITUACOES.chunked(2).forEach { linha ->
                    Row(horizontalArrangement = Arrangement.spacedBy(e.d(10)), modifier = Modifier.padding(bottom = e.d(10))) {
                        linha.forEach { (valor, rotulo) ->
                            Box(
                                Modifier.width(e.d(160)).height(e.d(64))
                                    .background(Cor.Ecg.copy(alpha = 0.13f), RoundedCornerShape(e.d(32)))
                                    .border(e.d(2), Cor.Ecg.copy(alpha = 0.35f), RoundedCornerShape(e.d(32)))
                                    .clickable {
                                        Registros.malEstar(ctx, valor)
                                        registradoAs = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                    }
                                    .semantics { contentDescription = "Mal-estar: $rotulo" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(rotulo, color = Cor.CoracaoClaro, fontSize = e.s(15), fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Text("grava o horário mesmo sem internet", color = Cor.TextoTerc, fontSize = e.s(11))
            } else {
                Text("Registrado ✓", color = Cor.Acao, fontSize = e.s(24), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = e.d(10)))
                Text("às $registradoAs" + (bpm?.let { " · $it bpm agora" } ?: ""), color = Cor.TextoSec, fontSize = e.s(14))
                Spacer(Modifier.height(e.d(14)))
                Pilula(e, "Fazer ECG agora", { ir(Rota.ECG) }, fundo = Cor.Ecg, cor = Color.White, icone = Icone.Ecg,
                    modifier = Modifier.width(e.d(240)))
                Spacer(Modifier.height(e.d(12)))
                Text(
                    "Seu batimento de 10 min antes a 10 min depois fica no painel. Dor no peito, desmaio ou falta de ar: procure atendimento.",
                    color = Cor.TextoTerc, fontSize = e.s(11), textAlign = TextAlign.Center, modifier = Modifier.width(e.d(330)),
                )
            }
        }
    }
}

/** Atalho compacto para o mal-estar, usado no Check-in. */
@Composable
fun AtalhoMalEstar(e: Escala, ir: (String) -> Unit) {
    Box(
        Modifier.size(width = e.d(170), height = e.d(40))
            .background(Cor.Ecg.copy(alpha = 0.12f), RoundedCornerShape(e.d(20)))
            .clickable { ir(Rota.MALESTAR) }
            .semantics { contentDescription = "Registrar mal-estar" },
        contentAlignment = Alignment.Center,
    ) {
        Text("Mal-estar agora", color = Cor.CoracaoClaro, fontSize = e.s(13), fontWeight = FontWeight.SemiBold)
    }
}
