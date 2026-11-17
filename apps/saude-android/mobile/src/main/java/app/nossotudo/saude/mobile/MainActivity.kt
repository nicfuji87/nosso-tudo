package app.nossotudo.saude.mobile

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.samsung.android.sdk.health.data.error.HealthDataException
import com.samsung.android.sdk.health.data.error.ResolvablePlatformException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

private val Verde = Color(0xFF8FDE95)
private val Fundo = Color(0xFF0B0E0C)
private val CartaoCor = Color(0xFF151A17)
private val TextoSec = Color(0xFFB4B9B4)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // ao abrir: garante o agendamento e já sincroniza (sem precisar tocar no botão)
        if (Conexao.vinculado(this)) { SamsungSync.agendar(this); SamsungSync.agora(this) }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Verde, onPrimary = Color(0xFF0E2A14), background = Fundo)) {
                Raiz(this)
            }
        }
    }
}

@Composable
private fun Cartao(titulo: String, conteudo: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = CartaoCor),
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(titulo, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            conteudo()
        }
    }
}

@Composable
private fun Ponto(ok: Boolean) {
    Spacer(Modifier.size(10.dp).clip(CircleShape).background(if (ok) Verde else Color(0xFF5A605C)))
}

@Composable
private fun Raiz(activity: Activity) {
    val ctx = LocalContext.current
    // conectado → abre em "Hoje"; ainda configurando → abre em "Ajustes"
    var aba by remember { mutableStateOf(if (Conexao.vinculado(ctx)) 0 else 1) }
    androidx.compose.material3.Scaffold(
        containerColor = Fundo,
        modifier = Modifier.safeDrawingPadding(),
        bottomBar = {
            androidx.compose.material3.NavigationBar(containerColor = CartaoCor) {
                listOf("Hoje" to "◎", "Ajustes" to "⚙").forEachIndexed { i, (rotulo, simbolo) ->
                    NavigationBarItem(
                        selected = aba == i, onClick = { aba = i },
                        icon = { Text(simbolo, fontSize = 18.sp) }, label = { Text(rotulo) },
                        colors = androidx.compose.material3.NavigationBarItemDefaults.colors(
                            selectedTextColor = Verde, selectedIconColor = Color(0xFF0E2A14), indicatorColor = Verde,
                            unselectedTextColor = TextoSec, unselectedIconColor = TextoSec,
                        ),
                    )
                }
            }
        },
    ) { margem ->
        Box(Modifier.padding(margem)) { if (aba == 0) TelaHoje() else TelaAjustes(activity) }
    }
}

