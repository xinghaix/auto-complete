package io.autocomplete.client

import com.sun.net.httpserver.HttpServer
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.Json
import io.autocomplete.util.SecretRedactor
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class HttpCompletionClientStreamingAndSecurityTest {
    private lateinit var server: HttpServer
    private var port: Int = 0
    private var lastHeaders: Map<String, List<String>> = emptyMap()
    private var lastBody: String = ""
    private var lastRawUri: String = ""

    @BeforeEach
    fun setUp() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.executor = Executors.newCachedThreadPool()

        server.createContext("/v1/chat/completions") { ex ->
            lastRawUri = ex.requestURI.toString()
            lastHeaders = ex.requestHeaders.entries.associate { it.key.lowercase() to it.value.toList() }
            lastBody = ex.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val body = Json.parseObject(lastBody)
            if (body["stream"] == true) {
                ex.responseHeaders.add("Content-Type", "text/event-stream")
                ex.sendResponseHeaders(200, 0)
                ex.responseBody.use { out ->
                    val chunks =
                        listOf(
                            """data: {"choices":[{"delta":{"content":"def"}}]}""",
                            """data: {"choices":[{"delta":{"content":" "}}]}""",
                            """data: {"choices":[{"delta":{"content":"add():"}}]}""",
                            """data: {"choices":[{"delta":{"content":"\n"}}]}""",
                            """data: {"choices":[{"delta":{"content":"    "}}]}""",
                            """data: {"choices":[{"delta":{"content":"return 1"}}]}""",
                            """data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":7}}""",
                            "data: [DONE]",
                            """data: {"choices":[{"delta":{"content":"SHOULD_NOT_BE_READ"}}]}""",
                        )
                    for (line in chunks) {
                        out.write("$line\n\n".toByteArray(StandardCharsets.UTF_8))
                        out.flush()
                    }
                }
            } else {
                val payload = """{"choices":[{"message":{"content":"   "}}]}"""
                val bytes = payload.toByteArray(StandardCharsets.UTF_8)
                ex.sendResponseHeaders(200, bytes.size.toLong())
                ex.responseBody.use { it.write(bytes) }
            }
        }

        server.createContext("/earlystop/chat/completions") { ex ->
            ex.requestBody.readAllBytes()
            ex.responseHeaders.add("Content-Type", "text/event-stream")
            ex.sendResponseHeaders(200, 0)
            runCatching {
                ex.responseBody.use { out ->
                    out.write("""data: {"choices":[{"delta":{"content":"return a + b"}}]}""".toByteArray())
                    out.write("\n\n".toByteArray())
                    out.flush()
                    out.write("""data: {"choices":[{"delta":{"content":"\nnext_line"}}]}""".toByteArray())
                    out.write("\n\n".toByteArray())
                    out.flush()
                    // Keep stream open far beyond test timeout to prove early-stop closes immediately.
                    Thread.sleep(5_000)
                }
            }
        }

        server.createContext("/stall/chat/completions") { ex ->
            ex.requestBody.readAllBytes()
            ex.responseHeaders.add("Content-Type", "text/event-stream")
            ex.sendResponseHeaders(200, 0)
            runCatching {
                ex.responseBody.use { out ->
                    out.write("""data: {"choices":[{"delta":{"content":"partial"}}]}""".toByteArray())
                    out.write("\n\n".toByteArray())
                    out.flush()
                    Thread.sleep(5_000)
                }
            }
        }

        server.createContext("/secret-echo/chat/completions") { ex ->
            ex.requestBody.readAllBytes()
            val payload = """{"error":"invalid token Bearer super-secret-xyz and raw my-real-key-999"}"""
            val bytes = payload.toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(401, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }

        server.createContext("/beta/completions") { ex ->
            lastRawUri = ex.requestURI.toString()
            lastBody = ex.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val payload = """{"choices":[{"text":"a + b"}]}"""
            val bytes = payload.toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }

        server.start()
        port = server.address.port
    }

    @AfterEach
    fun tearDown() {
        server.stop(0)
    }

    @Test
    fun streamingPreservesWhitespaceIndentNewlinesUsageAndStopsAtDone() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    stream = true,
                    timeoutMs = 3000,
                ),
            )
        val resp =
            client.complete(
                ProviderRequest("demo", "p", "s", 32, 0.0, stream = true),
                CancellationToken(),
            )
        assertEquals("def add():\n    return 1", resp.text)
        assertEquals(12, resp.usage?.inputTokens)
        assertEquals(7, resp.usage?.outputTokens)
    }

    @Test
    fun nonStreamingPreservesWhitespaceOnlyContent() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    stream = false,
                    timeoutMs = 3000,
                ),
            )
        val resp = client.complete(ProviderRequest("demo", "p", "s", 32, 0.0, stream = false), CancellationToken())
        assertEquals("   ", resp.text)
    }

    @Test
    fun streamingEarlyStopClosesStreamImmediatelyOnNewline() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/earlystop",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    stream = true,
                    timeoutMs = 4000,
                ),
            )
        val started = System.currentTimeMillis()
        val resp =
            client.complete(
                ProviderRequest("demo", "def f(): return ", "", 32, 0.0, stream = true, stopAtNewline = true),
                CancellationToken(),
            )
        val elapsed = System.currentTimeMillis() - started
        assertEquals("return a + b", resp.text)
        assertTrue(elapsed < 2000, "early-stop should return immediately, took ${elapsed}ms")
    }

    @Test
    fun streamingMidStreamTimeoutWatchdogAbortsStalledStream() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/stall",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    stream = true,
                    timeoutMs = 500,
                ),
            )
        val started = System.currentTimeMillis()
        val ex =
            assertThrows(RuntimeException::class.java) {
                client.complete(ProviderRequest("demo", "p", "s", 32, 0.0, stream = true), CancellationToken())
            }
        val elapsed = System.currentTimeMillis() - started
        assertTrue(ex.message.orEmpty().contains("timed out"), "msg=${ex.message}")
        assertTrue(elapsed < 2500, "watchdog should abort stalled stream, took ${elapsed}ms")
    }

    @Test
    fun streamingCancellationClosesStalledStreamImmediately() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/stall",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    stream = true,
                    timeoutMs = 5000,
                ),
            )
        val token = CancellationToken()
        val exec = Executors.newSingleThreadExecutor()
        val done = CountDownLatch(1)
        var thrown: Throwable? = null
        val started = System.currentTimeMillis()
        exec.submit {
            try {
                client.complete(ProviderRequest("demo", "p", "s", 32, 0.0, stream = true), token)
            } catch (t: Throwable) {
                thrown = t
            } finally {
                done.countDown()
            }
        }
        Thread.sleep(150)
        token.cancel()
        assertTrue(done.await(2, TimeUnit.SECONDS))
        exec.shutdownNow()
        val elapsed = System.currentTimeMillis() - started
        assertTrue(thrown is CancelledException, "expected CancelledException, got $thrown")
        assertTrue(elapsed < 2000, "cancel should abort promptly, took ${elapsed}ms")
    }

    @Test
    fun urlResolutionKeepsNonEmptyPrefixesAndPreservesQueryParams() {
        assertEquals(
            "/v1/fim/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.mistral.ai", "/fim/completions"),
        )
        assertEquals(
            "/v1/fim/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.mistral.ai/", "/fim/completions"),
        )
        assertEquals(
            "/fim/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.mistral.ai/v1", "/fim/completions"),
        )
        assertEquals(
            "/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.deepseek.com/beta", "/completions"),
        )
        assertEquals(
            "/chat/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://gw.example.com/v2", "/chat/completions"),
        )
        assertEquals(
            "/chat/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://gw.example.com/openai/v1beta", "/chat/completions"),
        )

        assertEquals(
            "https://my.openai.azure.com/openai/deployments/gpt4/chat/completions?api-version=2024-06-01",
            HttpCompletionClient.joinUrl(
                "https://my.openai.azure.com/openai/deployments/gpt4?api-version=2024-06-01",
                " /chat/completions ",
            ),
        )
        assertEquals(
            "https://api.example.com/v1/chat/completions?a=1&b=2",
            HttpCompletionClient.joinUrl("https://api.example.com/v1?a=1", "/chat/completions?b=2"),
        )
        assertEquals(
            "http://[::1]:11434/v1/completions",
            HttpCompletionClient.joinUrl("http://[::1]:11434/v1/", "/completions"),
        )
    }

    @Test
    fun deepSeekBetaFimDefaultsToBetaCompletions() {
        val cfg =
            ProviderConfig(
                kind = ProviderKind.OPENAI_COMPATIBLE,
                baseUrl = "https://api.deepseek.com/beta",
                apiKey = "",
                model = "deepseek-chat",
                promptTemplate = PromptTemplate.AUTO,
            )
        val resolved = HttpCompletionClient.resolveTemplate(cfg)
        assertEquals(PromptTemplate.CODESTRAL_API, resolved)
        assertEquals("/completions", HttpCompletionClient.resolvePath(resolved, cfg))
        assertEquals("https://api.deepseek.com/beta/completions", HttpCompletionClient.resolveUrl(resolved, cfg))
    }

    @Test
    fun extraBodyJsonAndStopSequencesSafelyMergeWithoutOverridingProtectedKeys() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/beta",
                    apiKey = "",
                    model = "deepseek-chat",
                    promptTemplate = PromptTemplate.CODESTRAL_API,
                    fimPath = " /completions ",
                    extraBodyJson = """{"model":"hijacked","prompt":"evil","stream":true,"top_p":0.9,"seed":42}""",
                    stopSequences = "END,###",
                    timeoutMs = 3000,
                ),
            )
        val resp = client.complete(ProviderRequest("deepseek-chat", "def f(): ", "", 32, 0.0), CancellationToken())
        assertEquals("a + b", resp.text)
        assertEquals("/beta/completions", lastRawUri)
        val parsed = Json.parseObject(lastBody)
        assertEquals("deepseek-chat", parsed["model"])
        assertEquals("def f(): ", parsed["prompt"])
        assertEquals(false, parsed["stream"])
        assertEquals(0.9, (parsed["top_p"] as Number).toDouble())
        assertEquals(42L, (parsed["seed"] as Number).toLong())
        assertEquals(listOf("END", "###"), parsed["stop"])
    }

    @Test
    fun extraHeadersBlockReservedSensitiveCrlfAndNonObject() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "real-key",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    extraHeadersJson =
                        """
                        {
                          "Authorization": "Bearer evil",
                          "Content-Type": "text/plain",
                          "Accept": "text/plain",
                          "Host": "evil.example",
                          "X-Goog-Api-Key": "secret1",
                          "Anthropic-Api-Key": "secret2",
                          "OpenAI-Api-Key": "secret3",
                          "Ocp-Apim-Subscription-Key": "secret4",
                          "Private-Token": "secret5",
                          "X-Custom-Session": "secret6",
                          "X-Tenant-Id": "acme",
                          "X-Bad-Value": "ok\r\nInjected: yes"
                        }
                        """.trimIndent(),
                    timeoutMs = 3000,
                ),
            )
        client.complete(ProviderRequest("demo", "a", "b", 16, 0.0), CancellationToken())
        assertEquals(listOf("Bearer real-key"), lastHeaders["authorization"])
        assertEquals(listOf("application/json"), lastHeaders["content-type"])
        assertEquals(listOf("acme"), lastHeaders["x-tenant-id"])
        assertFalse(lastHeaders.containsKey("x-goog-api-key"))
        assertFalse(lastHeaders.containsKey("anthropic-api-key"))
        assertFalse(lastHeaders.containsKey("openai-api-key"))
        assertFalse(lastHeaders.containsKey("ocp-apim-subscription-key"))
        assertFalse(lastHeaders.containsKey("private-token"))
        assertFalse(lastHeaders.containsKey("x-custom-session"))
        assertFalse(lastHeaders.containsKey("x-bad-value"))
        assertFalse(lastHeaders.containsKey("injected"))
    }

    @Test
    fun redactsUserInfoSensitiveQueryParamsBearerAndKnownApiKeyInLogsAndErrors() {
        assertEquals(
            "https://api.example.com/v1/chat?api-version=2024-06-01&api-key=[REDACTED]&token=[REDACTED]&key=[REDACTED]",
            SecretRedactor.redactUrl(
                "https://user:pass@api.example.com/v1/chat?api-version=2024-06-01&api-key=abc&token=def&key=ghi",
            ),
        )

        val logs = mutableListOf<HttpLogEvent>()
        val client =
            HttpCompletionClient(
                config =
                    ProviderConfig(
                        kind = ProviderKind.OPENAI_COMPATIBLE,
                        baseUrl = "http://127.0.0.1:$port/secret-echo?api-key=url-secret&api-version=1",
                        apiKey = "my-real-key-999",
                        model = "demo",
                        promptTemplate = PromptTemplate.CHAT,
                        timeoutMs = 3000,
                    ),
                onLog = { logs += it },
            )
        val ex =
            assertThrows(HttpStatusException::class.java) {
                client.complete(ProviderRequest("demo", "a", "b", 16, 0.0), CancellationToken())
            }
        assertEquals(401, ex.status)
        val msg = ex.message.orEmpty()
        assertFalse(msg.contains("url-secret"), "URL query secret leaked: $msg")
        assertFalse(msg.contains("super-secret-xyz"), "Bearer token leaked: $msg")
        assertFalse(msg.contains("my-real-key-999"), "API key leaked: $msg")
        assertTrue(msg.contains("api-version=1"))
        assertTrue(logs.isNotEmpty())
        assertTrue(logs.none { it.toString().contains("url-secret") })
        assertTrue(logs.none { it.toString().contains("my-real-key-999") })
        assertTrue(logs.none { it.toString().contains("super-secret-xyz") })
    }

    @Test
    fun sharedDefaultHttpClientIsReused() {
        val c1 = HttpCompletionClient.sharedDefaultHttpClient()
        val c2 = HttpCompletionClient.sharedDefaultHttpClient()
        assertNotNull(c1)
        assertSame(c1, c2)
    }

    @Test
    fun validateBaseUrlRejectsNonHttpSchemesAndUserInfoAndAcceptsIpv6Loopback() {
        HttpCompletionClient.validateBaseUrl("http://[::1]:11434/v1", allowRemote = false)
        assertThrows(IllegalArgumentException::class.java) {
            HttpCompletionClient.validateBaseUrl("file:///etc/passwd", allowRemote = true)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HttpCompletionClient.validateBaseUrl("https://user:pass@api.example.com/v1", allowRemote = true)
        }
    }

    @Test
    fun probeHonorsConfiguredMaxTokensParsesContentArrayAndDiagnosesReasoningEmpty() {
        var capturedBody = ""
        server.createContext("/v1/parts") { exchange ->
            capturedBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val payload =
                """{"choices":[{"message":{"content":[{"type":"text","text":"return "},{"type":"output_text","text":"a + b"}]}}]}"""
            val bytes = payload.toByteArray(StandardCharsets.UTF_8)
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/reasoning-empty") { exchange ->
            exchange.requestBody.readAllBytes()
            val payload =
                """{"choices":[{"finish_reason":"length","message":{"content":"","reasoning_content":"thinking..."}}],"usage":{"prompt_tokens":10,"completion_tokens":128,"completion_tokens_details":{"reasoning_tokens":128}}}"""
            val bytes = payload.toByteArray(StandardCharsets.UTF_8)
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }

        val partsClient =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    chatPath = "/parts",
                    maxTokens = 256,
                    timeoutMs = 3000,
                ),
            )
        val ok = partsClient.probeTemplate(PromptTemplate.CHAT)
        assertEquals(io.autocomplete.prompt.TemplateProbeStatus.SUCCESS, ok.status)
        assertEquals("return a + b", ok.preview)
        assertTrue(capturedBody.contains("\"max_tokens\":256"), "probe must honor config.maxTokens: $capturedBody")

        val emptyClient =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    chatPath = "/reasoning-empty",
                    maxTokens = 128,
                    timeoutMs = 3000,
                ),
            )
        val empty = emptyClient.probeTemplate(PromptTemplate.CHAT)
        assertEquals(io.autocomplete.prompt.TemplateProbeStatus.EMPTY, empty.status)
        assertTrue(empty.error.contains("reasoning_tokens=128"), "expected reasoning diagnostic: ${empty.error}")
        assertTrue(empty.error.contains("maxTokens"), "expected maxTokens guidance: ${empty.error}")
    }

    @Test
    fun completionPromptDoesNotInheritChatEndpointFromFimPath() {
        val cfg =
            ProviderConfig(
                kind = ProviderKind.OPENAI_COMPATIBLE,
                baseUrl = "http://127.0.0.1:11434/v1",
                apiKey = "",
                model = "qwen2.5-coder:7b",
                fimPath = "/chat/completions",
            )
        assertEquals("/completions", HttpCompletionClient.resolvePath(PromptTemplate.QWEN, cfg))
        assertEquals("/chat/completions", HttpCompletionClient.resolvePath(PromptTemplate.CODESTRAL_API, cfg))
    }

    @Test
    fun responsesApiBlockingAndStreamingSupportNestedReasoningAndClean404() {
        var capturedBody = ""
        server.createContext("/v1/responses") { exchange ->
            capturedBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            if (capturedBody.contains("\"stream\":true")) {
                val sse =
                    listOf(
                        """data: {"type":"response.output_text.delta","delta":"return "}""",
                        """data: {"type":"response.output_text.delta","delta":"a + b"}""",
                        """data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":12,"output_tokens":4}}}""",
                        "",
                    ).joinToString("\n\n")
                val bytes = sse.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.add("Content-Type", "text/event-stream")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            } else {
                val payload =
                    """{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"return a + b"}]}],"usage":{"input_tokens":12,"output_tokens":4}}"""
                val bytes = payload.toByteArray(StandardCharsets.UTF_8)
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
        }
        server.createContext("/v1/empty-404") { exchange ->
            exchange.requestBody.readAllBytes()
            exchange.sendResponseHeaders(404, -1)
            exchange.close()
        }

        val baseCfg =
            ProviderConfig(
                kind = ProviderKind.OPENAI_COMPATIBLE,
                baseUrl = "http://127.0.0.1:$port/v1",
                apiKey = "",
                model = "gpt-6-luna",
                promptTemplate = PromptTemplate.RESPONSES,
                extraBodyJson = """{"reasoning":{"effort":"none"},"input":"hijack","stop":["\n\n"]}""",
                stopSequences = "###",
                maxTokens = 256,
                timeoutMs = 3000,
            )

        val blocking = HttpCompletionClient(baseCfg).probeTemplate(PromptTemplate.RESPONSES)
        assertEquals(io.autocomplete.prompt.TemplateProbeStatus.SUCCESS, blocking.status)
        assertEquals("return a + b", blocking.preview)
        assertEquals("/responses", blocking.resolvedPath)
        assertTrue(capturedBody.contains("\"instructions\""), "expected instructions: $capturedBody")
        assertTrue(capturedBody.contains("\"max_output_tokens\":256"), "expected max_output_tokens: $capturedBody")
        assertTrue(capturedBody.contains("\"store\":false"), "expected store=false: $capturedBody")
        assertTrue(capturedBody.contains("\"effort\":\"none\""), "expected nested reasoning.effort=none: $capturedBody")
        assertFalse(capturedBody.contains("\"hijack\""), "protected input key must not be overwritten: $capturedBody")
        assertFalse(capturedBody.contains("\"stop\""), "Responses API must omit top-level stop: $capturedBody")
        assertFalse(capturedBody.contains("\"temperature\""), "Responses API must omit default temperature=0: $capturedBody")

        val streaming = HttpCompletionClient(baseCfg.copy(stream = true)).probeTemplate(PromptTemplate.RESPONSES)
        assertEquals(io.autocomplete.prompt.TemplateProbeStatus.SUCCESS, streaming.status)
        assertEquals("return a + b", streaming.preview)

        val empty404 =
            HttpCompletionClient(
                baseCfg.copy(
                    promptTemplate = PromptTemplate.CODESTRAL_API,
                    fimPath = "/empty-404",
                    stream = true,
                ),
            ).probeTemplate(PromptTemplate.CODESTRAL_API)
        assertEquals(io.autocomplete.prompt.TemplateProbeStatus.FAILED, empty404.status)
        assertEquals(404, empty404.httpStatus)
        assertTrue(empty404.error.contains("Not Found"), "expected Not Found instead of stream failed: ${empty404.error}")
        assertFalse(empty404.error.contains("stream failed"), "should not emit generic stream failed: ${empty404.error}")
    }
}
