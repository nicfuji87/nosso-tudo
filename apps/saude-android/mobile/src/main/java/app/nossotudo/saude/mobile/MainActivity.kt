package app.nossotudo.saude.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(T.Fundo.toArgb()),
            navigationBarStyle = SystemBarStyle.dark(T.Superficie.toArgb()),
        )
        // ao abrir: garante o agendamento e já sincroniza o Samsung Health
        if (Conexao.vinculado(this)) { SamsungSync.agendar(this); SamsungSync.agora(this) }
        setContent { SaudeTema { Raiz(this) } }
    }
}

/** Páginas de detalhe (sobre as abas). O gesto/botão voltar do Android desempilha. */
sealed interface Rota {
    data class TreinoDetalhe(val id: String) : Rota
    data class SonoDetalhe(val noite: String?) : Rota
    data class MetricaDetalhe(val m: Metrica) : Rota
    data object Sincronizacao : Rota
    data object Perfil : Rota
    data object Zonas : Rota
}

/** Navegação compartilhada pelas telas. */
class Nav(private val pilha: MutableList<Rota>, private val trocarAba: (Int) -> Unit) {
    fun abrir(r: Rota) { pilha.add(r) }
    fun voltar() { if (pilha.isNotEmpty()) pilha.removeAt(pilha.lastIndex) }
    fun aba(i: Int) { pilha.clear(); trocarAba(i) }
}

private val ABAS = listOf(
    Triple("Hoje", Icons.Rounded.Today, "hoje"),
    Triple("Treinos", Icons.Rounded.FitnessCenter, "treinos"),
    Triple("Saúde", Icons.Rounded.MonitorHeart, "saude"),
    Triple("Ajustes", Icons.Rounded.Settings, "ajustes"),
)

@Composable
private fun Raiz(activity: ComponentActivity) {
    val ctx = LocalContext.current
    var aba by rememberSaveable { mutableIntStateOf(if (Conexao.vinculado(ctx)) 0 else 3) }
    val pilha = remember { mutableStateListOf<Rota>() }
    val nav = remember { Nav(pilha) { aba = it } }
    // posição de rolagem preservada por aba
    val rolagens = ABAS.map { rememberSaveable(saver = ScrollState.Saver) { ScrollState(0) } }

    BackHandler(enabled = pilha.isNotEmpty()) { nav.voltar() }
    BackHandler(enabled = pilha.isEmpty() && aba != 0) { aba = 0 }

    Column(Modifier.fillMaxSize().background(T.Fundo)) {
        Box(Modifier.weight(1f).fillMaxWidth().statusBarsPadding()) {
            val topo = pilha.lastOrNull()
            AnimatedContent(
                targetState = topo ?: aba,
                transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
                label = "tela",
            ) { alvo ->
                when (alvo) {
                    is Rota.TreinoDetalhe -> TelaTreinoDetalhe(alvo.id, nav)
                    is Rota.SonoDetalhe -> TelaSonoDetalhe(alvo.noite, nav)
                    is Rota.MetricaDetalhe -> TelaMetricaDetalhe(alvo.m, nav)
                    Rota.Sincronizacao -> TelaSincronizacao(activity, nav)
                    Rota.Perfil -> TelaPerfil(nav)
                    Rota.Zonas -> TelaZonas(nav)
                    0 -> TelaHoje(nav, rolagens[0])
                    1 -> TelaTreinos(nav, rolagens[1])
                    2 -> TelaSaude(nav, rolagens[2])
                    else -> TelaAjustes(activity, nav, rolagens[3])
                }
            }
        }
        NavigationBar(containerColor = T.Superficie, tonalElevation = 0.dp, modifier = Modifier.navigationBarsPadding().height(72.dp)) {
            ABAS.forEachIndexed { i, (rotulo, icone, _) ->
                NavigationBarItem(
                    selected = aba == i && pilha.isEmpty(),
                    onClick = { nav.aba(i) },
                    icon = { Icon(icone, contentDescription = null) },
                    label = { Text(rotulo, style = T.Legenda) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = T.Primaria, selectedTextColor = T.Primaria, indicatorColor = T.Primaria.copy(alpha = 0.14f),
                        unselectedIconColor = T.TextoSec, unselectedTextColor = T.TextoSec,
                    ),
                )
            }
        }
    }
}

/**
 * Esqueleto das abas: título grande, puxar para atualizar e rolagem preservada.
 * `topo` recebe a área à direita do título (ex.: indicador de sincronização).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelaAba(
    titulo: String, subtitulo: String? = null, rolagem: ScrollState, carregando: Boolean, aoAtualizar: () -> Unit,
    topo: (@Composable () -> Unit)? = null, conteudo: @Composable () -> Unit,
) {
    PullToRefreshBox(isRefreshing = carregando, onRefresh = aoAtualizar, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rolagem).padding(horizontal = T.Margem).padding(top = T.e4, bottom = T.e8),
            verticalArrangement = Arrangement.spacedBy(T.e3),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(titulo, style = T.TituloTela, color = T.Texto, modifier = Modifier.semantics { heading() })
                    if (subtitulo != null) Text(subtitulo, style = T.Descricao, color = T.TextoSec)
                }
                topo?.invoke()
            }
            conteudo()
        }
    }
}

/** Esqueleto das páginas de detalhe: voltar + título. */
@Composable
fun TelaDetalhe(titulo: String, subtitulo: String? = null, nav: Nav, rolagem: ScrollState = rememberScrollState(), conteudo: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rolagem).padding(horizontal = T.Margem).padding(bottom = T.e8),
        verticalArrangement = Arrangement.spacedBy(T.e3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = T.e2)) {
            Box(
                Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Voltar") { nav.voltar() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Voltar", tint = T.Texto) }
            Spacer(Modifier.width(T.e1))
            Column(Modifier.weight(1f)) {
                Text(titulo, style = T.TituloTela.copy(fontSize = 24.sp), color = T.Texto, modifier = Modifier.semantics { heading() })
                if (subtitulo != null) Text(subtitulo, style = T.Descricao, color = T.TextoSec)
            }
        }
        conteudo()
    }
}

