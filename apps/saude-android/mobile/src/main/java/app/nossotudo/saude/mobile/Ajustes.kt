package app.nossotudo.saude.mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.HealthAndSafety
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Watch
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.samsung.android.sdk.health.data.error.HealthDataException
import com.samsung.android.sdk.health.data.error.ResolvablePlatformException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

@Composable
fun TelaAjustes(activity: Activity, nav: Nav, rolagem: ScrollState) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    var vinculado by remember { mutableStateOf(Conexao.vinculado(ctx)) }
    var codigo by remember { mutableStateOf<String?>(null) }
    var concedidas by remember { mutableStateOf<Int?>(null) }
    var livre by remember { mutableStateOf(SamsungSync.semRestricaoBateria(ctx)) }
    var mensagem by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        concedidas = runCatching { withContext(Dispatchers.IO) { SamsungSync.permissoesConcedidas(ctx).size } }.getOrNull()
        if (vinculado) vinculado = runCatching { withContext(Dispatchers.IO) { Conexao.verificar(ctx) } }.getOrDefault(vinculado)
    }
    LaunchedEffect(Unit) { while (true) { delay(2_000); livre = SamsungSync.semRestricaoBateria(ctx) } }
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
        mensagem = if (e is HealthDataException) "Samsung Health: ${e.message ?: e.javaClass.simpleName}" else "${e.javaClass.simpleName}: ${e.message}"
    }

    TelaAba("Ajustes", rolagem = rolagem, carregando = false, aoAtualizar = {}) {
        mensagem?.let { Etiqueta(it, if (it.startsWith("Enviado")) T.Primaria else T.Atencao) }
        TituloSecao("Conexões")
        Cartao {
            ItemStatus(Icons.Rounded.Link, "Nosso Tudo", if (vinculado) "Conectado${Conexao.prefs(ctx).getString("nome", null)?.let { " · $it" } ?: ""}" else "Não conectado", vinculado)
            if (!vinculado) {
                if (codigo != null) {
                    TextoSec("No Nosso Tudo, vá em Saúde › Conectar relógio e digite:")
                    Text(codigo!!.chunked(3).joinToString(" "), style = T.Destaque.copy(letterSpacing = 6.sp), color = T.Texto)
                    TextoSec("Aguardando… o código vale 30 min.", estilo = T.Legenda)
                } else BotaoPrimario("Gerar código de conexão", Modifier.fillMaxWidth()) {
                    escopo.launch {
                        runCatching { withContext(Dispatchers.IO) { Conexao.anunciar(ctx) } }.onSuccess { codigo = it }.onFailure { mensagem = "Sem conexão com o Nosso Tudo" }
                    }
                }
            }
            Divisor()
            ItemStatus(
                Icons.Rounded.HealthAndSafety, "Samsung Health",
                when (concedidas) { null -> "verificando…"; 0 -> "nenhuma permissão"; else -> "$concedidas de ${SamsungSync.PERMISSOES.size} tipos liberados" },
                (concedidas ?: 0) > 0,
            )
            BotaoSecundario(if ((concedidas ?: 0) > 0) "Revisar permissões" else "Permitir leitura", Modifier.fillMaxWidth()) {
                escopo.launch { runCatching { SamsungSync.pedirPermissoes(activity).size }.onSuccess { concedidas = it }.onFailure { tratar(it) } }
            }
            Divisor()
            ItemStatus(Icons.Rounded.BatteryChargingFull, "Segundo plano", if (livre) "Liberado: tenta a cada ~2 h (o Android pode adiar)" else "A One UI pode pausar a sincronização", livre)
            if (!livre) BotaoSecundario("Liberar", Modifier.fillMaxWidth()) {
                runCatching { activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:${ctx.packageName}"))) }
                if (android.os.Build.VERSION.SDK_INT >= 33) activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
            }
            Divisor()
            LinhaInfo("Aparelhos e sincronização", "", aoTocar = { nav.abrir(Rota.Sincronizacao) })
        }
        TituloSecao("Perfil e treino")
        Cartao(padding = T.e2) {
            LinhaMenu(Icons.Rounded.Person, "Perfil esportivo", "Idade, altura, peso, modalidades e metas") { nav.abrir(Rota.Perfil) }
            Divisor()
            LinhaMenu(Icons.Rounded.Favorite, "Zonas cardíacas", "FC máxima e zonas usadas nos treinos") { nav.abrir(Rota.Zonas) }
        }
        TituloSecao("Preferências")
        Cartao(padding = T.e2) {
            LinhaMenu(Icons.Rounded.Tune, "Notificações", "Avisos do Saúde NT no celular") {
                runCatching { ctx.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            Divisor()
            Box(Modifier.padding(horizontal = T.e2)) { LinhaInfo("Unidades", "métricas (kg, cm, km)") }
            Box(Modifier.padding(horizontal = T.e2)) { LinhaInfo("Tema", "escuro") }
        }
        TituloSecao("Dados e privacidade")
        Cartao {
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Rounded.Lock, null, tint = T.TextoSec, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(T.e2))
                TextoSec("Os dados ficam no Nosso Tudo (banco com acesso só pelo seu espaço da família). Este aparelho guarda apenas um segredo de conexão e o último resultado de cada tela, para abrir sem internet.")
            }
            BotaoSecundario("Exportar / relatório para o médico", Modifier.fillMaxWidth()) {
                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://nossotudo.com.br/relatorio/saude")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            BotaoSecundario("Limpar dados guardados neste aparelho", Modifier.fillMaxWidth()) {
                ctx.getSharedPreferences("cache_api", android.content.Context.MODE_PRIVATE).edit().clear().apply()
                mensagem = "Cache local apagado"
            }
            TextoSec("Para excluir o histórico ou desconectar aparelhos, use o site: Saúde › Dispositivos.", estilo = T.Legenda)
        }
        TextoSec("Saúde NT ${BuildConfig.VERSION_NAME} · dados de bem-estar, não diagnóstico.", estilo = T.Legenda, modifier = Modifier.padding(top = T.e2))
    }
}

