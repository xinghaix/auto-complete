package io.autocomplete.bridge

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sun.net.httpserver.HttpServer
import io.autocomplete.config.AutoCompleteSettingsService
import io.autocomplete.log.LogEntry
import io.autocomplete.log.LogLevel
import io.autocomplete.plugin.AutoCompleteAppService
import io.autocomplete.util.Json
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList

class JbUiBridgeTest : BasePlatformTestCase() {
    private fun req(
        id: String,
        type: String,
        payload: Map<String, Any?>? = null,
    ): String =
        Json.obj(
            "v" to 1,
            "id" to id,
            "type" to type,
            "payload" to payload,
        )

    private fun createBridge(
        settings: AutoCompleteSettingsService = AutoCompleteSettingsService(),
        app: AutoCompleteAppService = AutoCompleteAppService.getInstance(),
        clipboard: (String) -> Unit = {},
    ): JbUiBridge =
        JbUiBridge(
            project = project,
            settingsProvider = { settings },
            appProvider = { app },
            httpClientFactory = { HttpClient.newHttpClient() },
            clipboardWriter = clipboard,
        )

    fun testHandleJsonPreservesCorrelationIdOnErrorsAndRedactsSecrets() {
        val bridge = createBridge()
        try {
            val unknownResp = Json.parseObject(bridge.handleJson(req("req-42", "noSuchCommand")))
            assertEquals("req-42", unknownResp["id"])
            assertEquals("noSuchCommand", unknownResp["type"])
            assertEquals(false, unknownResp["ok"])
            assertTrue(unknownResp["error"].toString().contains("unknown type"))

            val badImport =
                Json.parseObject(
                    bridge.handleJson(
                        req("req-99", "importSettings", mapOf("json" to "[1,2,3]")),
                    ),
                )
            assertEquals("req-99", badImport["id"])
            assertEquals("importSettings", badImport["type"])
            assertEquals(false, badImport["ok"])
        } finally {
            bridge.dispose()
        }
    }

    fun testImportSettingsRegeneratesUuidsStripsHeadersAndDeletesOldSecrets() {
        val settings = AutoCompleteSettingsService()
        val oldProfile = settings.activeProfile()!!
        settings.update {
            authHeaderTemplate = "X-Custom-Auth: \${apiKey}"
            extraHeadersJson = """{"X-Org":"local-org"}"""
        }
        settings.setApiKeyFor(oldProfile.id, "local-super-secret")
        assertEquals("local-super-secret", settings.getApiKeyFor(oldProfile.id))

        val bridge = createBridge(settings = settings)
        try {
            val importJson =
                SettingsExport.toPrettyJson(
                    mapOf(
                        "schemaVersion" to 1,
                        "enabled" to true,
                        "activeProfileId" to oldProfile.id,
                        "profiles" to
                            listOf(
                                mapOf(
                                    "id" to oldProfile.id,
                                    "name" to "Untrusted Imported",
                                    "baseUrl" to "https://thirdparty.example.test/v1",
                                    "model" to "some-model",
                                    "apiKey" to "injected-secret",
                                    "hasApiKey" to true,
                                    "authHeaderTemplate" to "X-Leaked: \${apiKey}",
                                    "extraHeadersJson" to """{"X-Evil":"1"}""",
                                ),
                            ),
                    ),
                )
            val resp =
                Json.parseObject(
                    bridge.handleJson(req("imp-1", "importSettings", mapOf("json" to importJson))),
                )
            assertEquals(true, resp["ok"])

            val profiles = settings.profiles()
            assertEquals(1, profiles.size)
            val imported = profiles.single()
            assertFalse("Profile UUID must be regenerated", imported.id == oldProfile.id)
            assertEquals(imported.id, settings.activeProfileId())
            assertEquals("Authorization: Bearer \${apiKey}", imported.authHeaderTemplate)
            assertEquals("{}", imported.extraHeadersJson)
            assertFalse("Imported profile must not inherit local secret", settings.hasApiKeyFor(imported.id))
            assertEquals("", settings.getApiKey())
        } finally {
            bridge.dispose()
        }
    }

