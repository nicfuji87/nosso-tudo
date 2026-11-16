package app.nossotudo.saude.wear.ui

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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.Sync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Conectar o relógio ao Nosso Tudo: o relógio mostra um código de 6 letras,
 * a pessoa digita em Nosso Tudo › Saúde › Conectar relógio. Depois mostra o status do envio.
 */
@Composable
fun TelaConectar() {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var status by remember { mutableStateOf(Sync.status(ctx)) }
    var codigo by remember { mutableStateOf<String?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var resultado by remember { mutableStateOf<String?>(null) }
    var tique by remember { mutableIntStateOf(0) }

    // Enquanto há código na tela, pergunta ao servidor a cada 5 s se já vincularam.
    LaunchedEffect(codigo) {
        val c = codigo ?: return@LaunchedEffect
        repeat(360) {
            delay(5_000)
            val ok = withContext(Dispatchers.IO) { runCatching { Sync.verificarVinculo(ctx) }.getOrDefault(false) }
            if (ok) {
                app.nossotudo.saude.wear.Automatico.garantir(ctx)
                Sync.enviarAgora(ctx)
                codigo = null
                status = Sync.status(ctx)
                return@LaunchedEffect
            }
        }
        if (codigo == c) { codigo = null; erro = "Código expirou. Gere outro." }
    }
    // Atualiza pendentes / último envio enquanto a tela está aberta.
    LaunchedEffect(Unit) { while (true) { delay(3_000); status = Sync.status(ctx); tique++ } }

    Redondo { e ->
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(if (status.vinculado) Cor.Acao.copy(alpha = 0.35f) else Color(0xFF1C221E), e.px(226), style = Stroke(e.px(3)))
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = e.d(70)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Logo(e)
                Spacer(Modifier.width(e.d(8)))
                Text("Nosso Tudo", color = Cor.Texto, fontSize = e.s(17), fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(e.d(14)))
            when {
                codigo != null -> {
                    Text("Digite este código em", color = Cor.TextoSec, fontSize = e.s(13))
                    Text("Saúde › Conectar relógio", color = Cor.ProntidaoClaro, fontSize = e.s(13), fontWeight = FontWeight.SemiBold)
                    Text(
                        codigo!!.chunked(3).joinToString(" "),
                        color = Cor.Texto, fontSize = e.s(52), fontWeight = FontWeight.Bold, letterSpacing = e.s(4),
                        modifier = Modifier.padding(vertical = e.d(10)),
                    )
                    Text("aguardando… vale 30 min", color = Cor.TextoTerc, fontSize = e.s(12))
                }
                status.vinculado -> {
                    Text("Conectado ✓", color = Cor.Acao, fontSize = e.s(24), fontWeight = FontWeight.Bold)
                    status.nome?.let { Text(it, color = Cor.TextoSec, fontSize = e.s(13)) }
                    Spacer(Modifier.height(e.d(10)))
                    Text(
                        if (status.ultimoEnvio > 0) "último envio ${idade(status.ultimoEnvio)}" else "ainda não enviou",
                        color = Cor.Texto, fontSize = e.s(14),
                    )
                    Text(
                        if (status.pendentes == 0) "nada pendente" else "${status.pendentes} itens na fila",
                        color = Cor.TextoTerc, fontSize = e.s(12),
                    )
                    Text(
                        if (app.nossotudo.saude.wear.ColetaService.rodando) "● medindo em segundo plano" else "medição automática desligada",
                        color = if (app.nossotudo.saude.wear.ColetaService.rodando) Cor.Acao else Cor.TextoTerc, fontSize = e.s(11),
                    )
                    resultado?.let { Text(it, color = if (it.startsWith("Enviado")) Cor.Acao else Cor.Habito, fontSize = e.s(12), textAlign = TextAlign.Center) }
                        ?: status.erro?.let { Text(it, color = Cor.Habito, fontSize = e.s(11), textAlign = TextAlign.Center) }
                    Spacer(Modifier.height(e.d(12)))
                    Pilula(e, if (ocupado) "Enviando…" else "Enviar agora", {
                        if (ocupado) return@Pilula
                        ocupado = true; resultado = null
                        escopo.launch {
                            val r = withContext(Dispatchers.IO) { runCatching { Sync.enviarTudoAgora(ctx) } }
                            ocupado = false
                            status = Sync.status(ctx)
                            resultado = r.fold(
                                onSuccess = {
                                    when {
                                        it.erro != null -> "Falhou: ${it.erro}"
                                        it.enviados > 0 -> "Enviado ✓ ${it.enviados} itens"
                                        else -> "Nada novo para enviar. Meça em Coração ou faça um check-in."
                                    }
                                },
                                onFailure = { "Sem conexão (${it.javaClass.simpleName})" },
                            )
                        }
                    })
                }
                else -> {
                    Text(
                        "Envie batimento, VFC, ECG e registros para o painel de Saúde da família.",
                        color = Cor.TextoSec, fontSize = e.s(13), textAlign = TextAlign.Center,
                    )
                    erro?.let { Text(it, color = Cor.Habito, fontSize = e.s(12), textAlign = TextAlign.Center, modifier = Modifier.padding(top = e.d(6))) }
                    Spacer(Modifier.height(e.d(14)))
                    Pilula(e, if (ocupado) "Gerando…" else "Gerar código", {
                        if (ocupado) return@Pilula
                        ocupado = true; erro = null
                        escopo.launch {
                            val r = withContext(Dispatchers.IO) { runCatching { Sync.anunciar(ctx) } }
                            ocupado = false
                            r.onSuccess { codigo = it }.onFailure { erro = "Sem conexão com o Nosso Tudo (${it.message})" }
                        }
                    })
                }
            }
        }
    }
}

/** Símbolo do Nosso Tudo (cruz de blocos). */
@Composable
private fun Logo(e: Escala) {
    Canvas(Modifier.width(e.d(18)).height(e.d(18))) {
        val c = size.minDimension / 3f
        val r = androidx.compose.ui.geometry.CornerRadius(c * 0.3f)
        val tons = listOf(Color(0xFF8FDE95), Color(0xFF5FAF6A), Color(0xFF8FA993), Color(0xFF3D7A4A), Color(0xFFB9E6BD))
        listOf(1 to 0, 0 to 1, 1 to 1, 2 to 1, 1 to 2).forEachIndexed { i, (x, y) ->
            drawRoundRect(tons[i], androidx.compose.ui.geometry.Offset(x * c + 1, y * c + 1), androidx.compose.ui.geometry.Size(c - 2, c - 2), r)
        }
    }
}
