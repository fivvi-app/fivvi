package nl.trainerhub.api.apis

import nl.trainerhub.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import nl.trainerhub.api.models.HelloResponse
import nl.trainerhub.api.models.Locale
import nl.trainerhub.api.models.ValidationError

interface HelloApi {
    /**
     * GET v1/hello
     * Greeting for the walking skeleton
     * Without &#x60;locale&#x60;, the locale is the first supported language in the Accept-Language header, otherwise en.
     * Responses:
     *  - 200: The greeting key and the locale to render it in.
     *  - 400: Invalid query parameters.
     *
     * @param locale Catalog locale from packages/i18n: Dutch (nl-NL) or English (en). (optional)
     * @return [HelloResponse]
     */
    @GET("v1/hello")
    suspend fun getHello(@Query("locale") locale: Locale? = null): Response<HelloResponse>

}
