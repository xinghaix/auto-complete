package io.autocomplete.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import io.autocomplete.bridge.JbUiBridge
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import javax.swing.JPanel

@Suppress("unused")
object SettingsJcefHostImpl {
    private val log = Logger.getInstance(SettingsJcefHostImpl::class.java)

    @JvmStatic
    fun mount(
        panel: JPanel,
        parentDisposable: Disposable,
        initialTab: String,
    ): Disposable {
        if (!JBCefApp.isSupported()) {
            throw IllegalStateException("JBCefApp.isSupported() == false")
        }
        val session = Session(initialTab.ifBlank { AcUiEntry.TAB_SETTINGS })
        panel.replaceWithBrowser(session.component)
        return session
    }

    private class Session(
        initialTab: String,
    ) : Disposable,
        WebTabController {
        private val bridge = JbUiBridge()
        private val browser: JBCefBrowser = JBCefBrowser()
        private val jsQuery: JBCefJSQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        val component get() = browser.component

        init {
            jsQuery.addHandler { request ->
                try {
                    JBCefJSQuery.Response(bridge.handleJson(request))
                } catch (e: Exception) {
                    log.warn("bridge error", e)
                    JBCefJSQuery.Response(null, 0, e.message)
                }
            }

            val pushListener: (String) -> Unit = { json ->
                val escaped =
                    json
                        .replace("\\", "\\\\")
                        .replace("'", "\\'")
                        .replace("\n", "\\n")
                        .replace("\r", "")
                ApplicationManager.getApplication().invokeLater {
                    runCatching {
                        browser.cefBrowser.executeJavaScript(
                            "try{window.__autoCompleteReceive&&window.__autoCompleteReceive(JSON.parse('$escaped'));}catch(e){}",
                            browser.cefBrowser.url,
                            0,
                        )
                    }
                }
            }
            bridge.addPushListener(pushListener)
            Disposer.register(this) { bridge.removePushListener(pushListener) }

            val tabEsc = initialTab.replace("'", "")
            val cefQueryBootstrap =
                """
                window.cefQuery = function(req) {
                  var r = req || {};
                  ${jsQuery.inject("r.request", "r.onSuccess", "r.onFailure")}
                };
                window.__autoCompleteJcefReady = true;
                window.__acPreferredTab = '$tabEsc';
                window.__acOpenTab = function(tab) {
                  try {
                    window.dispatchEvent(new CustomEvent('ac-open-tab', { detail: { tab: tab } }));
                    if (window.__acSetTab) window.__acSetTab(tab);
                  } catch (e) {}
                };
                """.trimIndent()

            val page =
                SettingsUiAssets.preparePage(SettingsJcefHostImpl::class.java, cefQueryBootstrap)
                    ?: throw IllegalStateException("settings-ui bundle not found (index.html missing)")

            browser.jbCefClient.addLoadHandler(
                object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(
                        cefBrowser: CefBrowser?,
                        frame: CefFrame?,
                        httpStatusCode: Int,
                    ) {
                        if (frame?.isMain != true) return
                        log.info("settings-ui loadEnd status=$httpStatusCode url=${frame.url}")
                        browser.cefBrowser.executeJavaScript(cefQueryBootstrap, frame.url, 0)
                        val t = AcUiEntry.preferredTab.replace("'", "")
                        browser.cefBrowser.executeJavaScript(
                            "try{window.__acOpenTab && window.__acOpenTab('$t');}catch(e){}",
                            frame.url,
                            0,
                        )
                    }

                    override fun onLoadError(
                        cefBrowser: CefBrowser?,
                        frame: CefFrame?,
                        errorCode: org.cef.handler.CefLoadHandler.ErrorCode?,
                        errorText: String?,
                        failedUrl: String?,
                    ) {
                        log.warn("settings-ui loadError code=$errorCode text=$errorText url=$failedUrl")
                    }
                },
                browser.cefBrowser,
            )

            log.info("Loading settings-ui url=${page.url} tab=$initialTab")
            browser.loadURL(page.url)
        }

        override fun requestTab(tab: String) {
            val t = tab.replace("'", "")
            ApplicationManager.getApplication().invokeLater {
                runCatching {
                    browser.cefBrowser.executeJavaScript(
                        "try{window.__acOpenTab && window.__acOpenTab('$t');}catch(e){}",
                        browser.cefBrowser.url,
                        0,
                    )
                }
            }
        }

        override fun dispose() {
            bridge.dispose()
            runCatching { Disposer.dispose(jsQuery) }
            runCatching { Disposer.dispose(browser) }
        }
    }
}
