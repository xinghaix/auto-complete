import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import java.io.File

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.intellij.platform")
}

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
        intellijDependencies()
    }
}

dependencies {
    implementation(project(":core"))
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")

    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion"),
        )
        testFramework(TestFrameworkType.Platform)
        instrumentationTools()
    }
}

val pluginVersion = providers.gradleProperty("pluginVersion")
val pluginName = providers.gradleProperty("pluginName")
val changeNotesText =
    providers.provider {
        val changelog = rootProject.file("CHANGELOG.md")
        extractLatestNotes(changelog)
    }

intellijPlatform {
    pluginConfiguration {
        id = "io.autocomplete"
        name = pluginName
        version = pluginVersion
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
        description.set(
            """
            <p>Lightweight AI inline code completion for JetBrains IDEs.</p>
            <ul>
              <li>Bring your own baseUrl / API key / model</li>
              <li>OpenAI-compatible endpoints (Ollama, vLLM, gateways, …)</li>
              <li>Profiles, prompt templates, adaptive debounce and cache</li>
              <li>Shared Web settings (JCEF), status bar, and logs</li>
              <li>Single-process Kotlin — no VS Code host bridge</li>
            </ul>
            <p><b>Requires IntelliJ Platform 2024.2+ (build 242+)</b>.
            Settings are Web/JCEF only (optional jcef module on 2025.3+/2026).
            Apache-2.0. Keys stay in the IDE PasswordSafe.</p>
            """.trimIndent(),
        )
        changeNotes.set(changeNotesText)
        vendor {
            name = "auto-complete"
            // Update to your public repo URL when publishing the GitHub project.
            url = "https://github.com"
        }
    }

    // Marketplace: set token via env only when intentionally publishing. Never commit secrets.
    publishing {
        // intentionally empty for open-source zip / GitHub Releases distribution
    }

    instrumentCode.set(false)
}

val settingsUiDist = rootProject.layout.projectDirectory.dir("packages/settings-ui/dist")
val settingsUiResource = layout.projectDirectory.dir("src/main/resources/settings-ui")

val copySettingsUi by tasks.registering(Copy::class) {
    group = "build"
    description = "Copy packages/settings-ui/dist into plugin resources for JCEF"
    onlyIf { settingsUiDist.asFile.resolve("index.html").exists() }
    from(settingsUiDist)
    into(settingsUiResource)
    doFirst {
        // clean previous bundle so vite hashed assets don't accumulate
        if (settingsUiResource.asFile.exists()) {
            settingsUiResource.asFile.deleteRecursively()
        }
    }
}

tasks {
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
            freeCompilerArgs.add("-Xjvm-default=all")
        }
    }

    named("processResources") {
        dependsOn(copySettingsUi)
    }

    // Prefer a stable local artifact name for Install from Disk.
    named<Zip>("buildPlugin") {
        archiveBaseName.set("auto-complete")
        archiveVersion.set(pluginVersion)
        dependsOn(copySettingsUi)
    }
}

fun extractLatestNotes(changelog: File): String {
    if (!changelog.exists()) {
        return "<p>Open-source preview build.</p>"
    }
    val lines = changelog.readLines()
    val start =
        lines.indexOfFirst { it.startsWith("## [") }
            .takeIf { it >= 0 }
            ?: return "<p>Open-source preview build.</p>"
    val end =
        (start + 1 until lines.size).firstOrNull { lines[it].startsWith("## [") }
            ?: lines.size
    val body =
        lines.subList(start + 1, end)
            .joinToString("\n")
            .trim()
            .ifBlank { "Open-source preview build." }
    // Keep HTML simple for plugin.xml changeNotes.
    val html =
        body
            .lines()
            .joinToString("\n") { line ->
                when {
                    line.startsWith("### ") -> "<p><b>${line.removePrefix("### ").trim()}</b></p>"
                    line.startsWith("- ") -> "<li>${line.removePrefix("- ").trim()}</li>"
                    line.isBlank() -> ""
                    else -> "<p>${line.trim()}</p>"
                }
            }
    val withLists =
        html
            .replace(Regex("((?:<li>.*?</li>\\n?)+)", RegexOption.DOT_MATCHES_ALL)) { m ->
                "<ul>\n${m.value.trim()}\n</ul>"
            }
    return withLists.ifBlank { "<p>Open-source preview build.</p>" }
}
