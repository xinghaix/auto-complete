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
import io.autocomplete.filter.SuggestionFilter
import io.autocomplete.prompt.PromptBuilder
import io.autocomplete.prompt.PromptTemplate
import io.autocomplete.prompt.PromptTemplateDetector
import io.autocomplete.skip.ContextualSkip
import io.autocomplete.util.IgnoreRules
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

    @Test
    @Suppress("UNCHECKED_CAST")
    fun suggestionFilterMatchesSharedPostprocessRegressionFixture() {
        val fixture = readJsonObject("testdata/filter/postprocess_regression.json")

        val prefixOverlapCases = fixture["prefixOverlapCases"] as List<Map<String, Any?>>
        assertTrue(prefixOverlapCases.isNotEmpty())
        for (c in prefixOverlapCases) {
            val actual =
                SuggestionFilter.removePrefixOverlap(
                    suggestion = c["suggestion"].toString(),
                    prefix = c["prefix"].toString(),
                )
            assertEquals(c["expected"].toString(), actual, "prefixOverlap case=${c["id"]}")
        }

        val suffixOverlapCases = fixture["suffixOverlapCases"] as List<Map<String, Any?>>
        assertTrue(suffixOverlapCases.isNotEmpty())
        for (c in suffixOverlapCases) {
            val actual =
                SuggestionFilter.removeSuffixOverlap(
                    suggestion = c["suggestion"].toString(),
                    suffix = c["suffix"].toString(),
                )
            assertEquals(c["expected"].toString(), actual, "suffixOverlap case=${c["id"]}")
        }

        val postprocessCases = fixture["postprocessCases"] as List<Map<String, Any?>>
        assertTrue(postprocessCases.isNotEmpty())
        for (c in postprocessCases) {
            val actual =
                SuggestionFilter.postprocess(
                    raw = c["raw"].toString(),
                    prefix = c["prefix"].toString(),
                    suffix = c["suffix"].toString(),
                    firstLineOnly = c["firstLineOnly"] as Boolean,
                )
            assertEquals(c["expected"]?.toString(), actual, "postprocess case=${c["id"]}")
        }
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun contextualSkipMatchesSharedRegressionFixture() {
        val fixture = readJsonObject("testdata/skip/contextual_skip.json")
        val cases = fixture["cases"] as List<Map<String, Any?>>
        assertTrue(cases.isNotEmpty())
        for (c in cases) {
            val actual =
                ContextualSkip.shouldSkip(
                    prefix = c["prefix"].toString(),
                    suffix = c["suffix"].toString(),
                    languageId = c["language"].toString(),
                )
            assertEquals(c["expectedSkip"] as Boolean, actual, "skip case=${c["id"]}")
        }
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun ignoreRulesMatchesSharedRegressionFixture() {
        val fixture = readJsonObject("testdata/ignore/ignore_rules.json")
        val cases = fixture["cases"] as List<Map<String, Any?>>
        assertTrue(cases.isNotEmpty())
        for (c in cases) {
            val globs = (c["globs"] as List<*>).map { it.toString() }
            val gitignore = (c["gitignore"] as List<*>).map { it.toString() }
            val rules =
                IgnoreRules(
                    globs = globs,
                    respectGitignore = c["respectGitignore"] as Boolean,
                    gitignorePatterns = gitignore,
                )
            val actual =
                rules.isIgnored(
                    path = c["path"].toString(),
                    relativePath = c["relativePath"]?.toString(),
                )
            assertEquals(c["expectedIgnored"] as Boolean, actual, "ignore case=${c["id"]}")
        }
    }

    @Test
    @Suppress("UNCHECKED_CAST")
    fun urlAndTemplateResolutionMatchesSharedRegressionFixture() {
        val fixture = readJsonObject("testdata/http/url_resolution.json")

        val relativeCases = fixture["relativePathCases"] as List<Map<String, Any?>>
        assertTrue(relativeCases.isNotEmpty())
        for (c in relativeCases) {
            val baseUrl = c["baseUrl"].toString()
            val suffix = c["suffix"].toString()
            val actualRel = HttpCompletionClient.defaultOpenAiRelativePath(baseUrl, suffix)
            val actualJoined = HttpCompletionClient.joinUrl(baseUrl, actualRel)
            assertEquals(c["expectedRelativePath"].toString(), actualRel, "relativePath case=${c["id"]}")
            assertEquals(c["expectedJoinedUrl"].toString(), actualJoined, "joinedUrl case=${c["id"]}")
        }

        val templateCases = fixture["templateResolutionCases"] as List<Map<String, Any?>>
        assertTrue(templateCases.isNotEmpty())
        for (c in templateCases) {
            val actual =
                PromptTemplateDetector.detect(
                    model = c["model"].toString(),
                    baseUrl = c["baseUrl"].toString(),
                )
            assertEquals(PromptTemplate.valueOf(c["expectedTemplate"].toString()), actual, "template case=${c["id"]}")
        }
    }
}
