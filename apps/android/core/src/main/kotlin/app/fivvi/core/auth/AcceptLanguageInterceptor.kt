package app.fivvi.core.auth

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Accept-Language: <the language shown>` to every request: the API words server text (a class name) in the account's
 * stored language, and for an account with none in this header, else English (ADR-017). OkHttp sends none by itself.
 * [language] is read for each request, so a switch applies at once; `null` sends no header.
 */
class AcceptLanguageInterceptor(private val language: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val tag = language() ?: return chain.proceed(chain.request())
        return chain.proceed(chain.request().newBuilder().header("Accept-Language", tag).build())
    }
}