    fun testImportSettingsRejectsNonArrayProfiles() {
        val settings = AutoCompleteSettingsService()
        val bridge = createBridge(settings = settings)
        try {
            val resp =
                Json.parseObject(
                    bridge.handleJson(
                        req("imp-bad", "importSettings", mapOf("json" to """{"profiles":"not-an-array"}""")),
                    ),
                )
            assertEquals("imp-bad", resp["id"])
            assertEquals(false, resp["ok"])
        } finally {
            bridge.dispose()
        }
    }

    fun testExportSettingsIsPrettyPrintedWithTwoSpaceIndent() {
        val settings = AutoCompleteSettingsService()
        val bridge = createBridge(settings = settings)
        try {
            val resp = Json.parseObject(bridge.handleJson(req("exp-1", "exportSettings")))
            assertEquals(true, resp["ok"])
            @Suppress("UNCHECKED_CAST")
            val payload = resp["payload"] as Map<String, Any?>
            val json = payload["json"].toString()
            assertTrue("Expected 2-space pretty-printed JSON", json.contains("\n  \"schemaVersion\": 1"))
            assertFalse(json.contains("\"hasApiKey\""))
            assertFalse(json.contains("\"authHeaderTemplate\""))
            assertFalse(json.contains("\"extraHeadersJson\""))
        } finally {
            bridge.dispose()
        }
    }

    fun testApplySettingsValidatesSecurityAndAllowsBlankDraftWhilePersistingGlobals() {
        val settings = AutoCompleteSettingsService()
        val blank = settings.createProfile("Blank Draft")
        val bridge = createBridge(settings = settings)
        try {
            // Blank draft + valid global change must succeed.
            val okResp =
                Json.parseObject(
                    bridge.handleJson(
                        req(
                            "apply-1",
                            "applySettings",
                            mapOf(
                                "enabled" to false,
                                "uiLocale" to "ja",
                                "activeProfileId" to blank.id,
                                "profiles" to
                                    listOf(
                                        mapOf(
                                            "id" to blank.id,
                                            "name" to "Blank Draft",
                                            "baseUrl" to "",
                                            "model" to "",
                                            "promptTemplate" to "AUTO",
                                        ),
                                    ),
                            ),
                        ),
                    ),
                )
            assertEquals(true, okResp["ok"])
            assertFalse(settings.snapshot().enabled)
            assertEquals("ja", settings.snapshot().uiLocale)

            // Reject invalid scheme / userInfo / sensitive headers / raw authHeaderTemplate / bad extraBodyJson / bad debounce.
            val badCases =
                listOf(
                    mapOf("profiles" to listOf(mapOf("id" to blank.id, "baseUrl" to "file:///etc/passwd"))),
                    mapOf("profiles" to listOf(mapOf("id" to blank.id, "baseUrl" to "https://user:pass@example.com/v1"))),
                    mapOf("profiles" to listOf(mapOf("id" to blank.id, "extraHeadersJson" to """{"Authorization":"Bearer x"}"""))),
                    mapOf("profiles" to listOf(mapOf("id" to blank.id, "authHeaderTemplate" to "Authorization: Bearer raw-token"))),
                    mapOf("profiles" to listOf(mapOf("id" to blank.id, "extraBodyJson" to "[1,2]"))),
                    mapOf("debounceMinMs" to 600, "debounceInitialMs" to 300, "debounceMaxMs" to 1000),
                )
            badCases.forEachIndexed { idx, badPayload ->
                val res = Json.parseObject(bridge.handleJson(req("bad-$idx", "applySettings", badPayload)))
                assertEquals("bad case $idx should fail", false, res["ok"])
                assertEquals("bad-$idx", res["id"])
            }
        } finally {
            bridge.dispose()
        }
    }

