package io.autocomplete.client

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import io.autocomplete.log.LogLevel
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.prompt.TemplateProbeStatus

class HttpCompletionClientFixtureTest {
    private lateinit var server: HttpServer
    private var port: Int = 0
    private var lastBody: String = ""
    private var lastPath: String = ""
    private var lastAuthorization: String? = null

    @BeforeEach
    fun setUp() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { exchange ->
            lastPath = exchange.requestURI.path
            lastBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val payload =
                """
                {"choices":[{"message":{"content":"println(1)"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}
                """.trimIndent()
            val bytes = payload.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/completions") { exchange ->
            lastPath = exchange.requestURI.path
            lastBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val payload = """{"choices":[{"text":"return a + b"}]}"""
            val bytes = payload.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/fim/completions") { exchange ->
            lastPath = exchange.requestURI.path
            lastBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val payload = """{"choices":[{"text":"return a + b"}]}"""
            val bytes = payload.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/models") { exchange ->
            lastPath = exchange.requestURI.path
            lastAuthorization = exchange.requestHeaders.getFirst("Authorization")
            val payload = """{"data":[{"id":"qwen-coder"},{"id":"codestral"},{"id":"qwen-coder"}]}"""
            val bytes = payload.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/slow/models") { exchange ->
            try {
                Thread.sleep(2000)
                val bytes = """{"data":[]}""".toByteArray()
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        server.createContext("/v1/fail") { exchange ->
            val bytes = "nope".toByteArray()
            exchange.sendResponseHeaders(401, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        port = server.address.port
    }

    @AfterEach
    fun tearDown() {
        server.stop(0)
    }

    @Test
    fun chatCompletionParsesMessage() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "secret",
                    model = "demo",
                    requestStyle = RequestStyle.CHAT,
                    timeoutMs = 3000,
                ),
            )
        val resp =
            client.complete(
                ProviderRequest(
                    model = "demo",
                    prefix = "fun f() {",
                    suffix = "}",
                    maxTokens = 32,
                    temperature = 0.0,
                ),
                CancellationToken(),
            )
        assertEquals("println(1)", resp.text)
        assertEquals(3, resp.usage?.inputTokens)
        assertEquals(2, resp.usage?.outputTokens)
        assertTrue(lastBody.contains("messages"))
        assertEquals("/v1/chat/completions", lastPath)
    }

