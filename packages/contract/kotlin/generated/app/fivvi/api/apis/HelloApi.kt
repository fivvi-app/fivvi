package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.HelloResponse
import app.fivvi.api.models.Locale
import app.fivvi.api.models.ValidationError

interface HelloApi {
    /**
     * GET v1/hello
     * Greeting for the walking skeleton
     * The &#x60;hello&#x60; greeting from the database. Without &#x60;locale&#x60;, the locale is the first supported language in the Accept-Language header, otherwise en.
     * Responses:
     *  - 200: The greeting key and the locale to render it in.
     *  - 400: Invalid query parameters.
     *  - 500: Unexpected server error, reported to error tracking. Contains no error details.
     *
     * @param locale Catalog locale from packages/i18n: Dutch (nl-NL) or English (en). (optional)
     * @return [HelloResponse]
     */
    @GET("v1/hello")
    suspend fun getHello(@Query("locale") locale: Locale? = null): Response<HelloResponse>

}
