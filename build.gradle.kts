plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.21" apply false
    id("org.jetbrains.intellij.platform") version "2.20.1" apply false
}

allprojects {
    group = providers.gradleProperty("pluginGroup").get()
    version = providers.gradleProperty("pluginVersion").get()
}
