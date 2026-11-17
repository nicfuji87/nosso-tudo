pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "saude-android"

// wear: app do relógio (Sensor SDK). mobile: app do celular que lê o Samsung Health (Data SDK).
include(":wear")
include(":mobile")