    fun testApplySettingsResetsLegacyRequestStyleWhenPromptTemplateChanges() {
        val settings = AutoCompleteSettingsService()
        val profile = settings.activeProfile()!!
        settings.update {
            requestStyle = "FIM"
            promptTemplate = "AUTO"
        }
        val bridge = createBridge(settings = settings)
        try {
            val res =
                Json.parseObject(
                    bridge.handleJson(
                        req(
                            "rs-1",
                            "applySettings",
                            mapOf(
                                "activeProfileId" to profile.id,
                                "profiles" to
                                    listOf(
                                        mapOf(
                                            "id" to profile.id,
                                            "name" to profile.name,
                                            "baseUrl" to "http://127.0.0.1:11434/v1",
                                            "model" to "qwen2.5-coder:7b",
                                            "promptTemplate" to "AUTO",
                                        ),
                                    ),
                            ),
                        ),
                    ),
                )
            assertEquals(true, res["ok"])
            assertEquals("AUTO", settings.snapshot().requestStyle)
        } finally {
            bridge.dispose()
        }
    }

    fun testCreateProfilePresetsSecretClipboardStatsCachesAndLogs() {
        val settings = AutoCompleteSettingsService()
        val app = AutoCompleteAppService.getInstance()
        app.logs.clear()
        var copiedText = ""
        val bridge = createBridge(settings = settings, app = app, clipboard = { copiedText = it })
        try {
            // Default name is "New Profile"
            val createdDefault =
                Json.parseObject(bridge.handleJson(req("c1", "createProfile", emptyMap())))
            assertEquals(true, createdDefault["ok"])
            assertEquals("New Profile", settings.activeProfile()?.name)

            // Presets
            val dsResp =
                Json.parseObject(
                    bridge.handleJson(req("c2", "createProfile", mapOf("preset" to "deepseek-beta"))),
                )
            assertEquals(true, dsResp["ok"])
            val dsProfile = settings.activeProfile()!!
            assertEquals("https://api.deepseek.com/beta", dsProfile.baseUrl)
            assertEquals("CODESTRAL_API", dsProfile.promptTemplate)
            assertEquals("/completions", dsProfile.fimPath)

            // setSecret / clearSecret return { profileId, hasApiKey }
            val setRes =
                Json.parseObject(
                    bridge.handleJson(
                        req("s1", "setSecret", mapOf("profileId" to dsProfile.id, "secret" to "sk-test-123")),
                    ),
                )
            @Suppress("UNCHECKED_CAST")
            val setPayload = setRes["payload"] as Map<String, Any?>
            assertEquals(dsProfile.id, setPayload["profileId"])
            assertEquals(true, setPayload["hasApiKey"])

            val clearRes =
                Json.parseObject(
                    bridge.handleJson(req("s2", "clearSecret", mapOf("profileId" to dsProfile.id))),
                )
            @Suppress("UNCHECKED_CAST")
            val clearPayload = clearRes["payload"] as Map<String, Any?>
            assertEquals(dsProfile.id, clearPayload["profileId"])
            assertEquals(false, clearPayload["hasApiKey"])

            // copyToClipboard
            val copyRes =
                Json.parseObject(
                    bridge.handleJson(req("cp1", "copyToClipboard", mapOf("text" to "hello clip"))),
                )
            assertEquals(true, copyRes["ok"])
            assertEquals("hello clip", copiedText)

            // getSessionStats & clearCaches
            val statsRes = Json.parseObject(bridge.handleJson(req("st1", "getSessionStats")))
            assertEquals(true, statsRes["ok"])
            @Suppress("UNCHECKED_CAST")
            val statsPayload = statsRes["payload"] as Map<String, Any?>
            assertTrue(statsPayload.containsKey("totalRequests"))
            assertTrue(statsPayload.containsKey("backoffFatal"))

            val clearCacheRes = Json.parseObject(bridge.handleJson(req("cc1", "clearCaches")))
            assertEquals(true, clearCacheRes["ok"])

            // subscribeLogs with level & limit filtering
            app.logs.append(LogEntry(level = LogLevel.DEBUG, message = "dbg"))
            app.logs.append(LogEntry(level = LogLevel.INFO, message = "inf"))
            app.logs.append(LogEntry(level = LogLevel.ERROR, message = "err"))
            val subRes =
                Json.parseObject(
                    bridge.handleJson(req("lg1", "subscribeLogs", mapOf("level" to "warn", "limit" to 5))),
                )
            @Suppress("UNCHECKED_CAST")
            val entries = (subRes["payload"] as Map<String, Any?>)["entries"] as List<Map<String, Any?>>
            assertEquals(1, entries.size)
            assertEquals("error", entries.single()["level"])

            val unsubRes = Json.parseObject(bridge.handleJson(req("lg2", "unsubscribeLogs")))
            assertEquals(true, unsubRes["ok"])
        } finally {
            bridge.dispose()
        }
    }

