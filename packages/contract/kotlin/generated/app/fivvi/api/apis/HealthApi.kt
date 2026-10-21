package app.fivvi.api.apis

import app.fivvi.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.fivvi.api.models.HealthResponse

interface HealthApi {
    /**
     * GET v1/health
     * Health check
     * Pings the database. Railway uses it as the deploy health check, so a deployment that can&#39;t reach Postgres never receives traffic.
     * Responses:
     *  - 200: The API and all its dependencies are healthy.
     *  - 503: A dependency is unavailable.
     *
     * @return [HealthResponse]
     */
    @GET("v1/health")
    suspend fun getHealth(): Response<HealthResponse>

}
