package io.autocomplete.ui

import com.intellij.openapi.diagnostic.Logger
import java.io.File
import java.nio.file.Files

/** Extract packaged settings-ui and prepare a JCEF-friendly index page. */
internal object SettingsUiAssets {
    private val log = Logger.getInstance(SettingsUiAssets::class.java)

    data class PreparedPage(
        /** file:// URL to open in the browser */
        val url: String,
        val dir: File,
    )

    /**
     * Extract settings-ui, rewrite index to classic scripts + optional bridge bootstrap,
     * return a file:// URL suitable for [com.intellij.ui.jcef.JBCefBrowser.loadURL].
     */
    fun preparePage(
        loader: Class<*>,
        cefQueryBootstrap: String,
    ): PreparedPage? {
        val dir = extractDir(loader) ?: return null
        val js =
            File(dir, "assets").listFiles()?.filter { it.isFile && it.extension.equals("js", true) }
                ?.sortedBy { if (it.name == "index.js") 0 else 1 }
                .orEmpty()
        val css =
            File(dir, "assets").listFiles()?.filter { it.isFile && it.extension.equals("css", true) }
                .orEmpty()
        if (js.isEmpty()) {
            log.warn("No JS under ${dir}/assets — UI will be blank")
        }
        val cssLinks =
            css.joinToString("\n") { """  <link rel="stylesheet" href="./assets/${it.name}">""" }
        val jsScripts =
            js.joinToString("\n") { """  <script src="./assets/${it.name}"></script>""" }

        // Escape </script> in bootstrap so HTML parser does not break out early.
        val safeBootstrap = cefQueryBootstrap.replace("</script>", "<\\/script>", ignoreCase = true)

        val html =
            """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Auto Complete</title>
              <script>
            $safeBootstrap
              </script>
            $cssLinks
            </head>
            <body style="margin:0;background:#1e1e1e;color:#ddd;font-family:system-ui,sans-serif">
              <div id="root"><p style="padding:16px;opacity:.7">Loading…</p></div>
            $jsScripts
              <script>
                // Visible failure if React never mounts (helps blank-page diagnosis)
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
        index.writeText(html)
        index.deleteOnExit()
        val url = index.toURI().toString()
        log.info("Prepared settings-ui page url=$url js=${js.map { it.name }} css=${css.map { it.name }}")
        return PreparedPage(url, dir)
    }

    private fun extractDir(loader: Class<*>): File? {
        val indexStream = loader.getResourceAsStream("/settings-ui/index.html")
        if (indexStream == null) {
            return devDir()
        }
        return try {
            val dir = Files.createTempDirectory("auto-complete-settings-ui").toFile()
            dir.deleteOnExit()
            // Always write original index for debugging
            File(dir, "index.html").writeText(indexStream.bufferedReader().readText())
            val assetsOut = File(dir, "assets")
            assetsOut.mkdirs()
            // Copy all known patterns from jar by listing via ClassLoader is hard;
            // read packaged index for asset names, also try index.js / style.css defaults.
            val original = File(dir, "index.html").readText()
            val names = mutableSetOf<String>()
            Regex("""assets/([^"']+)""").findAll(original).forEach { names += it.groupValues[1] }
            names += listOf("index.js", "style.css")
            for (name in names) {
                val stream = loader.getResourceAsStream("/settings-ui/assets/$name") ?: continue
                val out = File(assetsOut, name)
                out.outputStream().use { stream.copyTo(it) }
                out.deleteOnExit()
            }
            dir
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
