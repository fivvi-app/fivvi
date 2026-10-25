package app.fivvi.pro.auth

import okhttp3.Interceptor
import okhttp3.Response

/**
 * The auth layer on the generated client's OkHttp client: adds `Authorization: Bearer <token>` to every request while
 * there is a token, and turns a 401 to such a request into "signed out" (AC9, [Session.expire]). A 401 to a request
 * without a token (a refused sign-in code) is not a sign-out. Nothing here logs.
 */
class AuthInterceptor(private val session: Session) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = session.token() ?: return chain.proceed(chain.request())
        val response = chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
        if (response.code == UNAUTHORIZED) session.expire(token)
        return response
    }

    private companion object {
        const val UNAUTHORIZED = 401
    }
}
