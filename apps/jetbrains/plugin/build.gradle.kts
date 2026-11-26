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
    implementation(project(":core")) {
        // IntelliJ Platform bundles Kotlin stdlib & JetBrains annotations; packaging them causes
        // LinkageError across IDEA 2024.2–2026.2+ and violates Marketplace plugin rules.
        exclude(group = "org.jetbrains.kotlin")
        exclude(group = "org.jetbrains", module = "annotations")
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")

    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion"),
        )
        testFramework(TestFrameworkType.Platform)
        // Required for :plugin:signPlugin (Marketplace ZIP Signer CLI).
        zipSigner()
        pluginVerifier()
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
              <li>One Web panel: Settings + Logs (JCEF)</li>
              <li>Single-process Kotlin — no VS Code host bridge</li>
            </ul>
            <p><b>Requires IntelliJ Platform 2024.2+ (build 242+)</b>.
            Settings use an embedded Web panel (JCEF). On 2026+ enable the bundled
            <b>Web Browser (JCEF)</b> plugin if the panel is blank. See docs/GUIDE.md.</p>
            <p>Apache-2.0 open source. Prefer JetBrains Marketplace (or signed ZIP from GitHub Releases).
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

    pluginVerification {
        ides {
            recommended()
        }
    }

    instrumentCode.set(false)
}

val settingsUiDist = rootProject.layout.projectDirectory.dir("packages/settings/ui/dist")
val settingsUiResource = layout.projectDirectory.dir("src/main/resources/settings-ui")

val copySettingsUi =
    tasks.register<Copy>("copySettingsUi") {
        group = "build"
        description = "Copy packages/settings/ui/dist into plugin resources for JCEF"
        from(settingsUiDist)
        into(settingsUiResource)
        doFirst {
            val distIndex = settingsUiDist.asFile.resolve("index.html")
            if (!distIndex.isFile) {
                throw GradleException(
                    "Missing settings-ui build artifact: ${distIndex.absolutePath}. " +
                        "Run `npm run build:settings-ui` before building the JetBrains plugin.",
                )
            }
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
    val versionHeading = Regex("""^## \[\d+\.""")
    val start =
        lines.indexOfFirst { versionHeading.containsMatchIn(it) }
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
    // Keep HTML simple and escaped for plugin.xml changeNotes.
    fun escapeHtml(text: String): String =
        text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    val html =
        body
            .lines()
            .joinToString("\n") { line ->
                when {
                    line.startsWith("### ") -> "<p><b>${escapeHtml(line.removePrefix("### ").trim())}</b></p>"
                    line.startsWith("- ") -> "<li>${escapeHtml(line.removePrefix("- ").trim())}</li>"
                    line.isBlank() -> ""
                    else -> "<p>${escapeHtml(line.trim())}</p>"
                }
            }
    val withLists =
        html
            .replace(Regex("((?:<li>.*?</li>\\n?)+)", RegexOption.DOT_MATCHES_ALL)) { m ->
                "<ul>\n${m.value.trim()}\n</ul>"
            }
    return withLists.ifBlank { "<p>Open-source preview build.</p>" }
}
