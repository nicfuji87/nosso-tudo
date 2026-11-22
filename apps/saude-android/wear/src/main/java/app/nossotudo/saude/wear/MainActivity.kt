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
import app.nossotudo.saude.wear.ui.TelaMalEstar
import app.nossotudo.saude.wear.ui.TelaOrtostatico
import android.content.Intent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
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
        if (Sync.status(this).vinculado) {
            Automatico.religarEmPrimeiroPlano(this) // temperatura bloqueada? religa agora, com o app na tela
            Automatico.garantir(this); Sync.enviarAgora(this)
        }
        val faltando = permissoes.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (faltando.isNotEmpty()) requestPermissions(faltando.toTypedArray(), 1) else pedirSensoresSempre()
        (getSystemService(android.app.NotificationManager::class.java))?.cancel(42)
        rotaPedida.value = intent?.getStringExtra(SaudeTile.EXTRA_ROTA)
        setContent { App(rotaPedida) }
    }

    /**
     * Android 13–15: com só "enquanto em uso", a temperatura da pele dá PERMISSION_ERROR quando a medição é religada
     * em segundo plano (depois de reiniciar ou atualizar). "Permitir o tempo todo" resolve de vez.
     */
    private fun pedirSensoresSempre() {
        if (Build.VERSION.SDK_INT !in 33..35) return
        val bg = "android.permission.BODY_SENSORS_BACKGROUND"
        if (checkSelfPermission("android.permission.BODY_SENSORS") == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(bg) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(bg), 2)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1) pedirSensoresSempre()
    }

    /** Rota pedida pelo atalho do mostrador (Tile). */
    private val rotaPedida = mutableStateOf<String?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        rotaPedida.value = intent.getStringExtra(SaudeTile.EXTRA_ROTA)
    }
}

@Composable
private fun App(rotaPedida: androidx.compose.runtime.MutableState<String?>) {
    MaterialTheme {
        val nav = rememberSwipeDismissableNavController()
        val ir: (String) -> Unit = { nav.navigate(it) }
        val voltar: () -> Unit = { nav.popBackStack() }
        LaunchedEffect(rotaPedida.value) {
            val r = rotaPedida.value ?: return@LaunchedEffect
            if (r != Rota.HUB) nav.navigate(r) { launchSingleTop = true }
            rotaPedida.value = null
        }
        SwipeDismissableNavHost(navController = nav, startDestination = Rota.HUB) {
            composable(Rota.HUB) { TelaHub(ir) }
            composable(Rota.CORACAO) { TelaCoracao() }
            composable(Rota.VFC) { TelaVfc() }
            composable(Rota.PRONTIDAO) { TelaProntidao() }
            composable(Rota.SONO) { TelaSono() }
            composable(Rota.RESPIRACAO) { TelaRespiracao() }
            composable(Rota.ECG) { TelaEcg() }
            composable(Rota.CHECKIN) { TelaCheckin(voltar, ir) }
            composable(Rota.HABITOS) { TelaHabitos() }
            composable(Rota.REGISTROS) { TelaRegistros() }
            composable(Rota.LABORATORIO) { TelaLaboratorio(ir) }
            composable(Rota.CONECTAR) { TelaConectar() }
            composable(Rota.MALESTAR) { TelaMalEstar(ir) }
            composable(Rota.ORTOSTATICO) { TelaOrtostatico() }
        }
    }
}