@Composable
private fun TelaAjustes(activity: Activity) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var vinculado by remember { mutableStateOf(Conexao.vinculado(ctx)) }
    var codigo by remember { mutableStateOf<String?>(null) }
    var concedidas by remember { mutableStateOf<Int?>(null) }
    var mensagem by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var ultima by remember { mutableStateOf(SamsungSync.ultimaSync(ctx)) }

    LaunchedEffect(Unit) {
        concedidas = runCatching { withContext(Dispatchers.IO) { SamsungSync.permissoesConcedidas(ctx).size } }.getOrNull()
        if (vinculado) vinculado = runCatching { withContext(Dispatchers.IO) { Conexao.verificar(ctx) } }.getOrDefault(vinculado)
    }
    // com código na tela, pergunta a cada 5 s se já foi conectado no site
    LaunchedEffect(codigo) {
        if (codigo == null) return@LaunchedEffect
        repeat(360) {
            delay(5_000)
            if (runCatching { withContext(Dispatchers.IO) { Conexao.verificar(ctx) } }.getOrDefault(false)) {
                vinculado = true; codigo = null; SamsungSync.agendar(ctx); return@LaunchedEffect
            }
        }
    }

    fun tratar(e: Throwable) {
        if (e is ResolvablePlatformException && e.hasResolution) e.resolve(activity)
        mensagem = when (e) {
            is HealthDataException -> "Samsung Health: ${e.message ?: e.javaClass.simpleName}"
            else -> "${e.javaClass.simpleName}: ${e.message}"
        }
    }

    Column(
        Modifier.fillMaxSize().background(Fundo).verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column {
            androidx.compose.foundation.Image(
                painter = androidx.compose.ui.res.painterResource(R.drawable.logo_nt_selo),
                contentDescription = "Nosso Tudo",
                modifier = Modifier.size(56.dp),
            )
            Spacer(Modifier.height(12.dp))
            Text("Saúde NT", color = Verde, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("Samsung Health → Nosso Tudo", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(
                "Sono com estágios, SpO₂, temperatura da pele, treinos e Energy Score vão para o painel de Saúde, junto com o relógio.",
                color = TextoSec, fontSize = 14.sp,
            )
        }

        Cartao("1 · Conectar ao Nosso Tudo") {
            when {
                vinculado -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Ponto(true); Text("Conectado ✓ ${Conexao.prefs(ctx).getString("nome", "") ?: ""}", color = Color.White)
                }
                codigo != null -> {
                    Text("No Nosso Tudo, vá em Saúde › Conectar relógio e digite:", color = TextoSec, fontSize = 14.sp)
                    Text(codigo!!.chunked(3).joinToString(" "), color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)
                    Text("aguardando… vale 30 min. Dê o nome \"Celular\".", color = TextoSec, fontSize = 12.sp)
                }
                else -> Button(onClick = {
                    escopo.launch {
                        ocupado = true
                        runCatching { withContext(Dispatchers.IO) { Conexao.anunciar(ctx) } }
                            .onSuccess { codigo = it }.onFailure { mensagem = "Sem conexão com o Nosso Tudo (${it.message})" }
                        ocupado = false
                    }
                }, enabled = !ocupado) { Text("Gerar código") }
            }
        }

        Cartao("2 · Permitir leitura do Samsung Health") {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Ponto((concedidas ?: 0) > 0)
                Text(
                    when (concedidas) { null -> "verificando…"; 0 -> "nenhuma permissão ainda"; else -> "$concedidas de ${SamsungSync.PERMISSOES.size} tipos liberados" },
                    color = Color.White,
                )
            }
            Text("Só leitura: sono, SpO₂, temperatura da pele, treinos e Energy Score.", color = TextoSec, fontSize = 13.sp)
            OutlinedButton(onClick = {
                escopo.launch {
                    runCatching { SamsungSync.pedirPermissoes(activity).size }.onSuccess { concedidas = it }.onFailure { tratar(it) }
                }
            }) { Text(if ((concedidas ?: 0) > 0) "Revisar permissões" else "Permitir") }
        }

        Cartao("3 · Sincronizar") {
            Text(
                if (ultima > 0) "Última sincronização: ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(ultima))}"
                else "Ainda não sincronizou. Depois da primeira vez, roda sozinho a cada 3 horas.",
                color = TextoSec, fontSize = 14.sp,
            )
            Button(
                onClick = {
                    escopo.launch {
                        ocupado = true; mensagem = null
                        runCatching { withContext(Dispatchers.IO) { SamsungSync.sincronizar(ctx) } }
                            .onSuccess { r ->
                                mensagem = r.erro?.let { "Falhou: $it" }
                                    ?: ("Enviado ✓ ${r.enviados} itens" + if (r.porTipo.isNotEmpty()) " (" + r.porTipo.entries.joinToString { "${it.key} ${it.value}" } + ")" else "")
                                ultima = SamsungSync.ultimaSync(ctx)
                                if (r.erro == null) SamsungSync.agendar(ctx)
                            }
                            .onFailure { tratar(it) }
                        ocupado = false
                    }
                },
                enabled = vinculado && (concedidas ?: 0) > 0 && !ocupado,
                colors = ButtonDefaults.buttonColors(containerColor = Verde),
            ) { Text(if (ocupado) "Sincronizando…" else "Sincronizar agora") }
        }

        mensagem?.let {
            Text(it, color = if (it.startsWith("Enviado")) Verde else Color(0xFFF2C14B), fontSize = 14.sp)
        }
        Spacer(Modifier.height(24.dp))
    }
}
