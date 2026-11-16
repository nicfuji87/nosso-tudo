package app.nossotudo.saude.wear

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import app.nossotudo.saude.wear.ui.Rota
import app.nossotudo.saude.wear.ui.TelaCheckin
import app.nossotudo.saude.wear.ui.TelaConectar
import app.nossotudo.saude.wear.ui.TelaCoracao
import app.nossotudo.saude.wear.ui.TelaEcg
import app.nossotudo.saude.wear.ui.TelaHabitos
import app.nossotudo.saude.wear.ui.TelaHub
import app.nossotudo.saude.wear.ui.TelaLaboratorio
import app.nossotudo.saude.wear.ui.TelaProntidao
import app.nossotudo.saude.wear.ui.TelaRegistros
import app.nossotudo.saude.wear.ui.TelaRespiracao
import app.nossotudo.saude.wear.ui.TelaSono
import app.nossotudo.saude.wear.ui.TelaVfc

class MainActivity : ComponentActivity() {

    private val permissoes: Array<String>
        get() = buildList {
            if (Build.VERSION.SDK_INT >= 36) {
                add("android.permission.health.READ_HEART_RATE")
                add("com.samsung.android.hardware.sensormanager.permission.READ_ADDITIONAL_HEALTH_DATA")
            } else {
                add("android.permission.BODY_SENSORS")
            }
            add("android.permission.ACTIVITY_RECOGNITION")
            if (Build.VERSION.SDK_INT >= 33) add("android.permission.POST_NOTIFICATIONS")
        }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        EstadoSaude.iniciar(this)
        if (Sync.status(this).vinculado) { Automatico.garantir(this); Sync.enviarAgora(this) }
        val faltando = permissoes.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (faltando.isNotEmpty()) requestPermissions(faltando.toTypedArray(), 1)
        setContent { App() }
    }
}

@Composable
private fun App() {
    MaterialTheme {
        val nav = rememberSwipeDismissableNavController()
        val ir: (String) -> Unit = { nav.navigate(it) }
        val voltar: () -> Unit = { nav.popBackStack() }
        SwipeDismissableNavHost(navController = nav, startDestination = Rota.HUB) {
            composable(Rota.HUB) { TelaHub(ir) }
            composable(Rota.CORACAO) { TelaCoracao() }
            composable(Rota.VFC) { TelaVfc() }
            composable(Rota.PRONTIDAO) { TelaProntidao() }
            composable(Rota.SONO) { TelaSono() }
            composable(Rota.RESPIRACAO) { TelaRespiracao() }
            composable(Rota.ECG) { TelaEcg() }
            composable(Rota.CHECKIN) { TelaCheckin(voltar) }
            composable(Rota.HABITOS) { TelaHabitos() }
            composable(Rota.REGISTROS) { TelaRegistros() }
            composable(Rota.LABORATORIO) { TelaLaboratorio(ir) }
            composable(Rota.CONECTAR) { TelaConectar() }
        }
    }
}
