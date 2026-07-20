pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
}

rootProject.name = "auto-complete"
include("core")
project(":core").projectDir = file("packages/completion/engine-jvm")
include("plugin")
project(":plugin").projectDir = file("apps/jetbrains/plugin")