@Composable
private fun ItemStatus(icone: androidx.compose.ui.graphics.vector.ImageVector, titulo: String, texto: String, ok: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icone, null, tint = T.TextoSec, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(T.e3))
        Column(Modifier.weight(1f)) {
            Text(titulo, style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto)
            Text(texto, style = T.Legenda, color = T.TextoSec)
        }
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (ok) T.Primaria else T.Atencao))
    }
}

@Composable
private fun LinhaMenu(icone: androidx.compose.ui.graphics.vector.ImageVector, titulo: String, texto: String, aoTocar: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(T.FormaPeq).clickable(role = Role.Button, onClick = aoTocar).padding(horizontal = T.e2, vertical = T.e3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icone, null, tint = T.TextoSec, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(T.e3))
        Column(Modifier.weight(1f)) {
            Text(titulo, style = T.Corpo.copy(fontWeight = FontWeight.SemiBold), color = T.Texto)
            Text(texto, style = T.Legenda, color = T.TextoSec)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = T.TextoTer)
    }
}

// ---------------------------------------------------------------- aparelhos e sincronização

@Composable
fun TelaSincronizacao(activity: Activity, nav: Nav) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val consulta = rememberConsulta("perfil")
    var ocupado by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    TelaDetalhe("Aparelhos e fontes", "De onde vem cada número", nav) {
        msg?.let { Etiqueta(it, if (it.startsWith("Enviado")) T.Primaria else T.Atencao) }
        val aparelhos = consulta.valor.dados?.optJSONArray("sincronizacao").objetos()
        if (aparelhos.isEmpty() && consulta.valor.dados == null) CarregandoEsqueleto()
        aparelhos.sortedBy { it.optString("tipo") != "relogio" }.forEach { a ->
            val cel = a.optString("tipo") == "celular"
            Cartao {
                CabecalhoCartao(a.optString("nome", if (cel) "Celular" else "Relógio"), if (cel) Icons.Rounded.PhoneAndroid else Icons.Rounded.Watch, T.TextoSec)
                a.txt("versao")?.let { LinhaInfo("Versão do app", it) }
                val t = instante(if (cel) a.txt("ultima_sync") else a.txt("ultimo_envio"))
                LinhaInfo(if (cel) "Última sincronização do Samsung Health" else "Último envio", t?.let { "${relativo(it.toEpochMilli())} (${horaDe(it.toString())})" } ?: "—",
                    if (t != null && System.currentTimeMillis() - t.toEpochMilli() > (if (cel) 6 else 3) * 3_600_000L) T.Atencao else T.Texto)
                if (!cel) {
                    a.num("bateria")?.let { LinhaInfo("Bateria", "${it.roundToInt()}%" + if (a.optBoolean("carregando")) " · carregando" else "", if (it < 20) T.Atencao else T.Texto) }
                    if (a.has("no_pulso") && !a.isNull("no_pulso")) LinhaInfo("No pulso", if (a.optBoolean("no_pulso")) "sim" else "não")
                    instante(a.txt("ultima_leitura"))?.let { LinhaInfo("Última leitura de batimento", relativo(it.toEpochMilli())) }
                }
                a.txt("erro")?.let { if (cel) IndicadorQualidade("Último erro: $it", Estado.ATENCAO) else TextoSec("Avisos do relógio: $it", estilo = T.Legenda) }
                TextoSec(
                    if (cel) "Envia do Samsung Health: sono e fases, SpO₂, temperatura da pele (reserva), treinos, passos, Energy Score, composição corporal, apneia e ritmo irregular."
                    else "Envia do Saúde NT no relógio: batimento por minuto, VFC noturna, temperatura da pele, ECG e registros.",
                    estilo = T.Legenda,
                )
            }
        }
        Cartao {
            CabecalhoCartao("Este celular", Icons.Rounded.Sync, T.TextoSec)
            val u = SamsungSync.ultimaSync(ctx)
            LinhaInfo("Última leitura do Samsung Health", if (u > 0) relativo(u) else "nunca")
            SamsungSync.ultimoErro(ctx)?.let { IndicadorQualidade("Último problema: $it", Estado.ATENCAO) }
            BotaoPrimario(if (ocupado) "Sincronizando…" else "Sincronizar agora", Modifier.fillMaxWidth(), habilitado = !ocupado && Conexao.vinculado(ctx)) {
                escopo.launch {
                    ocupado = true
                    runCatching { withContext(Dispatchers.IO) { SamsungSync.sincronizar(ctx) } }
                        .onSuccess { r -> msg = r.erro?.let { "Falhou: $it" } ?: "Enviado: ${r.enviados} itens"; if (r.erro == null) SamsungSync.agendar(ctx); consulta.recarregar() }
                        .onFailure { e -> if (e is ResolvablePlatformException && e.hasResolution) e.resolve(activity); msg = "Falhou: ${e.message}" }
                    ocupado = false
                }
            }
        }
        TextoSec("Horário mostrado em cada métrica é o da medição; o horário de sincronização aparece só aqui.", estilo = T.Legenda)
    }
}

