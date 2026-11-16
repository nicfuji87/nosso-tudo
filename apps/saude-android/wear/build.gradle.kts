import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val temSdkSamsung = file("libs").listFiles { f -> f.name.endsWith(".aar") }?.isNotEmpty() == true

// ---- Ambientes -------------------------------------------------------------------------------
// prod: Supabase de PRODUÇÃO (dados reais). Mesmo applicationId da v0.3 → atualiza o app instalado.
// dev : Supabase de DESENVOLVIMENTO (dados sintéticos). Outro applicationId → instala lado a lado,
//       medição automática DESLIGADA por padrão (dois apps disputando o sensor gastariam bateria).
// A URL do dev vem de local.properties (saude.dev.url) e o build FALHA se ela apontar para produção.
val REF_PRODUCAO = "ecwcqooogsvsrddwjavh"
val URL_PRODUCAO = "https://$REF_PRODUCAO.supabase.co/functions/v1/saude-relogio"
val propsLocais = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val urlDev: String = (propsLocais.getProperty("saude.dev.url") ?: "").trim()
require(!urlDev.contains(REF_PRODUCAO)) { "saude.dev.url aponta para o projeto de PRODUÇÃO — corrija local.properties." }
require(urlDev.isEmpty() || urlDev.startsWith("https://")) { "saude.dev.url precisa ser https://<ref-dev>.supabase.co/functions/v1/saude-relogio" }

android {
    namespace = "app.nossotudo.saude.wear"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.nossotudo.saude.wear"
        minSdk = 30          // Wear OS 3+
        targetSdk = 36       // Wear OS 6 (One UI 8 Watch)
        versionCode = 3
        versionName = "0.3"
    }

    // Endpoint público da Edge Function (a URL do projeto não é segredo; o relógio não leva chave nenhuma).
    flavorDimensions += "ambiente"
    productFlavors {
        create("prod") {
            dimension = "ambiente"
            buildConfigField("String", "AMBIENTE", "\"production\"")
            buildConfigField("String", "SAUDE_URL", "\"$URL_PRODUCAO\"")
            buildConfigField("boolean", "AUTO_PADRAO", "true")
            manifestPlaceholders["rotuloApp"] = "Saúde NT"
        }
        create("dev") {
            dimension = "ambiente"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            buildConfigField("String", "AMBIENTE", "\"development\"")
            buildConfigField("String", "SAUDE_URL", "\"$urlDev\"")
            buildConfigField("boolean", "AUTO_PADRAO", "false")
            manifestPlaceholders["rotuloApp"] = "Saúde NT DEV"
        }
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true; buildConfig = true }

    // Sem o .aar da Samsung, compila contra um stub só para validar o código (APK não funcional).
    if (!temSdkSamsung) {
        sourceSets["main"].java.srcDir("stub/java")
        logger.warn("⚠ wear/libs/ sem o Samsung Health Sensor SDK: compilando com STUB — o APK NÃO funciona no relógio.")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Samsung Health Sensor SDK: coloque o .aar baixado de developer.samsung.com em wear/libs/
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar", "*.jar"))))

    // Interface (Compose for Wear OS)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.wear.compose:compose-material3:1.5.6")
    implementation("androidx.wear.compose:compose-foundation:1.5.6")
    implementation("androidx.wear.compose:compose-navigation:1.5.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    // Envio ao Nosso Tudo em segundo plano, só com rede, sobrevivendo ao fechamento do app
    implementation("androidx.work:work-runtime-ktx:2.10.1")
}
