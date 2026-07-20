package io.autocomplete.net

import com.intellij.util.net.JdkProxyProvider
import com.intellij.util.net.ssl.CertificateManager
import java.net.http.HttpClient
import java.time.Duration

/**
 * Builds [HttpClient] instances that honor IDE HTTP Proxy + trust store settings
 * (Settings → Appearance & Behavior → System Settings → HTTP Proxy).
 *
 * Raw JDK clients ignore IDE proxy, which is why third-party plugins often fail to
 * reach the same endpoints that built-in AI features can access.
 */
object IdeHttpSupport {
    /**
     * @param connectTimeoutMs TCP connect timeout (not the full request timeout).
     */
    fun createClient(connectTimeoutMs: Long = 10_000L): HttpClient {
        val builder =
            HttpClient.newBuilder()
                // Honor the caller's timeout (e.g. settings 3s). Floor is 500ms, not 5s.
                .connectTimeout(Duration.ofMillis(connectTimeoutMs.coerceIn(500L, 60_000L)))
                .followRedirects(HttpClient.Redirect.NORMAL)

        runCatching {
            builder.sslContext(CertificateManager.getInstance().sslContext)
        }

        runCatching {
            val provider = JdkProxyProvider.getInstance()
            builder.proxy(provider.proxySelector)
            builder.authenticator(provider.authenticator)
        }

        return builder.build()
    }

    fun describeProxyForLog(): String =
        runCatching {
            val provider = JdkProxyProvider.getInstance()
            "ide-proxy selector=${provider.proxySelector.javaClass.simpleName}"
        }.getOrDefault("ide-proxy unavailable")
}
