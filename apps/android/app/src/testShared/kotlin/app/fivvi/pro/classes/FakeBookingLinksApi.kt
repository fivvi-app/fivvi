package app.fivvi.pro.classes

import app.fivvi.api.apis.BookingLinksApi
import app.fivvi.api.models.BookingLink
import app.fivvi.api.models.BookingLinkDate
import app.fivvi.api.models.BookingLinks
import app.fivvi.api.models.CreateBookingLinkRequest
import app.fivvi.api.models.DeactivateBookingLinkRequest
import java.net.URI
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

private val JSON = "application/json".toMediaType()

/**
 * The generated client's own API interface for tests, for `POST …/booking-links` of one class date (F037): the first
 * request for a date makes its link (`201`), the next ones find the same link (`200`), as the API's get-or-create does
 * (the rules are the API's own and tested there). Every request is kept in [requests]; [failure] makes a call fail (no
 * connection), [status] makes it answer with that status.
 */
class FakeBookingLinksApi : BookingLinksApi {
    /** Every request: the workspace and what was asked. */
    val requests = mutableListOf<Pair<UUID, CreateBookingLinkRequest>>()

    /** The links made, by the class date they open. */
    val links = mutableMapOf<UUID, BookingLink>()

    /** While set, every call fails with it (a lost connection). */
    var failure: Exception? = null

    /** While set, every call answers with this status. */
    var status: Int? = null

    override suspend fun createBookingLink(
        workspaceId: UUID,
        createBookingLinkRequest: CreateBookingLinkRequest,
    ): Response<BookingLink> {
        requests += workspaceId to createBookingLinkRequest
        failure?.let { throw it }
        status?.let { return Response.error(it, "{}".toResponseBody(JSON)) }
        val sessionId = requireNotNull(createBookingLinkRequest.sessionId) { "a link of a class date names it" }
        links[sessionId]?.let { return Response.success(200, it) }
        val code = UUID.nameUUIDFromBytes("code:$sessionId".toByteArray()).toString().take(CODE_LENGTH)
        val made = BookingLink(
            UUID.randomUUID(),
            URI("https://fivvi.app/l/$code"),
            BookingLink.Scope.SESSION,
            BookingLink.Language.VISITOR,
            true,
            null,
            OffsetDateTime.of(2026, 11, 16, 8, 20, 0, 0, ZoneOffset.UTC),
            null,
            BookingLinkDate(
                sessionId,
                OffsetDateTime.of(2026, 11, 17, 17, 0, 0, 0, ZoneOffset.UTC),
                "Europe/Amsterdam",
                null,
            ),
        )
        links[sessionId] = made
        return Response.success(201, made)
    }

    override suspend fun deactivateBookingLink(
        workspaceId: UUID,
        linkId: UUID,
        deactivateBookingLinkRequest: DeactivateBookingLinkRequest?,
    ): Response<BookingLink> = error("FakeBookingLinksApi.deactivateBookingLink is not expected in this test")

    override suspend fun listBookingLinks(workspaceId: UUID): Response<BookingLinks> =
        error("FakeBookingLinksApi.listBookingLinks is not expected in this test")

    private companion object {
        const val CODE_LENGTH = 8
    }
}