// ---------------------------------------------------------------- perfil esportivo

@Composable
fun TelaPerfil(nav: Nav) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val consulta = rememberConsulta("perfil")
    val p = consulta.valor.dados?.optJSONObject("perfil")
    var nasc by remember(p) { mutableStateOf(p?.txt("nascimento") ?: "") }
    var altura by remember(p) { mutableStateOf(p?.num("altura_cm")?.roundToInt()?.toString() ?: "") }
    var peso by remember(p) { mutableStateOf(p?.num("peso_kg")?.let { fmt(it, 1) } ?: "") }
    var metaSono by remember(p) { mutableStateOf(p?.num("meta_sono_h")?.let { fmt(it, 1) } ?: "7,5") }
    var metaPassos by remember(p) { mutableStateOf(p?.num("meta_passos")?.roundToInt()?.toString() ?: "8000") }
    var mods by remember(p) { mutableStateOf(p?.optJSONArray("modalidades").textos().toSet()) }
    var msg by remember { mutableStateOf<String?>(null) }
    TelaDetalhe("Perfil esportivo", null, nav) {
        msg?.let { Etiqueta(it, if (it == "Salvo") T.Primaria else T.Atencao) }
        Cartao {
            Campo("Data de nascimento (AAAA-MM-DD)", nasc, KeyboardType.Number) { nasc = it.filter { c -> c.isDigit() || c == '-' }.take(10) }
            Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                Box(Modifier.weight(1f)) { Campo("Altura (cm)", altura, KeyboardType.Number) { altura = it.filter(Char::isDigit).take(3) } }
                Box(Modifier.weight(1f)) { Campo("Peso (kg)", peso, KeyboardType.Decimal) { peso = it.filter { c -> c.isDigit() || c == ',' || c == '.' }.take(5) } }
            }
        }
        Cartao {
            CabecalhoCartao("Modalidades que você pratica")
            ChipsMulti(Modalidade.TODAS, mods) { m -> mods = if (m in mods) mods - m else mods + m }
        }
        Cartao {
            CabecalhoCartao("Metas")
            Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                Box(Modifier.weight(1f)) { Campo("Sono (h na cama)", metaSono, KeyboardType.Decimal) { metaSono = it.take(4) } }
                Box(Modifier.weight(1f)) { Campo("Passos por dia", metaPassos, KeyboardType.Number) { metaPassos = it.filter(Char::isDigit).take(5) } }
            }
            TextoSec("A prontidão usa 7 h dormidas como referência de sono.", estilo = T.Legenda)
        }
        BotaoPrimario("Salvar", Modifier.fillMaxWidth()) {
            escopo.launch {
                val r = chamar(ctx, "perfil") {
                    put("salvar", JSONObject().apply {
                        put("nascimento", nasc.ifBlank { JSONObject.NULL })
                        put("altura_cm", altura.toIntOrNull() ?: JSONObject.NULL)
                        put("peso_kg", peso.replace(',', '.').toDoubleOrNull() ?: JSONObject.NULL)
                        put("meta_sono_h", metaSono.replace(',', '.').toDoubleOrNull() ?: 7.5)
                        put("meta_passos", metaPassos.toIntOrNull() ?: 8000)
                        put("modalidades", JSONArray(mods.toList()))
                    })
                }
                msg = if (r != null) "Salvo" else "Não deu para salvar"
                if (r != null) consulta.recarregar()
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ChipsMulti(opcoes: List<String>, sel: Set<String>, aoTocar: (String) -> Unit) {
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(T.e2), verticalArrangement = Arrangement.spacedBy(T.e2)) {
        opcoes.forEach { o -> Chips(listOf(o), if (o in sel) o else null, { Modalidade.cor(it) }) { aoTocar(o) } }
    }
}

@Composable
private fun Campo(rotulo: String, valor: String, teclado: KeyboardType, aoMudar: (String) -> Unit) {
    OutlinedTextField(valor, aoMudar, label = { Text(rotulo) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = teclado), modifier = Modifier.fillMaxWidth())
}

// ---------------------------------------------------------------- zonas cardíacas

@Composable
fun TelaZonas(nav: Nav) {
    val ctx = LocalContext.current
    val escopo = rememberCoroutineScope()
    val consulta = rememberConsulta("perfil")
    val d = consulta.valor.dados
    val fcmax = d?.num("fcmax")?.roundToInt()
    val manual = d?.optString("fcmax_fonte") == "manual"
    var valor by remember(d) { mutableStateOf(if (manual) fcmax?.toString() ?: "" else "") }
    var msg by remember { mutableStateOf<String?>(null) }
    fun salvar(v: Int?) = escopo.launch {
        val r = chamar(ctx, "perfil") { put("salvar", JSONObject().put("fcmax_manual", v ?: JSONObject.NULL)) }
        msg = if (r != null) "Salvo — as zonas dos treinos foram recalculadas" else "Não deu para salvar"
        if (r != null) consulta.recarregar()
    }
    TelaDetalhe("Zonas cardíacas", null, nav) {
        msg?.let { Etiqueta(it, if (it.startsWith("Salvo")) T.Primaria else T.Atencao) }
        Cartao {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(fcmax?.toString() ?: "—", style = T.Destaque, color = T.Texto)
                Text(" bpm", style = T.Corpo, color = T.TextoSec, modifier = Modifier.padding(bottom = 8.dp))
            }
            TextoSec(if (manual) "FC máxima definida por você." else "FC máxima automática: a maior vista nos treinos dos últimos 120 dias (mínimo 170).")
            val lim = d?.optJSONArray("zonas_bpm").ints()
            if (lim.size == 4) {
                val nomes = listOf("Z1 recuperação" to "< ${lim[0]}", "Z2 base" to "${lim[0]}–${lim[1] - 1}", "Z3 moderado" to "${lim[1]}–${lim[2] - 1}", "Z4 limiar" to "${lim[2]}–${lim[3] - 1}", "Z5 máximo" to "≥ ${lim[3]}")
                nomes.forEachIndexed { i, (n, f) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(T.Zonas[i])); Spacer(Modifier.width(T.e2))
                        Box(Modifier.weight(1f)) { LinhaInfo(n, "$f bpm") }
                    }
                }
            }
            TextoSec("Método: % da FC máxima — Z1 < 60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 ≥ 90%.", estilo = T.Legenda)
        }
        Cartao {
            CabecalhoCartao("Definir manualmente")
            TextoSec("Use um valor de teste de esforço, se tiver. Sem ele, a automática costuma ser mais fiel que fórmulas por idade.")
            Campo("FC máxima (120–230)", valor, KeyboardType.Number) { valor = it.filter(Char::isDigit).take(3) }
            Row(horizontalArrangement = Arrangement.spacedBy(T.e2)) {
                BotaoPrimario("Salvar", Modifier.weight(1f), habilitado = valor.toIntOrNull()?.let { it in 120..230 } == true) { salvar(valor.toInt()) }
                BotaoSecundario("Usar automática", Modifier.weight(1f), habilitado = manual) { valor = ""; salvar(null) }
            }
        }
    }
}
