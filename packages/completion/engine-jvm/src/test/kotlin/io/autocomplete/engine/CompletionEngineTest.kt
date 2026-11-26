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
    fun fatalBackoffBlocksAutoFollowups() {
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
                    Trigger.AUTO,
                    engine.currentGeneration(),
                ),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Skipped, second)
        val stats = engine.sessionStats()
        assertTrue(stats.backoffBlocked)
        assertTrue(stats.backoffFatal)
    }

    @Test
    fun manualTriggerProbesThroughFatalBackoffAndResetsOnSuccess() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        if (calls.incrementAndGet() == 1) {
                            throw HttpStatusException(401, "HTTP 401")
                        }
                        ProviderResponse("return 42")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val fail =
            engine.completeSync(
                CompletionRequest("1", "a.kt", "kotlin", "fun f() {\n    ", "\n}", 14, Trigger.AUTO, engine.currentGeneration()),
                debounce = false,
            )
        assertTrue(fail is CompletionOutcome.Failed)
        assertTrue(engine.backoff.blocked())

        // Manual probe is allowed through fatal backoff and clears backoff on success.
        val probe =
            engine.completeSync(
                CompletionRequest("2", "a.kt", "kotlin", "fun f() {\n    ", "\n}", 14, Trigger.MANUAL, engine.currentGeneration()),
                debounce = false,
            )
        assertTrue(probe is CompletionOutcome.Success, "probe=$probe")
        assertTrue(!engine.backoff.blocked())
        assertTrue(!engine.backoff.isFatal())

        // Subsequent AUTO request succeeds too.
        val followup =
            engine.completeSync(
                CompletionRequest("3", "b.kt", "kotlin", "fun g() {\n    ", "\n}", 14, Trigger.AUTO, engine.currentGeneration()),
                debounce = false,
            )
        assertTrue(followup is CompletionOutcome.Success, "followup=$followup")
        assertEquals(3, calls.get())
    }

    @Test
    fun shouldProbeAllowsAutoAfterIntervalAndReloadOrClearResetsBackoff() {
        var now = 1_000_000L
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        val n = calls.incrementAndGet()
                        if (n == 1 || n == 3) throw HttpStatusException(403, "HTTP 403")
                        ProviderResponse("ok_$n")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
                backoff = io.autocomplete.client.ErrorBackoff(fatalProbeIntervalMs = 1_000L, clock = { now }),
            )
        val req1 = CompletionRequest("1", "a.kt", "kotlin", "fun a() = ", "", 10, Trigger.AUTO, engine.currentGeneration())
        assertTrue(engine.completeSync(req1, debounce = false) is CompletionOutcome.Failed)

        // Before interval: blocked
        assertEquals(CompletionOutcome.Skipped, engine.completeSync(req1.copy(id = "2"), debounce = false))

        // After interval: shouldProbe allows single AUTO probe through and resets on success
        now += 1_500L
        val recovered = engine.completeSync(req1.copy(id = "3"), debounce = false)
        assertTrue(recovered is CompletionOutcome.Success, "recovered=$recovered")
        assertTrue(!engine.backoff.blocked())

        // Fail again, then verify reloadCaches resets backoff
        val req2 = CompletionRequest("4", "b.kt", "kotlin", "fun b() = ", "", 10, Trigger.AUTO, engine.currentGeneration())
        assertTrue(engine.completeSync(req2, debounce = false) is CompletionOutcome.Failed)
        assertTrue(engine.backoff.blocked())
        engine.reloadCaches()
        assertTrue(!engine.backoff.blocked())

        // Fail via direct backoff, verify clearCaches clears both caches and backoff
        engine.backoff.failure(HttpStatusException(401, "HTTP 401"))
        assertTrue(engine.backoff.blocked())
        engine.clearCaches()
        assertTrue(!engine.backoff.blocked())
        // Previous cached req1 must miss cache after clearCaches
        val afterClear = engine.completeSync(req1.copy(id = "5"), debounce = false)
        assertTrue(afterClear is CompletionOutcome.Success)
        assertTrue(!(afterClear as CompletionOutcome.Success).response.cached)
    }

    @Test
    fun forceRefreshSkipsHistoryAndLruCaches() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        ProviderResponse("res_${calls.incrementAndGet()}")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val baseReq = CompletionRequest("1", "a.kt", "kotlin", "val x = ", "", 8, Trigger.MANUAL, engine.currentGeneration())
        val first = engine.completeSync(baseReq, debounce = false) as CompletionOutcome.Success
        assertEquals("res_1", first.response.text)

        val cached = engine.completeSync(baseReq.copy(id = "2"), debounce = false) as CompletionOutcome.Success
        assertTrue(cached.response.cached)
        assertEquals(1, calls.get())

        val refreshed =
            engine.completeSync(baseReq.copy(id = "3", forceRefresh = true), debounce = false) as CompletionOutcome.Success
        assertTrue(!refreshed.response.cached)
        assertEquals("res_2", refreshed.response.text)
        assertEquals(2, calls.get())
    }

    @Test
    fun cancelScopeWithExpectedRequestIdDoesNotKillNewerRequest() {
        val entered2 = CountDownLatch(1)
        val release2 = CountDownLatch(1)
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { req, token ->
                        if (req.prefix.contains("second")) {
                            entered2.countDown()
                            release2.await(2, TimeUnit.SECONDS)
                        }
                        token.throwIfCancelled()
                        ProviderResponse("done")
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val gen = engine.nextGeneration("a.kt")
        val req2 = CompletionRequest("req-2", "a.kt", "kotlin", "val second = ", "", 13, Trigger.MANUAL, gen)
        val done2 = CountDownLatch(1)
        var out2: CompletionOutcome? = null
        engine.completeAsync(req2, debounce = false) {
            out2 = it
            done2.countDown()
        }
        assertTrue(entered2.await(2, TimeUnit.SECONDS))
        // Stale cancellation for req-1 MUST NOT cancel req-2
        engine.cancelScope("a.kt", expectedRequestId = "req-1")
        release2.countDown()
        assertTrue(done2.await(2, TimeUnit.SECONDS))
        assertTrue(out2 is CompletionOutcome.Success, "expected req-2 success, got $out2")
    }

    @Test
    fun sameScopeReentryDoesNotKillUnrelatedScopeWhenAtMaxInFlight() {
        val a1Entered = CountDownLatch(1)
        val bEntered = CountDownLatch(1)
        val releaseB = CountDownLatch(1)
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings().copy(maxInFlight = 2) },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { req, token ->
                        when {
                            req.path == "a.kt" && req.prefix.contains("first") -> {
                                a1Entered.countDown()
                                val end = System.currentTimeMillis() + 2000
                                while (!token.isCancelled() && System.currentTimeMillis() < end) {
                                    Thread.sleep(5)
                                }
                                token.throwIfCancelled()
                                ProviderResponse("a1")
                            }
                            req.path == "b.kt" -> {
                                bEntered.countDown()
                                releaseB.await(2, TimeUnit.SECONDS)
                                token.throwIfCancelled()
                                ProviderResponse("b_ok")
                            }
                            else -> ProviderResponse("a2_ok")
                        }
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )

        val doneB = CountDownLatch(1)
        var outB: CompletionOutcome? = null
        val doneA2 = CountDownLatch(1)
        var outA2: CompletionOutcome? = null

        engine.completeAsync(
            CompletionRequest("a1", "a.kt", "kotlin", "val first = ", "", 12, Trigger.MANUAL, engine.nextGeneration("a.kt")),
            debounce = false,
        ) {}
        engine.completeAsync(
            CompletionRequest("b1", "b.kt", "kotlin", "val b = ", "", 8, Trigger.MANUAL, engine.nextGeneration("b.kt")),
            debounce = false,
        ) {
            outB = it
            doneB.countDown()
        }
        assertTrue(a1Entered.await(2, TimeUnit.SECONDS))
        assertTrue(bEntered.await(2, TimeUnit.SECONDS))

        // Re-entering a.kt cancels a1 and MUST NOT kill b.kt!
        engine.completeAsync(
            CompletionRequest("a2", "a.kt", "kotlin", "val second = ", "", 13, Trigger.MANUAL, engine.nextGeneration("a.kt")),
            debounce = false,
        ) {
            outA2 = it
            doneA2.countDown()
        }
        assertTrue(doneA2.await(2, TimeUnit.SECONDS))
        releaseB.countDown()
        assertTrue(doneB.await(2, TimeUnit.SECONDS))

        assertTrue(outA2 is CompletionOutcome.Success, "outA2=$outA2")
        assertTrue(outB is CompletionOutcome.Success, "outB=$outB")
    }

    @Test
    fun perScopeGenerationsDoNotCancelEachOtherButCancelAllDoes() {
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = { CompletionClient { _, _ -> ProviderResponse("ok") } },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val genA = engine.nextGeneration("projA/Main.kt")
        val genB = engine.nextGeneration("projB/Main.kt")

        val outA =
            engine.completeSync(
                CompletionRequest("1", "projA/Main.kt", "kotlin", "val a = ", "", 8, Trigger.MANUAL, genA),
                debounce = false,
            )
        val outB =
            engine.completeSync(
                CompletionRequest("2", "projB/Main.kt", "kotlin", "val b = ", "", 8, Trigger.MANUAL, genB),
                debounce = false,
            )
        assertTrue(outA is CompletionOutcome.Success)
        assertTrue(outB is CompletionOutcome.Success)

        // cancelAll invalidates every tracked scope generation
        engine.cancelAll()
        val staleA =
            engine.completeSync(
                CompletionRequest("3", "projA/Main.kt", "kotlin", "val a2 = ", "", 9, Trigger.MANUAL, genA),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Cancelled, staleA)
    }

    @Test
    fun mixedPerScopeAndGlobalGenerationsShareMonotonicCounter() {
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = { CompletionClient { _, _ -> ProviderResponse("ok") } },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        // 1. Per-scope async request with generation = 0 allocates scoped generation on "a.kt"
        val asyncDone = CountDownLatch(1)
        var asyncOut: CompletionOutcome? = null
        engine.completeAsync(
            CompletionRequest("async-1", "a.kt", "kotlin", "val a1 = ", "", 9, Trigger.MANUAL, 0L),
            debounce = false,
        ) {
            asyncOut = it
            asyncDone.countDown()
        }
        assertTrue(asyncDone.await(2, TimeUnit.SECONDS))
        assertTrue(asyncOut is CompletionOutcome.Success, "asyncOut=$asyncOut")
        val scopedGen = engine.currentGeneration("a.kt")
        assertTrue(scopedGen >= 1L)

        // 2. Legacy caller subsequently uses global nextGeneration() on the SAME scope "a.kt"
        val globalGen = engine.nextGeneration()
        assertTrue(globalGen > scopedGen)
        assertEquals(globalGen, engine.currentGeneration("a.kt"))
        val legacyOut =
            engine.completeSync(
                CompletionRequest("legacy-2", "a.kt", "kotlin", "val a2 = ", "", 9, Trigger.MANUAL, globalGen),
                debounce = false,
            )
        assertTrue(legacyOut is CompletionOutcome.Success, "legacyOut=$legacyOut")

        // 3. Old scopedGen is now stale
        val staleScoped =
            engine.completeSync(
                CompletionRequest("stale-3", "a.kt", "kotlin", "val a3 = ", "", 9, Trigger.MANUAL, scopedGen),
                debounce = false,
            )
        assertEquals(CompletionOutcome.Cancelled, staleScoped)

        // 4. Subsequent per-scope nextGeneration("a.kt") supersedes globalGen without breaking "b.kt"
        val nextScopedA = engine.nextGeneration("a.kt")
        assertTrue(nextScopedA > globalGen)
        assertEquals(nextScopedA, engine.currentGeneration("a.kt"))
        assertEquals(globalGen, engine.currentGeneration("b.kt"))
        val outA =
            engine.completeSync(
                CompletionRequest("scoped-4", "a.kt", "kotlin", "val a4 = ", "", 9, Trigger.MANUAL, nextScopedA),
                debounce = false,
            )
        val outB =
            engine.completeSync(
                CompletionRequest("global-b", "b.kt", "kotlin", "val b1 = ", "", 9, Trigger.MANUAL, globalGen),
                debounce = false,
            )
        assertTrue(outA is CompletionOutcome.Success, "outA=$outA")
        assertTrue(outB is CompletionOutcome.Success, "outB=$outB")
    }

    @Test
    fun debounceBoundsHandleInvertedHighAndZeroRangesWithoutCrashing() {
        val observedDelays = mutableListOf<Long>()
        val engine =
            CompletionEngine(
                settings =
                    SettingsSource {
                        baseSettings().copy(
                            debounceMinMs = 1500,
                            debounceInitialMs = 1300,
                            debounceMaxMs = 1200, // inverted AND > 1000
                        )
                    },
                logs = LogBuffer(),
                clientFactory = { CompletionClient { _, _ -> ProviderResponse("ok") } },
                sleeper = { ms, _ -> observedDelays += ms },
            )
        val out =
            engine.completeSync(
                CompletionRequest("1", "a.kt", "kotlin", "val x = ", "", 8, Trigger.AUTO, engine.currentGeneration()),
                debounce = true,
            )
        assertTrue(out is CompletionOutcome.Success, "expected success, got $out")
        assertTrue(observedDelays.single() in 1200L..1500L)

        // debounceMinMs = 0 works cleanly
        val zeroDelays = mutableListOf<Long>()
        val zeroEngine =
            CompletionEngine(
                settings =
                    SettingsSource {
                        baseSettings().copy(debounceMinMs = 0, debounceInitialMs = 0, debounceMaxMs = 100)
                    },
                logs = LogBuffer(),
                clientFactory = { CompletionClient { _, _ -> ProviderResponse("ok") } },
                sleeper = { ms, _ -> zeroDelays += ms },
            )
        val zeroOut =
            zeroEngine.completeSync(
                CompletionRequest("2", "a.kt", "kotlin", "val y = ", "", 8, Trigger.AUTO, zeroEngine.currentGeneration()),
                debounce = true,
            )
        assertTrue(zeroOut is CompletionOutcome.Success)
        assertTrue(zeroDelays.isEmpty(), "0ms debounce should not invoke sleeper")
    }

    @Test
    fun lruHitRunsBeforeDebounceAndAvoidsRedundantSettingsReads() {
        val sleepCalls = AtomicInteger()
        val settingsReads = AtomicInteger()
        val clientCalls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings =
                    SettingsSource {
                        settingsReads.incrementAndGet()
                        baseSettings().copy(debounceMinMs = 50, debounceInitialMs = 50, debounceMaxMs = 100)
                    },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        clientCalls.incrementAndGet()
                        ProviderResponse("42")
                    }
                },
                sleeper = { _, _ -> sleepCalls.incrementAndGet() },
            )
        val afterInitReads = settingsReads.get()
        // First request populates LRU (for scope "a.kt")
        val r1 =
            engine.completeSync(
                CompletionRequest("1", "a.kt", "kotlin", "val x = ", "", 8, Trigger.AUTO, engine.currentGeneration()),
                debounce = true,
            )
        assertTrue(r1 is CompletionOutcome.Success)
        assertEquals(1, clientCalls.get())
        assertEquals(1, sleepCalls.get())
        // Single settings.current() read during completeSync!
        assertEquals(afterInitReads + 1, settingsReads.get())

        // Second request on a different scope with identical prompt hits LRU BEFORE debounce!
        val r2 =
            engine.completeSync(
                CompletionRequest(
                    "2",
                    "b.kt",
                    "kotlin",
                    "val x = ",
                    "",
                    8,
                    Trigger.AUTO,
                    engine.currentGeneration(),
                ),
                debounce = true,
            )
        // Note: sendFilePath=true puts File: a.kt vs File: b.kt in prompt; verify with sendFilePath=false below.
        assertTrue(r2 is CompletionOutcome.Success)

        val lruEngine =
            CompletionEngine(
                settings =
                    SettingsSource {
                        baseSettings().copy(sendFilePath = false, debounceMinMs = 50, debounceInitialMs = 50, debounceMaxMs = 100)
                    },
                logs = LogBuffer(),
                clientFactory = { CompletionClient { _, _ -> ProviderResponse("99") } },
                sleeper = { _, _ -> sleepCalls.incrementAndGet() },
            )
        sleepCalls.set(0)
        lruEngine.completeSync(
            CompletionRequest("1", "a.kt", "kotlin", "val z = ", "", 8, Trigger.AUTO, lruEngine.currentGeneration()),
            debounce = true,
        )
        assertEquals(1, sleepCalls.get())
        // Different scope misses SuggestionCache history, hits PromptLruCache BEFORE debounce!
        val lruHit =
            lruEngine.completeSync(
                CompletionRequest("2", "b.kt", "kotlin", "val z = ", "", 8, Trigger.AUTO, lruEngine.currentGeneration()),
                debounce = true,
            )
        assertTrue(lruHit is CompletionOutcome.Success && lruHit.response.cached)
        assertEquals(1, sleepCalls.get(), "LRU hit must happen before debounce")
    }

    @Test
    fun sessionStatsTracksCountsAcceptedAndLatencyPercentiles() {
        val calls = AtomicInteger()
        val engine =
            CompletionEngine(
                settings = SettingsSource { baseSettings() },
                logs = LogBuffer(),
                clientFactory = {
                    CompletionClient { _, _ ->
                        when (calls.incrementAndGet()) {
                            1 -> {
                                Thread.sleep(15)
                                ProviderResponse("v1")
                            }
                            else -> throw RuntimeException("boom")
                        }
                    }
                },
                sleeper = { _, token -> token.throwIfCancelled() },
            )
        val gen = engine.currentGeneration()
        val ok = engine.completeSync(CompletionRequest("1", "a.kt", "kotlin", "val a = ", "", 8, Trigger.MANUAL, gen), debounce = false)
        assertTrue(ok is CompletionOutcome.Success)
        val hit = engine.completeSync(CompletionRequest("2", "a.kt", "kotlin", "val a = ", "", 8, Trigger.MANUAL, gen), debounce = false)
        assertTrue(hit is CompletionOutcome.Success)
        val fail = engine.completeSync(CompletionRequest("3", "b.kt", "kotlin", "val b = ", "", 8, Trigger.MANUAL, gen), debounce = false)
        assertTrue(fail is CompletionOutcome.Failed)
        val tok = CancellationToken().apply { cancel() }
        val cancelled = engine.completeSync(CompletionRequest("4", "c.kt", "kotlin", "val c = ", "", 8, Trigger.MANUAL, gen), debounce = false, token = tok)
        assertEquals(CompletionOutcome.Cancelled, cancelled)
        engine.recordAccepted()
        engine.recordAccepted()

        val stats = engine.sessionStats()
        assertEquals(4L, stats.totalRequests)
        assertEquals(1L, stats.cacheHits)
        assertEquals(1L, stats.failed)
        assertEquals(1L, stats.cancelled)
        assertEquals(2L, stats.accepted)
        assertTrue((stats.p50LatencyMs ?: -1L) >= 10L)
        assertTrue((stats.p95LatencyMs ?: -1L) >= (stats.p50LatencyMs ?: 0L))
        assertTrue(!stats.backoffBlocked)
        assertTrue(!stats.backoffFatal)
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
