plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val temSdkSamsung = file("libs").listFiles { f -> f.name.endsWith(".aar") }?.isNotEmpty() == true

// ---- Ambientes -------------------------------------------------------------------------------
// Os dois usam o MESMO projeto Supabase (o do Nosso Tudo), separados por Edge Function e workspace:
// prod: função saude-relogio (dados reais). Mesmo applicationId da v0.3 → atualiza o app instalado.
// dev : função saude-relogio-dev, que só aceita relógios vinculados a um workspace de TESTE.
//       Outro applicationId (instala lado a lado) e medição automática DESLIGADA por padrão.
val BASE_FUNCOES = "https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1"
val URL_PROD = "$BASE_FUNCOES/saude-relogio"
val URL_DEV = "$BASE_FUNCOES/saude-relogio-dev"

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
            buildConfigField("String", "SAUDE_URL", "\"$URL_PROD\"")
            buildConfigField("boolean", "AUTO_PADRAO", "true")
            manifestPlaceholders["rotuloApp"] = "Saúde NT"
        }
        create("dev") {
            dimension = "ambiente"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            buildConfigField("String", "AMBIENTE", "\"development\"")
            buildConfigField("String", "SAUDE_URL", "\"$URL_DEV\"")
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
