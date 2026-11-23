package app.nossotudo.saude.mobile

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.DirectionsRun
import androidx.compose.material.icons.automirrored.rounded.DirectionsWalk
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.Pool
import androidx.compose.material.icons.rounded.SportsMartialArts
import androidx.compose.material.icons.rounded.Thermostat
import androidx.compose.material.icons.rounded.Timeline
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Design tokens do Saúde NT (Dark Performance). Cada cor tem UM significado:
 * estados (bom / atenção / alerta) e identidade de cada métrica. Nada de cor decorativa.
 */
object T {
    // superfícies
    val Fundo = Color(0xFF0B0F12)
    val Superficie = Color(0xFF161C20)
    val Elevada = Color(0xFF20282D)
    val Borda = Color(0xFF263038)
    val Texto = Color(0xFFF5F7F8)
    val TextoSec = Color(0xFF94A1AA)
    val TextoTer = Color(0xFF6B7881)

    // estados
    val Primaria = Color(0xFF8EE5A1)   // bom, estável, ação principal
    val NaPrimaria = Color(0xFF0B2414)
    val Atencao = Color(0xFFF1BD60)    // merece atenção
    val Alerta = Color(0xFFF16C80)     // fora do padrão de forma relevante

    // identidade das métricas
    val Fc = Color(0xFFF38C7C)
    val Vfc = Color(0xFFB39AF7)
    val Sono = Color(0xFF91A8FF)
    val Oxigenio = Color(0xFF5CD2E6)
    val Pele = Color(0xFFF0A267)
    val Passos = Color(0xFF8EE5A1)
    val Energia = Color(0xFFD6E685)

    // estágios do sono
    val SonoProfundo = Color(0xFF4C5FD0)
    val SonoRem = Color(0xFFB39AF7)
    val SonoLeve = Color(0xFF91A8FF)
    val SonoAcordado = Color(0xFFF1BD60)
    val SemFase = Color(0xFF39434A)

    /** Zonas de FC: Z1 recuperação · Z2 base · Z3 moderado · Z4 limiar · Z5 máximo. */
    val Zonas = listOf(Color(0xFF6E8798), Color(0xFF5CD2E6), Color(0xFF8EE5A1), Color(0xFFF1BD60), Color(0xFFF16C80))

    // espaçamento (grade de 4/8 dp)
    val e1 = 4.dp; val e2 = 8.dp; val e3 = 12.dp; val e4 = 16.dp; val e5 = 20.dp; val e6 = 24.dp; val e8 = 32.dp
    val Margem = 16.dp
    val Raio = 20.dp
    val Forma = RoundedCornerShape(20.dp)
    val FormaPeq = RoundedCornerShape(12.dp)

    // tipografia (números tabulares nas métricas)
    private const val TNUM = "tnum"
    val Destaque = TextStyle(fontSize = 44.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = TNUM, lineHeight = 48.sp, letterSpacing = (-1).sp)
    val TituloTela = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, lineHeight = 36.sp, letterSpacing = (-0.5).sp)
    val TituloCartao = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp)
    val Valor = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = TNUM, lineHeight = 28.sp)
    val ValorPeq = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = TNUM, lineHeight = 22.sp)
    val Corpo = TextStyle(fontSize = 14.sp, lineHeight = 20.sp)
    val Descricao = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)
    val Legenda = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = TNUM)
    val Rotulo = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.sp)
}

/** Cor e ícone de cada modalidade — os mesmos em todo o app. */
object Modalidade {
    val TODAS = listOf("Musculação", "Natação", "Judô", "Jiu-jitsu", "Corrida", "Caminhada", "Outro")
    fun cor(m: String?): Color = when (m) {
        "Musculação" -> Color(0xFFF0A267)
        "Natação" -> Color(0xFF5CD2E6)
        "Judô" -> Color(0xFF91A8FF)
        "Jiu-jitsu" -> Color(0xFFB39AF7)
        "Corrida" -> Color(0xFFF38C7C)
        "Caminhada" -> Color(0xFF8EE5A1)
        else -> Color(0xFF94A1AA)
    }
    fun icone(m: String?): ImageVector = when (m) {
        "Musculação" -> Icons.Rounded.FitnessCenter
        "Natação" -> Icons.Rounded.Pool
        "Judô", "Jiu-jitsu" -> Icons.Rounded.SportsMartialArts
        "Corrida" -> Icons.AutoMirrored.Rounded.DirectionsRun
        "Caminhada" -> Icons.AutoMirrored.Rounded.DirectionsWalk
        else -> Icons.Rounded.Timer
    }
    /** Lutas e natação: a FC de pulso perde precisão (pegadas, impacto, água). */
    fun fcPoucoConfiavel(m: String?) = m == "Natação" || m == "Judô" || m == "Jiu-jitsu"
}

/** Métricas com nome, unidade, cor, ícone e se "subir" é o lado ruim. */
enum class Metrica(val nome: String, val curto: String, val unidade: String, val cor: Color, val icone: ImageVector, val subirRuim: Boolean?, val casas: Int) {
    FC("Frequência cardíaca de repouso", "FC repouso", "bpm", T.Fc, Icons.Rounded.MonitorHeart, true, 0),
    VFC("Variabilidade da FC", "VFC", "ms", T.Vfc, Icons.Rounded.Timeline, false, 0),
    SONO("Sono", "Sono", "h", T.Sono, Icons.Rounded.Bedtime, false, 1),
    SPO2("Oxigenação noturna", "SpO₂", "%", T.Oxigenio, Icons.Rounded.Air, false, 0),
    PELE("Temperatura da pele", "Pele", "°C", T.Pele, Icons.Rounded.Thermostat, true, 1),
    PASSOS("Passos", "Passos", "", T.Passos, Icons.AutoMirrored.Rounded.DirectionsWalk, false, 0),
    ENERGIA("Energy Score", "Energy Score", "", T.Energia, Icons.Rounded.Bolt, false, 0),
}

@Composable
fun SaudeTema(conteudo: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = T.Primaria, onPrimary = T.NaPrimaria, background = T.Fundo, surface = T.Superficie,
            surfaceVariant = T.Elevada, onSurface = T.Texto, onSurfaceVariant = T.TextoSec, outline = T.Borda,
            surfaceContainer = T.Superficie, surfaceContainerHigh = T.Elevada, surfaceContainerHighest = T.Elevada,
            error = T.Alerta,
        ),
        typography = Typography(bodyLarge = T.Corpo, bodyMedium = T.Corpo, labelLarge = T.Corpo.copy(fontWeight = FontWeight.SemiBold)),
        content = conteudo,
    )
}
