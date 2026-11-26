package io.autocomplete.contracts

import com.sun.net.httpserver.HttpServer
import io.autocomplete.cache.SuggestionCache
import io.autocomplete.client.CancellationToken
import io.autocomplete.client.HttpCompletionClient
import io.autocomplete.client.ProviderConfig
import io.autocomplete.client.ProviderKind
import io.autocomplete.client.ProviderRequest
import io.autocomplete.client.RequestStyle
import io.autocomplete.engine.CacheMatchType
import io.autocomplete.engine.CachedSuggestion
import io.autocomplete.prompt.PromptBuilder
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.util.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

/**
 * Verifies engine-jvm against the shared read-only contract fixtures in
 * `packages/completion/contracts/testdata/`.
 */
class ContractsFixtureTest {
    private fun contractsDir(): Path {
        var cur = Path.of("").toAbsolutePath()
        repeat(6) {
            val direct = cur.resolve("packages/completion/contracts")
            if (Files.isDirectory(direct)) return direct
            val sibling = cur.resolve("../contracts").normalize()
            if (Files.isDirectory(sibling) && Files.isDirectory(sibling.resolve("testdata"))) return sibling
            cur = cur.parent ?: return@repeat
        }
        error("Unable to locate packages/completion/contracts from ${Path.of("").toAbsolutePath()}")
    }

