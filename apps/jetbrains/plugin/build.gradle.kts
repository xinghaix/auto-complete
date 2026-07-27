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
        // Required for :plugin:signPlugin (Marketplace ZIP Signer CLI).
        zipSigner()
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
            Settings use Web/JCEF (optional <code>com.intellij.modules.jcef</code> on 2026+).
            Apache-2.0. Prefer JetBrains Marketplace (or a signed ZIP).
            Keys stay in the IDE PasswordSafe.</p>
            """.trimIndent(),
        )
        changeNotes.set(changeNotesText)
        vendor {
            // Marketplace public vendor name can differ; keep in sync with plugins.jetbrains.com vendor.
            name = "Auto Complete"
            url = "https://github.com/xinghaix/auto-complete"
        }
    }

    /**
     * Plugin signing (Marketplace / trusted updates).
     *
     * Uses IntelliJ Platform defaults when env is set (no secrets in git):
     * - CERTIFICATE_CHAIN — PEM certificate chain (content, not a path)
     * - PRIVATE_KEY — PEM private key (content)
     * - PRIVATE_KEY_PASSWORD — optional key passphrase
     *
     * Or set file-based variants via Gradle properties / env mapped below.
     * Without secrets, `signPlugin` is skipped (local debug only). CI release artifacts require signing.
     *
     * @see https://plugins.jetbrains.com/docs/intellij/plugin-signing.html
     */
    signing {
        val chain = providers.environmentVariable("CERTIFICATE_CHAIN")
        val key = providers.environmentVariable("PRIVATE_KEY")
        val keyPass = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
        // Only wire when present so local/CI without secrets stays green.
        if (chain.isPresent && key.isPresent) {
            certificateChain.set(chain)
            privateKey.set(key)
            if (keyPass.isPresent) {
                password.set(keyPass)
            }
        }
    }

    /**
     * Marketplace publish. Requires JB Hub permanent token with Marketplace permissions.
     * Env: PUBLISH_TOKEN (or JETBRAINS_MARKETPLACE_TOKEN as alias set in CI).
     * Never commit the token.
     */
    publishing {
        val token =
            providers
                .environmentVariable("PUBLISH_TOKEN")
                .orElse(providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN"))
        if (token.isPresent) {
            this.token.set(token)
        }
    }

    instrumentCode.set(false)
}

val settingsUiDist = rootProject.layout.projectDirectory.dir("packages/settings/ui/dist")
val settingsUiResource = layout.projectDirectory.dir("src/main/resources/settings-ui")

val copySettingsUi by tasks.registering(Copy::class) {
    group = "build"
    description = "Copy packages/settings/ui/dist into plugin resources for JCEF"
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

    // Stable archive name; CI ships only the signed variant for distribution.
    named<Zip>("buildPlugin") {
        archiveBaseName.set("auto-complete")
        archiveVersion.set(pluginVersion)
        dependsOn(copySettingsUi)
    }

    // signPlugin only when CERTIFICATE_CHAIN + PRIVATE_KEY are available (CI secrets / local env).
    named("signPlugin") {
        onlyIf {
            providers.environmentVariable("CERTIFICATE_CHAIN").orNull != null &&
                providers.environmentVariable("PRIVATE_KEY").orNull != null
        }
        dependsOn(named("buildPlugin"))
    }

    // Convenience: build + sign when secrets exist; otherwise just buildPlugin.
    register("buildSignedPlugin") {
        group = "intellij platform"
        description =
            "buildPlugin, then signPlugin if CERTIFICATE_CHAIN and PRIVATE_KEY env are set"
        dependsOn(named("buildPlugin"))
        dependsOn(named("signPlugin"))
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
