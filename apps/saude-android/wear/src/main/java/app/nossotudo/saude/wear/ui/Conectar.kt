package app.nossotudo.saude.wear.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import app.nossotudo.saude.wear.Automatico
import app.nossotudo.saude.wear.ColetaService
import app.nossotudo.saude.wear.R
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
    val ctx = LocalContextAtual()
    val escopo = rememberCoroutineScope()
    var status by remember { mutableStateOf(Sync.status(ctx)) }
    var codigo by remember { mutableStateOf<String?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var resultado by remember { mutableStateOf<String?>(null) }

    // Enquanto há código na tela, pergunta ao servidor a cada 5 s se já vincularam.
    LaunchedEffect(codigo) {
        val c = codigo ?: return@LaunchedEffect
        repeat(360) {
            delay(5_000)
            val ok = withContext(Dispatchers.IO) { runCatching { Sync.verificarVinculo(ctx) }.getOrDefault(false) }
            if (ok) {
                Automatico.garantir(ctx)
                Sync.enviarAgora(ctx)
                codigo = null
                status = Sync.status(ctx)
                return@LaunchedEffect
            }
        }
        if (codigo == c) { codigo = null; erro = "Código expirou. Gere outro." }
    }
    // Atualiza pendentes / último envio enquanto a tela está aberta.
    LaunchedEffect(Unit) { while (true) { delay(3_000); status = Sync.status(ctx) } }

    fun enviar() {
        if (ocupado) return
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
                        else -> "Nada novo para enviar."
                    }
                },
                onFailure = { "Sem conexão (${it.javaClass.simpleName})" },
            )
        }
    }

    fun gerar() {
        if (ocupado) return
        ocupado = true; erro = null
        escopo.launch {
            val r = withContext(Dispatchers.IO) { runCatching { Sync.anunciar(ctx) } }
            ocupado = false
            r.onSuccess { codigo = it }.onFailure { erro = "Sem conexão com o Nosso Tudo (${it.message})" }
        }
    }

    TelaLista(botaoBorda = when {
        codigo != null -> null
        status.vinculado -> ({ BotaoBorda(if (ocupado) "Enviando…" else "Enviar agora") { enviar() } })
        else -> ({ BotaoBorda(if (ocupado) "Gerando…" else "Gerar código") { gerar() } })
    }) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.logo_nt_selo), contentDescription = null, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(6.dp))
                Text("Nosso Tudo", color = Cor.Texto, style = MaterialTheme.typography.titleSmall)
            }
        }
        when {
            codigo != null -> {
                item { Nota("Digite este código em Saúde › Conectar relógio", Cor.TextoSec) }
                item {
                    Text(
                        codigo!!.chunked(3).joinToString(" "), color = Cor.Texto,
                        style = MaterialTheme.typography.displayMedium.tabular(), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    )
                }
                item { Nota("aguardando… vale 30 min", Cor.TextoTerc) }
            }
            status.vinculado -> {
                item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Etiqueta("conectado" + (status.nome?.let { " · $it" } ?: ""), Cor.Acao) } }
                item {
                    Column {
                        LinhaInfo("Último envio", if (status.ultimoEnvio > 0) "${hora(status.ultimoEnvio)} (${idade(status.ultimoEnvio)})" else "nunca")
                        LinhaInfo("Na fila", if (status.pendentes == 0) "nada" else "${status.pendentes}")
                        LinhaInfo(
                            "Medição", if (ColetaService.rodando) "em segundo plano" else "desligada",
                            if (ColetaService.rodando) Cor.Acao else Cor.Atencao,
                        )
                    }
                }
                (resultado ?: status.erro)?.let { m -> item { Nota(m, if (m.startsWith("Enviado")) Cor.Acao else Cor.Atencao) } }
            }
            else -> {
                item { Nota("Envie batimento, VFC, ECG e registros para o painel de Saúde da família.", Cor.TextoSec) }
                erro?.let { m -> item { Nota(m, Cor.Atencao) } }
            }
        }
    }
}

@Composable
private fun LocalContextAtual() = androidx.compose.ui.platform.LocalContext.current