    private fun readJsonObject(relativePath: String): Map<String, Any?> {
        val text = Files.readString(contractsDir().resolve(relativePath), StandardCharsets.UTF_8)
        return Json.parseObject(text)
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun suggestionCacheMatchesSharedFixture() {
        val fixture = readJsonObject("testdata/cache/suggestion_match.json")
        val cases = fixture["cases"] as List<Map<String, Any?>>
        assertTrue(cases.isNotEmpty())
        for (c in cases) {
            val cache = SuggestionCache(10)
            val put = c["put"] as Map<String, Any?>
            val find = c["find"] as Map<String, Any?>
            val expected = c["expected"] as Map<String, Any?>
            cache.put(
                CachedSuggestion(
                    scope = put["scope"].toString(),
                    prefix = put["prefix"].toString(),
                    suffix = put["suffix"].toString(),
                    text = put["text"].toString(),
                ),
            )
            val hit = cache.find(find["scope"].toString(), find["prefix"].toString(), find["suffix"].toString())
            assertNotNull(hit, "case=${c["id"]}")
            assertEquals(expected["text"].toString(), hit!!.text, "case=${c["id"]}")
            assertEquals(CacheMatchType.valueOf(expected["match"].toString()), hit.match, "case=${c["id"]}")
        }
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun promptBuilderMatchesSharedBudgetFixture() {
        val fixture = readJsonObject("testdata/prompt/budget_truncate.json")
        val cases = fixture["cases"] as List<Map<String, Any?>>
        assertTrue(cases.isNotEmpty())
        for (c in cases) {
            val built =
                PromptBuilder.build(
                    prefix = c["prefix"].toString(),
                    suffix = c["suffix"].toString(),
                    maxPrefixChars = (c["maxPrefixChars"] as Number).toInt(),
                    maxSuffixChars = (c["maxSuffixChars"] as Number).toInt(),
                    path = c["path"]?.toString(),
                    language = c["language"]?.toString(),
                    sendFilePath = c["sendFilePath"] as Boolean,
                )
            assertEquals(c["expectedSuffix"].toString(), built.suffix, "case=${c["id"]}")
            c["expectedPrefix"]?.let { expectedPrefix ->
                assertEquals(expectedPrefix.toString(), built.prefix, "case=${c["id"]}")
            }
            (c["expectedPrefixContains"] as? List<String>)?.forEach { needle ->
                assertTrue(built.prefix.contains(needle), "case=${c["id"]} missing '$needle' in '${built.prefix}'")
            }
        }
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun httpClientMatchesSharedChatFimAndQwenFixtures() {
        val chatFixture = readJsonObject("testdata/http/chat_completion.json")
        val fimFixture = readJsonObject("testdata/http/fim_completion.json")
        val qwenFixture = readJsonObject("testdata/http/token_fim_qwen_body.json")

        val chatBody = Json.obj(*(chatFixture["response"] as Map<String, Any?>).entries.map { it.key to it.value }.toTypedArray())
        val fimBody = Json.obj(*(fimFixture["response"] as Map<String, Any?>).entries.map { it.key to it.value }.toTypedArray())

        var capturedQwenBody = ""
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { ex ->
            ex.requestBody.readAllBytes()
            val bytes = chatBody.toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/fim/completions") { ex ->
            ex.requestBody.readAllBytes()
            val bytes = fimBody.toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.createContext("/v1/completions") { ex ->
            capturedQwenBody = ex.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            val bytes = fimBody.toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val baseUrl = "http://127.0.0.1:${server.address.port}/v1"

            // Chat fixture
            val chatClient =
                HttpCompletionClient(
                    ProviderConfig(
                        kind = ProviderKind.OPENAI_COMPATIBLE,
                        baseUrl = baseUrl,
                        apiKey = "",
                        model = "demo",
                        requestStyle = RequestStyle.CHAT,
                        promptTemplate = PromptTemplate.CHAT,
                    ),
                )
            val chatResp = chatClient.complete(ProviderRequest("demo", "a", "b", 16, 0.0), CancellationToken())
            assertEquals(chatFixture["expectedText"].toString(), chatResp.text)
            val expectedUsage = chatFixture["expectedUsage"] as Map<String, Any?>
            assertEquals((expectedUsage["inputTokens"] as Number).toInt(), chatResp.usage?.inputTokens)
            assertEquals((expectedUsage["outputTokens"] as Number).toInt(), chatResp.usage?.outputTokens)

            // FIM fixture
            val fimClient =
                HttpCompletionClient(
                    ProviderConfig(
                        kind = ProviderKind.OPENAI_COMPATIBLE,
                        baseUrl = baseUrl,
                        apiKey = "",
                        model = "codestral",
                        promptTemplate = PromptTemplate.CODESTRAL_API,
                    ),
                )
            val fimResp = fimClient.complete(ProviderRequest("codestral", "a", "b", 16, 0.0), CancellationToken())
            assertEquals(fimFixture["expectedText"].toString(), fimResp.text)

            // Qwen token FIM request body fixture
            val input = qwenFixture["input"] as Map<String, Any?>
            val expectedBody = qwenFixture["expectedBody"] as Map<String, Any?>
            val qwenClient =
                HttpCompletionClient(
                    ProviderConfig(
                        kind = ProviderKind.OPENAI_COMPATIBLE,
                        baseUrl = baseUrl,
                        apiKey = "",
                        model = input["model"].toString(),
                        promptTemplate = PromptTemplate.valueOf(qwenFixture["template"].toString()),
                    ),
                )
            qwenClient.complete(
                ProviderRequest(
                    model = input["model"].toString(),
                    prefix = input["prefix"].toString(),
                    suffix = input["suffix"].toString(),
                    maxTokens = (input["maxTokens"] as Number).toInt(),
                    temperature = (input["temperature"] as Number).toDouble(),
                    stream = input["stream"] as Boolean,
                ),
                CancellationToken(),
            )
            val actualBody = Json.parseObject(capturedQwenBody)
            assertEquals(expectedBody["model"], actualBody["model"])
            assertEquals(expectedBody["prompt"], actualBody["prompt"])
            assertEquals((expectedBody["max_tokens"] as Number).toInt(), (actualBody["max_tokens"] as Number).toInt())
            assertEquals(expectedBody["stream"], actualBody["stream"])
            assertEquals(expectedBody["stop"], actualBody["stop"])
        } finally {
            server.stop(0)
        }
    }
}
