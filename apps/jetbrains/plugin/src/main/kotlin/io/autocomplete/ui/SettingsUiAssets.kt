package io.autocomplete.ui

import com.intellij.openapi.diagnostic.Logger
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files

/** Extract packaged settings-ui and prepare a JCEF-friendly index page. */
internal object SettingsUiAssets {
    private val log = Logger.getInstance(SettingsUiAssets::class.java)

    private const val CSP_CONTENT =
        "default-src 'self' file:; img-src 'self' file: data:; style-src 'self' file: 'unsafe-inline'; " +
            "script-src 'self' file: 'unsafe-inline'; connect-src 'none';"

    data class PreparedPage(
        /** file:// URL to open in the browser */
        val url: String,
        val dir: File,
        /** True when [dir] was created as a temp extraction directory and should be deleted on dispose. */
        val isTemp: Boolean,
    )

    /**
     * Extract settings-ui, rewrite index to classic scripts + CSP + optional bridge bootstrap,
     * return a file:// URL suitable for [com.intellij.ui.jcef.JBCefBrowser.loadURL].
     */
    fun preparePage(
        loader: Class<*>,
        cefQueryBootstrap: String,
        initialTheme: String = "dark",
    ): PreparedPage? {
        val extracted = extractDir(loader) ?: return null
        val dir = extracted.first
        val isTemp = extracted.second
        val js =
            File(dir, "assets").listFiles()?.filter { it.isFile && it.extension.equals("js", true) }
                ?.sortedBy { if (it.name == "index.js") 0 else 1 }
                .orEmpty()
        val css =
            File(dir, "assets").listFiles()?.filter { it.isFile && it.extension.equals("css", true) }
                .orEmpty()
        if (js.isEmpty()) {
            log.warn("No JS under $dir/assets — UI will be blank")
        }
        val cssLinks =
            css.joinToString("\n") { """  <link rel="stylesheet" href="./assets/${it.name}">""" }
        val jsScripts =
            js.joinToString("\n") { """  <script src="./assets/${it.name}"></script>""" }

        // Escape </script> in bootstrap so HTML parser does not break out early.
        val safeBootstrap = cefQueryBootstrap.replace("</script>", "<\\/script>", ignoreCase = true)
        val safeTheme = if (initialTheme == "light") "light" else "dark"

        val html =
            """
            <!DOCTYPE html>
            <html lang="en" data-theme="$safeTheme">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <meta http-equiv="Content-Security-Policy" content="$CSP_CONTENT" />
              <title>Auto Complete</title>
              <style>
                html, body { margin: 0; }
                html[data-theme="light"] body { background: #ffffff; color: #1f2328; }
                html[data-theme="dark"] body { background: #1e1e1e; color: #dddddd; }
              </style>
              <script>
            $safeBootstrap
              </script>
            $cssLinks
            </head>
            <body>
              <div id="root"><p style="padding:16px;opacity:.7">Loading…</p></div>
            $jsScripts
              <script>
                // Visible failure if Vue never mounts (helps blank-page diagnosis)
                setTimeout(function() {
                  var r = document.getElementById('root');
                  if (r && r.children.length === 1 && r.textContent.indexOf('Loading') >= 0) {
                    r.innerHTML = '<p style="padding:16px;color:#f85149">settings-ui failed to start. ' +
                      'Check idea.log for Auto Complete / JCEF errors.</p>';
                  }
                }, 3000);
              </script>
            </body>
            </html>
            """.trimIndent()

        val index = File(dir, "index.jcef.html")
        index.writeText(html, StandardCharsets.UTF_8)
        if (isTemp) index.deleteOnExit()
        val url = index.toURI().toString()
        log.info("Prepared settings-ui page url=$url js=${js.map { it.name }} css=${css.map { it.name }}")
        return PreparedPage(url = url, dir = dir, isTemp = isTemp)
    }

    private fun extractDir(loader: Class<*>): Pair<File, Boolean>? {
        val indexStream = loader.getResourceAsStream("/settings-ui/index.html")
        if (indexStream == null) {
            return devDir()?.let { it to false }
        }
        return try {
            val dir = Files.createTempDirectory("auto-complete-settings-ui").toFile()
            dir.deleteOnExit()
            // Always close streams cleanly via .use {}
            val original =
                indexStream.use { stream ->
                    stream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                }
            val originalIndexFile = File(dir, "index.html")
            originalIndexFile.writeText(original, StandardCharsets.UTF_8)
            originalIndexFile.deleteOnExit()

            val assetsOut = File(dir, "assets")
            assetsOut.mkdirs()
            val names = mutableSetOf<String>()
            Regex("""assets/([^"']+)""").findAll(original).forEach { names += it.groupValues[1] }
            names += listOf("index.js", "style.css")
            for (name in names) {
                val stream = loader.getResourceAsStream("/settings-ui/assets/$name") ?: continue
                stream.use { input ->
                    val out = File(assetsOut, name)
                    out.outputStream().use { output -> input.copyTo(output) }
                    out.deleteOnExit()
                }
            }
            dir to true
        } catch (e: Exception) {
            log.warn("Failed to extract settings-ui", e)
            null
        }
    }

    private fun devDir(): File? {
        val candidates =
            listOf(
                File(System.getProperty("user.dir"), "packages/settings/ui/dist"),
                File(System.getProperty("user.dir"), "../packages/settings/ui/dist"),
            )
        return candidates.firstOrNull { File(it, "index.html").isFile && File(it, "assets").isDirectory }
    }
}
