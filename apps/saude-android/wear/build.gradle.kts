plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val temSdkSamsung = file("libs").listFiles { f -> f.name.endsWith(".aar") }?.isNotEmpty() == true

android {
    namespace = "app.nossotudo.saude.wear"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.nossotudo.saude.wear"
        minSdk = 30          // Wear OS 3+
        targetSdk = 36       // Wear OS 6 (One UI 8 Watch)
        versionCode = 12
        versionName = "0.9.3"
        // Endpoint pÃºblico da Edge Function (a URL do projeto nÃ£o Ã© segredo; o relÃ³gio nÃ£o leva chave nenhuma).
        buildConfigField("String", "SAUDE_URL", "\"https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1/saude-relogio\"")
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true; buildConfig = true }

    // Sem o .aar da Samsung, compila contra um stub sÃ³ para validar o cÃ³digo (APK nÃ£o funcional).
    if (!temSdkSamsung) {
        sourceSets["main"].java.srcDir("stub/java")
        logger.warn("âš  wear/libs/ sem o Samsung Health Sensor SDK: compilando com STUB â€” o APK NÃƒO funciona no relÃ³gio.")
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
    // Envio ao Nosso Tudo em segundo plano, sÃ³ com rede, sobrevivendo ao fechamento do app
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    // Atalho no mostrador (Tile)
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-material:1.2.1")
    implementation("com.google.guava:guava:33.3.1-android")
}