    @Test
    fun openAiFimDefaultPathWhenBaseHasV1() {
        assertEquals(
            "/fim/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.mistral.ai/v1", "/fim/completions"),
        )
        assertEquals(
            "/v1/fim/completions",
            HttpCompletionClient.defaultOpenAiRelativePath("https://api.mistral.ai", "/fim/completions"),
        )
    }

    @Test
    fun fimCompletionParsesText() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "codestral",
                    requestStyle = RequestStyle.FIM,
                    promptTemplate = PromptTemplate.CODESTRAL_API,
                    // empty fimPath → OpenAI default /fim/completions under .../v1
                    timeoutMs = 3000,
                ),
            )
        val resp =
            client.complete(
                ProviderRequest(
                    model = "codestral",
                    prefix = "def add(a,b):\n    ",
                    suffix = "",
                    maxTokens = 16,
                    temperature = 0.0,
                ),
                CancellationToken(),
            )
        assertEquals("return a + b", resp.text)
        assertEquals("/v1/fim/completions", lastPath)
        assertTrue(lastBody.contains("\"prompt\""))
        assertTrue(lastBody.contains("\"suffix\""))
    }

    @Test
    fun qwenTokenTemplateUsesCompletionsPathAndSpecialTokens() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "qwen2.5-coder",
                    promptTemplate = PromptTemplate.QWEN,
                    timeoutMs = 3000,
                ),
            )
        val resp =
            client.complete(
                ProviderRequest(
                    model = "qwen2.5-coder",
                    prefix = "def add(a, b):\n    ",
                    suffix = "\n",
                    maxTokens = 16,
                    temperature = 0.0,
                ),
                CancellationToken(),
            )
        assertEquals("return a + b", resp.text)
        assertEquals("/v1/completions", lastPath)
        assertTrue(lastBody.contains("<|fim_prefix|>"))
        assertTrue(lastBody.contains("<|fim_middle|>"))
    }

    @Test
    fun probeAllTemplatesReportsPerTemplateStatus() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "",
                    model = "demo",
                    promptTemplate = PromptTemplate.CHAT,
                    timeoutMs = 3000,
                ),
            )
        val results = client.probeAllTemplates()
        assertEquals(PromptTemplate.probeCandidates().size, results.size)
        val chat = results.first { it.template == PromptTemplate.CHAT }
        assertEquals(TemplateProbeStatus.SUCCESS, chat.status)
        val qwen = results.first { it.template == PromptTemplate.QWEN }
        assertEquals(TemplateProbeStatus.SUCCESS, qwen.status)
        assertTrue(results.any { it.isUsable() })
    }

    @Test
    fun unauthorizedThrowsStatus() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.CUSTOM,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "x",
                    model = "m",
                    requestStyle = RequestStyle.CHAT,
                    chatPath = "/fail",
                    timeoutMs = 3000,
                ),
            )
        val ex =
            assertThrows(HttpStatusException::class.java) {
                client.complete(
                    ProviderRequest("m", "a", "b", 8, 0.0),
                    CancellationToken(),
                )
        }
        assertEquals(401, ex.status)
        assertTrue(ex.message.orEmpty().contains("POST http://127.0.0.1:$port/v1/fail"))
    }

    @Test
    fun blocksRemoteWhenDisallowed() {
        assertThrows(IllegalArgumentException::class.java) {
            HttpCompletionClient.validateBaseUrl("https://api.openai.com/v1", allowRemote = false)
        }
    }

    @Test
    fun listsAndDeduplicatesOpenAiCompatibleModels() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/v1",
                    apiKey = "model-key",
                    model = "",
                    requestStyle = RequestStyle.CHAT,
                    timeoutMs = 3000,
                ),
            )

        val models = client.listModels()

        assertEquals(listOf("codestral", "qwen-coder"), models.map { it.id })
        assertEquals("/v1/models", lastPath)
        assertEquals("Bearer model-key", lastAuthorization)
    }

    @Test
    fun modelListFailureIncludesFinalRequestUrl() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/missing",
                    apiKey = "",
                    model = "",
                    requestStyle = RequestStyle.CHAT,
                    timeoutMs = 3000,
                ),
            )

        val ex = assertThrows(HttpStatusException::class.java) { client.listModels() }

        assertEquals(404, ex.status)
        assertTrue(ex.message.orEmpty().contains("GET http://127.0.0.1:$port/missing/v1/models"))
    }

    @Test
    fun httpLogsContainDiagnosticsButNotApiKey() {
        val events = mutableListOf<HttpLogEvent>()
        val client =
            HttpCompletionClient(
                config =
                    ProviderConfig(
                        kind = ProviderKind.OPENAI_COMPATIBLE,
                        baseUrl = "http://127.0.0.1:$port/v1",
                        apiKey = "super-secret-key",
                        model = "demo",
                        requestStyle = RequestStyle.CHAT,
                        timeoutMs = 3000,
                    ),
                operation = "connection_test",
                onLog = { events += it },
            )

        client.testConnection()

        // Settings ops (connection_test) emit start at INFO so the log tool window is useful by default.
        assertEquals(listOf(LogLevel.INFO, LogLevel.INFO), events.map { it.level })
        assertTrue(events.all { it.url == "http://127.0.0.1:$port/v1/chat/completions" })
        assertTrue(events.none { it.toString().contains("super-secret-key") })
        assertEquals("connection_test", events.last().operation)
        assertEquals(200, events.last().status)
        assertTrue(events.first().message.contains("timeoutMs="))
    }

    @Test
    fun modelListHasOuterHardTimeout() {
        val client =
            HttpCompletionClient(
                ProviderConfig(
                    kind = ProviderKind.OPENAI_COMPATIBLE,
                    baseUrl = "http://127.0.0.1:$port/slow",
                    apiKey = "",
                    model = "",
                    requestStyle = RequestStyle.CHAT,
                    timeoutMs = 500,
                    settingsTimeoutMs = 1000,
                ),
            )
        val started = System.currentTimeMillis()

        val ex = assertThrows(RuntimeException::class.java) { client.listModels() }

        assertTrue(ex.message.orEmpty().contains("GET http://127.0.0.1:$port/slow/models"))
        assertTrue(ex.message.orEmpty().contains("timed out after 1000ms"))
        assertTrue(System.currentTimeMillis() - started < 2500)
    }
}
