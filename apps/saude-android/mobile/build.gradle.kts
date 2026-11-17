plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Samsung Health Data SDK: baixe de developer.samsung.com/health/data e descompacte em mobile/libs/
val temSdkDados = fileTree("libs") { include("**/*.aar") }.files.isNotEmpty()

android {
    namespace = "app.nossotudo.saude.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.nossotudo.saude.mobile"
        minSdk = 29
        targetSdk = 36
        versionCode = 3
        versionName = "0.3"
        buildConfigField("String", "SAUDE_URL", "\"https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1/saude-relogio\"")
    }

    buildTypes { release { isMinifyEnabled = false } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("**/*.aar"))))
    // dependÃªncias do Data SDK
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.databinding:databinding-runtime:8.13.2")
    implementation("org.jetbrains.kotlin:kotlin-parcelize-runtime:2.3.21")

    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui:1.9.0")
    implementation("androidx.compose.foundation:foundation:1.9.0")
    implementation("androidx.compose.material3:material3:1.3.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
}
