package io.autocomplete.engine

import io.autocomplete.client.CancellationToken
import io.autocomplete.client.CompletionClient
import io.autocomplete.client.HttpStatusException
import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.ProviderRequest
import io.autocomplete.client.ProviderResponse
import io.autocomplete.client.RequestStyle
import io.autocomplete.context.ProjectContextProvider
import io.autocomplete.log.LogBuffer
import io.autocomplete.log.LogLevel
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class CompletionEngineTest {
    private fun baseSettings(
        enableInComments: Boolean = true,
        enableInStrings: Boolean = true,
        logPromptBodies: Boolean = false,
    ): EngineSettings =
        EngineSettings(
            model = "demo",
            debounceInitialMs = 1,
            debounceMinMs = 1,
            debounceMaxMs = 1,
            enableInComments = enableInComments,
            enableInStrings = enableInStrings,
            logPromptBodies = logPromptBodies,
            providerConfig =
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:1/v1",
                    apiKey = "",
                    model = "demo",
                    requestStyle = RequestStyle.CHAT,
                    timeoutMs = 1000,
                ),
        )

    @Test
    fun cacheHitAvoidsClient() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _: ProviderRequest, _: CancellationToken ->
                        calls.incrementAndGet()
                        ProviderResponse("WORLD")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val gen1 = engine.currentGeneration()
        val first =
            engine.completeSync(
                CompletionRequest("1", "a.kt", "kotlin", "hello ", "", 6, Trigger.MANUAL, gen1),
                debounce = false,
            )
        assertTrue(first is CompletionOutcome.Success, "first=$first")
        assertEquals(1, calls.get())
        val second =
            engine.completeSync(
                CompletionRequest("2", "a.kt", "kotlin", "hello ", "", 6, Trigger.MANUAL, engine.currentGeneration()),
                debounce = false,
            )
        assertTrue(second is CompletionOutcome.Success, "second=$second")
        assertEquals(1, calls.get())
        assertTrue((second as CompletionOutcome.Success).response.cached)
    }

    @Test
    fun contextualSkipDoesNotCallClient() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        calls.incrementAndGet()
                        ProviderResponse("x")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val out =
            engine.completeSync(
                CompletionRequest(
                    "1",
                    "a.kt",
                    "kotlin",
                    "val foo",
                    "bar",
                    7,
                    Trigger.AUTO,
                    engine.currentGeneration(),
                ),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Skipped, out)
        assertEquals(0, calls.get())
    }

    @Test
    fun skipsCommentsWhenDisabled() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings(enableInComments = false) },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        calls.incrementAndGet()
                        ProviderResponse("x")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val out =
            engine.completeSync(
                CompletionRequest(
                    id = "1",
                    path = "a.kt",
                    language = "kotlin",
                    prefix = "// note ",
                    suffix = "",
                    offset = 8,
                    trigger = Trigger.AUTO,
                    generation = engine.currentGeneration(),
                    context = ContextHints(inComment = true),
                ),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Skipped, out)
        assertEquals(0, calls.get())
    }

    @Test
    fun fatalBackoffBlocksFollowups() {
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ -> throw HttpStatusException(401, "HTTP 401") }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val first =
            engine.completeSync(
                CompletionRequest(
                    "1",
                    "a.kt",
                    "kotlin",
                    "fun f() {\n    ",
                    "\n}",
                    14,
                    Trigger.MANUAL,
                    engine.currentGeneration(),
                ),
                debounce = false,
            )
        assertTrue(first is CompletionOutcome.Failed, "first=$first")
        val second =
            engine.completeSync(
                CompletionRequest(
                    "2",
                    "a.kt",
                    "kotlin",
                    "fun f() {\n    ",
                    "\n}",
                    14,
                    Trigger.MANUAL,
                    engine.currentGeneration(),
                ),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Skipped, second)
    }

    @Test
    fun staleGenerationAfterDebounce() {
        lateinit var engine: CompletionEngine
        engine =
            CompletionEngine(
                settings =
                    SettingsSource {
                        baseSettings().copy(debounceInitialMs = 5, debounceMinMs = 5, debounceMaxMs = 5)
                    },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ -> ProviderResponse("x") }
                },
                sleeper = { _, _ -> engine.nextGeneration() },
            )
        val gen = engine.currentGeneration()
        val out =
            engine.completeSync(
                CompletionRequest("1", "a.kt", "kotlin", "fun f() {\n    ", "\n}", 14, Trigger.AUTO, gen),
                debounce = true,
            )
        assertEquals(CompletionOutcome.Cancelled, out)
    }

    @Test
    fun asyncCancelStopsInflight() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, token ->
                        entered.countDown()
                        try {
                            val end = System.currentTimeMillis() + 2000
                            while (!token.isCancelled() && System.currentTimeMillis() < end) {
                                try {
                                    Thread.sleep(5)
                                } catch (_: InterruptedException) {
                                    Thread.currentThread().interrupt()
                                    break
                                }
                            }
                        } finally {
                            release.countDown()
                        }
                        if (token.isCancelled() || Thread.currentThread().isInterrupted) {
                            throw io.autocomplete.client.CancelledException()
                        }
                        ProviderResponse("late")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val gen = engine.nextGeneration()
        val req =
            CompletionRequest(
                "1",
                "a.kt",
                "kotlin",
                "fun f() {\n    ",
                "\n}",
                14,
                Trigger.MANUAL,
                gen,
            )
        val done = CountDownLatch(1)
        var outcome: CompletionOutcome? = null
        engine.completeAsync(req, debounce = false) {
            outcome = it
            done.countDown()
        }
        assertTrue(entered.await(2, TimeUnit.SECONDS), "client should start")
        engine.cancelScope("a.kt")
        assertTrue(release.await(2, TimeUnit.SECONDS), "client should observe cancel")
        assertTrue(done.await(2, TimeUnit.SECONDS), "async callback should finish")
        assertEquals(CompletionOutcome.Cancelled, outcome)
    }

    @Test
    fun gitignoreRulesAreSelectedFromOriginatingProject() {
        val calls = AtomicInteger()
        val contexts = ProjectContextProvider()
        contexts.updateGitignorePatterns("project-a", listOf("generated/**"))
        contexts.updateGitignorePatterns("project-b", emptyList())
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                projectContexts = contexts,
                clientFactory = {
                    CompletionClient { _, _ ->
                        calls.incrementAndGet()
                        ProviderResponse("ok")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )

        val ignored =
            engine.completeSync(
                CompletionRequest(
                    id = "a",
                    path = "generated/File.kt",
                    language = "kotlin",
                    prefix = "fun a() = ",
                    suffix = "",
                    offset = 10,
                    trigger = Trigger.MANUAL,
                    generation = engine.currentGeneration(),
                    projectKey = "project-a",
                ),
                debounce = false,
            )
        val allowed =
            engine.completeSync(
                CompletionRequest(
                    id = "b",
                    path = "generated/File.kt",
                    language = "kotlin",
                    prefix = "fun b() = ",
                    suffix = "",
                    offset = 10,
                    trigger = Trigger.MANUAL,
                    generation = engine.currentGeneration(),
                    projectKey = "project-b",
                ),
                debounce = false,
            )

        assertEquals(CompletionOutcome.Skipped, ignored)
        assertTrue(allowed is CompletionOutcome.Success, "allowed=$allowed")
        assertEquals(1, calls.get())
    }

    @Test
    fun recentSnippetsAreSelectedFromOriginatingProject() {
        val prompts = mutableListOf<String>()
        val contexts = ProjectContextProvider()
        contexts.updateRecentSnippets("project-a", listOf("File: /a/OnlyA.kt\nclass OnlyA"))
        contexts.updateRecentSnippets("project-b", listOf("File: /b/OnlyB.kt\nclass OnlyB"))
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings().copy(enableRecentFileContext = true) },
                logs = LogBuffer(),
                projectContexts = contexts,
                clientFactory = {
                    CompletionClient { request, _ ->
                        prompts += request.prefix
                        ProviderResponse("ok")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )

        listOf("project-a" to "fun a() = ", "project-b" to "fun b() = ").forEachIndexed { index, pair ->
            engine.completeSync(
                CompletionRequest(
                    id = index.toString(),
                    path = "$index.kt",
                    language = "kotlin",
                    prefix = pair.second,
                    suffix = "",
                    offset = pair.second.length,
                    trigger = Trigger.MANUAL,
                    generation = engine.currentGeneration(),
                    projectKey = pair.first,
                ),
                debounce = false,
            )
        }

        assertTrue(prompts[0].contains("OnlyA"))
        assertTrue(!prompts[0].contains("OnlyB"))
        assertTrue(prompts[1].contains("OnlyB"))
        assertTrue(!prompts[1].contains("OnlyA"))
    }

    @Test
    fun debugLogExplainsEarlyDisabledGate() {
        val logs = LogBuffer()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings().copy(enabled = false, logLevel = "debug") },
                logs = logs,
                sleeper = { _, token -> token.throwIfCancelled() },
            )

        val outcome =
            engine.completeSync(
                CompletionRequest(
                    id = "disabled",
                    path = "a.kt",
                    language = "kotlin",
                    prefix = "fun a() = ",
                    suffix = "",
                    offset = 10,
                    trigger = Trigger.MANUAL,
                    generation = engine.currentGeneration(),
                ),
                debounce = false,
            )

        assertEquals(CompletionOutcome.Skipped, outcome)
        assertEquals(LogLevel.DEBUG, logs.snapshot().single().level)
        assertTrue(logs.snapshot().single().message.contains("disabled or snoozed"))
    }
}
