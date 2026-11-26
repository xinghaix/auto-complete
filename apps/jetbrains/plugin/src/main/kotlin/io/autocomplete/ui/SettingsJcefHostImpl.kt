package io.autocomplete.ui

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import io.autocomplete.bridge.JbUiBridge
import io.autocomplete.util.Json
import io.autocomplete.util.SecretRedactor
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.browser.CefMessageRouter
import org.cef.callback.CefQueryCallback
import org.cef.handler.CefLoadHandler
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefMessageRouterHandlerAdapter
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.swing.JPanel

@Suppress("unused")
object SettingsJcefHostImpl {
    private val log = Logger.getInstance(SettingsJcefHostImpl::class.java)

    @JvmStatic
    fun mount(
        panel: JPanel,
        parentDisposable: Disposable,
        project: Project?,
        initialTab: String,
    ): Disposable {
        if (!JBCefApp.isSupported()) {
            throw IllegalStateException("JBCefApp.isSupported() == false")
        }
        val session = Session(project, initialTab.ifBlank { AcUiEntry.TAB_CONFIG })
        panel.replaceWithBrowser(session.component)
        return session
    }

    private class Session(
        project: Project?,
        private val initialTab: String,
    ) : Disposable,
        WebTabController {
        private val bridge = JbUiBridge(project)
        private val browser: JBCefBrowser = JBCefBrowser()
        private val disposed = AtomicBoolean(false)
        private val loaded = AtomicBoolean(false)
        private val pendingTab = AtomicReference<String?>(null)
        private val bridgeExecutor =
            Executors.newCachedThreadPool { r ->
                Thread(r, "auto-complete-jcef-bridge").apply { isDaemon = true }
            }

        private val routerConfig =
            CefMessageRouter.CefMessageRouterConfig("acCefQuery", "acCefQueryCancel")
        private val messageRouter: CefMessageRouter = CefMessageRouter.create(routerConfig)
        private val routerHandler =
            object : CefMessageRouterHandlerAdapter() {
                override fun onQuery(
                    cefBrowser: CefBrowser?,
                    frame: CefFrame?,
                    queryId: Long,
                    request: String?,
                    persistent: Boolean,
                    callback: CefQueryCallback?,
                ): Boolean {
                    if (callback == null) return false
                    if (isSessionDisposed()) {
                        runCatching { callback.failure(0, "bridge disposed") }
                        return true
                    }
                    val req = request.orEmpty()
                    // Non-blocking async dispatch: release CEF/OOP IPC thread immediately
                    // so 15-90s HTTP probes never stall cef_server or UI events.
                    bridgeExecutor.execute {
                        if (isSessionDisposed()) {
                            runCatching { callback.failure(0, "bridge disposed") }
                            return@execute
                        }
                        try {
                            val response = bridge.handleJson(req)
                            if (!isSessionDisposed()) {
                                callback.success(response)
                            }
                        } catch (e: Exception) {
                            log.warn("async bridge error", e)
                            if (!isSessionDisposed()) {
                                callback.failure(0, SecretRedactor.redactText(e.message ?: e.javaClass.simpleName))
                            }
                        }
                    }
                    return true
                }
            }

        private val page: SettingsUiAssets.PreparedPage
        val component get() = browser.component

        init {
            messageRouter.addHandler(routerHandler, true)
            browser.jbCefClient.cefClient.addMessageRouter(messageRouter)

            val pushListener: (String) -> Unit = { json ->
                executeJs("try{window.__autoCompleteReceive&&window.__autoCompleteReceive(JSON.parse(${jsStringLiteral(json)}));}catch(e){}")
            }
            bridge.addPushListener(pushListener)
            Disposer.register(this) { bridge.removePushListener(pushListener) }

            // Push live theme changes whenever the IDE Look & Feel switches light <-> dark.
            ApplicationManager.getApplication().messageBus.connect(this).subscribe(
                LafManagerListener.TOPIC,
                LafManagerListener {
                    if (!isSessionDisposed()) {
                        bridge.pushThemeChanged(JbUiBridge.ideTheme())
                    }
                },
            )

            val tabLiteral = jsStringLiteral(initialTab)
            val cefQueryBootstrap =
                """
                window.cefQuery = function(req) {
                  var r = req || {};
                  if (typeof window.acCefQuery === 'function') {
                    return window.acCefQuery({
                      request: r.request || '',
                      onSuccess: r.onSuccess || function() {},
                      onFailure: r.onFailure || function() {}
                    });
                  }
                  if (typeof r.onFailure === 'function') {
                    r.onFailure(0, 'JCEF message router unavailable');
                  }
                };
                window.__autoCompleteJcefReady = true;
                window.__acPreferredTab = $tabLiteral;
                """.trimIndent()

            page =
                SettingsUiAssets.preparePage(
                    loader = SettingsJcefHostImpl::class.java,
                    cefQueryBootstrap = cefQueryBootstrap,
                    initialTheme = JbUiBridge.ideTheme(),
                ) ?: throw IllegalStateException("settings-ui bundle not found (index.html missing)")

            browser.jbCefClient.addLoadHandler(
                object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(
                        cefBrowser: CefBrowser?,
                        frame: CefFrame?,
                        httpStatusCode: Int,
                    ) {
                        if (frame?.isMain != true) return
                        if (isSessionDisposed()) return
                        loaded.set(true)
                        log.info("settings-ui loadEnd status=$httpStatusCode url=${frame.url}")
                        // Do NOT re-send initialTab (already injected in <head> as __acPreferredTab).
                        // Only dispatch if a different tab was requested while the page was loading.
                        val queued = pendingTab.getAndSet(null)
                        if (queued != null && queued != initialTab) {
                            bridge.pushOpenTab(queued)
                        }
                    }

                    override fun onLoadError(
                        cefBrowser: CefBrowser?,
                        frame: CefFrame?,
                        errorCode: CefLoadHandler.ErrorCode?,
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
            val normalized = AcUiEntry.normalizeTab(tab)
            if (loaded.get()) {
                // Single dispatch mechanism via UiBridge push `openTab` (avoids double/triple openTab).
                bridge.pushOpenTab(normalized)
            } else {
                pendingTab.set(normalized)
            }
        }

        private fun isSessionDisposed(): Boolean = disposed.get() || browser.isDisposed

        private fun executeJs(script: String) {
            if (isSessionDisposed()) return
            ApplicationManager.getApplication().invokeLater({
                if (isSessionDisposed()) return@invokeLater
                runCatching {
                    browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
                }
            }, ModalityState.any())
        }

        override fun dispose() {
            if (!disposed.compareAndSet(false, true)) return
            runCatching { messageRouter.removeHandler(routerHandler) }
            runCatching { browser.jbCefClient.cefClient.removeMessageRouter(messageRouter) }
            runCatching { messageRouter.dispose() }
            bridgeExecutor.shutdownNow()
            bridge.dispose()
            runCatching { Disposer.dispose(browser) }
            if (page.isTemp) {
                runCatching { page.dir.deleteRecursively() }
            }
        }

        private fun jsStringLiteral(value: String): String =
            "\"${Json.escape(value).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")}\""
    }
}