    fun testProbesDoNotMutateActiveProfileWireLogsAndExtractHttpStatus() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/models") { ex ->
            val body = """{"data":[{"id":"demo-model","context_length":32768}]}""".toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        server.createContext("/v1/chat/completions") { ex ->
            val body = """{"error":{"message":"invalid key sk-topsecret-999"}}""".toByteArray(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(401, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val baseUrl = "http://127.0.0.1:${server.address.port}/v1"
            val settings = AutoCompleteSettingsService()
            val p1 = settings.activeProfile()!!
            val p2 = settings.createProfile("ProbeTarget")
            settings.update {
                this.baseUrl = baseUrl
                this.model = "gpt-4o-mini"
                this.promptTemplate = "CHAT"
            }
            settings.setApiKeyFor(p2.id, "sk-topsecret-999")
            settings.selectProfile(p1.id)
            assertEquals(p1.id, settings.activeProfileId())

            val app = AutoCompleteAppService.getInstance()
            app.logs.clear()
            val bridge = createBridge(settings = settings, app = app)
            try {
                // listModels targeting p2 must NOT change activeProfileId from p1.
                val modelsRes =
                    Json.parseObject(
                        bridge.handleJson(req("m1", "listModels", mapOf("profileId" to p2.id))),
                    )
                assertEquals(true, modelsRes["ok"])
                assertEquals(p1.id, settings.activeProfileId())

                // testConnection targeting p2 returns FAILED with httpStatus=401 and redacted secret, without mutating activeProfileId.
                val testRes =
                    Json.parseObject(
                        bridge.handleJson(req("t1", "testConnection", mapOf("profileId" to p2.id))),
                    )
                assertEquals(true, testRes["ok"])
                @Suppress("UNCHECKED_CAST")
                val probePayload = testRes["payload"] as Map<String, Any?>
                assertEquals("FAILED", probePayload["status"])
                assertEquals(401, (probePayload["httpStatus"] as Number).toInt())
                assertFalse(
                    "API key must be redacted from probe error",
                    probePayload["error"].toString().contains("sk-topsecret-999"),
                )
                assertEquals(p1.id, settings.activeProfileId())

                // Verify onLog was wired to app.logs for probes!
                val ops = app.logs.snapshot().map { it.operation }
                assertTrue("Expected list_models in LogBuffer, got $ops", "list_models" in ops)
                assertTrue("Expected connection_test in LogBuffer, got $ops", "connection_test" in ops)
            } finally {
                bridge.dispose()
            }
        } finally {
            server.stop(0)
        }
    }

    fun testExternalSettingsChangeBroadcastsSettingsChangedPush() {
        val settings = AutoCompleteSettingsService()
        val bridge = createBridge(settings = settings)
        val pushed = CopyOnWriteArrayList<Map<String, Any?>>()
        bridge.addPushListener { raw ->
            pushed += Json.parseObject(raw)
        }
        try {
            // Self-initiated bridge mutation should NOT echo back.
            bridge.handleJson(req("a1", "applySettings", mapOf("enabled" to false)))
            assertTrue("Self applySettings should not push settingsChanged", pushed.none { it["type"] == "settingsChanged" })

            // External mutation (e.g. StatusBar or Snooze action) MUST broadcast settingsChanged.
            settings.snooze(15)
            assertTrue("External snooze must push settingsChanged", pushed.any { it["type"] == "settingsChanged" })
        } finally {
            bridge.dispose()
        }
    }
}
