package nl.trainerhub.app.observability

import io.sentry.Breadcrumb
import io.sentry.SentryEvent
import io.sentry.protocol.Contexts
import io.sentry.protocol.Mechanism
import io.sentry.protocol.Message
import io.sentry.protocol.Request
import io.sentry.protocol.Response
import io.sentry.protocol.SentryException
import io.sentry.protocol.SentryStackFrame
import io.sentry.protocol.SentryStackTrace
import io.sentry.protocol.User

// The scrubber (ADR-013, OBSERVABILITY.md §2): a pure allowlist applied to every event and breadcrumb in `beforeSend`
// and `beforeBreadcrumb`, before anything leaves the app. The same rules as `scrub.ts` in packages/observability:
// whatever isn't copied here is dropped, so a new SDK field never leaks by default.

/** Request headers worth keeping for debugging. Never cookies, auth or forwarding (IP) headers. */
private val REQUEST_HEADERS = setOf("accept", "accept-language", "content-length", "content-type")

/** Contexts the SDK fills with facts about the app and the device, never about people. */
private val CONTEXTS = setOf("app", "cloud_resource", "culture", "device", "os", "runtime", "trace")

/** Breadcrumb data of HTTP requests; the URL loses its query string. */
private val BREADCRUMB_DATA = setOf("method", "status_code", "url")

/** The workspace UUID in the user's data (`organization_id` in code). */
private const val ORGANIZATION_ID = "organization_id"

private val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

// Also catches URL-encoded addresses (`%40`) in paths.
private val EMAIL =
    Regex("""[^\s@/?#&=:;,<>()"'\[\]]+(?:@|%40)[^\s@/?#&=:;,<>()"'\[\]]+\.[a-z]{2,}""", RegexOption.IGNORE_CASE)

/** Replaces every email address in `text`; the rest of the message stays readable. */
private fun maskEmails(text: String): String = text.replace(EMAIL, "[email]")

internal fun scrubEvent(event: SentryEvent): SentryEvent = SentryEvent(event.timestamp).also { scrubbed ->
    scrubbed.eventId = event.eventId
    // Never serialised; kept for the steps the SDK takes after beforeSend.
    scrubbed.throwable = event.throwable
    scrubbed.level = event.level
    scrubbed.platform = event.platform
    scrubbed.logger = event.logger
    scrubbed.environment = event.environment
    scrubbed.release = event.release
    scrubbed.dist = event.dist
    scrubbed.sdk = event.sdk
    scrubbed.transaction = event.transaction
    scrubbed.fingerprints = event.fingerprints
    scrubbed.debugMeta = event.debugMeta
    // The error's own message stays (emails masked): our errors never contain personal data or note content
    // (ADR-013), and without it an error can't be debugged. Format parameters may hold anything and are dropped.
    scrubbed.message = event.message?.let { message ->
        Message().apply {
            formatted = message.formatted?.let(::maskEmails)
            this.message = message.message?.let(::maskEmails)
        }
    }
    scrubbed.exceptions = event.exceptions?.map(::scrubException)
    scrubbed.request = event.request?.let(::scrubRequest)
    scrubbed.user = event.user?.let(::scrubUser)
    scrubContexts(event.contexts, into = scrubbed.contexts)
    scrubbed.breadcrumbs = event.breadcrumbs?.map(::scrubBreadcrumb)
}

/**
 * Breadcrumb messages are dropped: they are log lines from anywhere, including libraries, and may hold any text. Only
 * the HTTP method, status code and URL path survive in `data`.
 */
internal fun scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb = Breadcrumb(breadcrumb.timestamp).apply {
    type = breadcrumb.type
    category = breadcrumb.category
    level = breadcrumb.level
    breadcrumb.data.filterKeys { it in BREADCRUMB_DATA }.forEach { (key, value) ->
        setData(key, if (key == "url" && value is String) scrubUrl(value) else value)
    }
}

private fun scrubException(exception: SentryException) = SentryException().apply {
    type = exception.type
    value = exception.value?.let(::maskEmails)
    module = exception.module
    threadId = exception.threadId
    mechanism = exception.mechanism?.let(::scrubMechanism)
    stacktrace = exception.stacktrace?.let { SentryStackTrace(it.frames?.map(::scrubFrame)) }
}

/** `data` may carry SDK-specific details; the rest says how the error was caught. */
private fun scrubMechanism(mechanism: Mechanism) = Mechanism().apply {
    type = mechanism.type
    description = mechanism.description
    helpLink = mechanism.helpLink
    isHandled = mechanism.isHandled
    meta = mechanism.meta
    synthetic = mechanism.synthetic
    exceptionId = mechanism.exceptionId
    parentId = mechanism.parentId
    isExceptionGroup = mechanism.isExceptionGroup
}

/** Local variables (`vars`) may hold anything the code was working on; so may the description of a held lock. */
private fun scrubFrame(frame: SentryStackFrame) = SentryStackFrame().apply {
    filename = frame.filename
    function = frame.function
    module = frame.module
    lineno = frame.lineno
    colno = frame.colno
    absPath = frame.absPath
    contextLine = frame.contextLine
    preContext = frame.preContext
    postContext = frame.postContext
    isInApp = frame.isInApp
    `package` = frame.`package`
    isNative = frame.isNative
    platform = frame.platform
    imageAddr = frame.imageAddr
    symbolAddr = frame.symbolAddr
    instructionAddr = frame.instructionAddr
    addrMode = frame.addrMode
    framesOmitted = frame.framesOmitted
    rawFunction = frame.rawFunction
    symbol = frame.symbol
}

private fun scrubRequest(request: Request) = Request().apply {
    method = request.method
    url = request.url?.let(::scrubUrl)
    headers = request.headers
        ?.mapKeys { (name, _) -> name.lowercase() }
        ?.filterKeys { it in REQUEST_HEADERS }
        ?.takeUnless { it.isEmpty() }
}

/** Only the internal user UUID and the workspace UUID, the latter in the user's data as `organization_id`. */
private fun scrubUser(user: User): User? {
    val id = user.id?.takeIf(UUID::matches)
    val organizationId = user.data?.get(ORGANIZATION_ID)?.takeIf(UUID::matches)
    if (id == null && organizationId == null) return null
    return User().apply {
        this.id = id
        data = organizationId?.let { mapOf(ORGANIZATION_ID to it) }
    }
}

private fun scrubContexts(contexts: Contexts, into: Contexts) {
    contexts.entrySet().filter { it.key in CONTEXTS }.forEach { (key, value) -> into.put(key, value) }
    // A user may have named their phone after themselves.
    into.device?.name = null
    contexts.response?.statusCode?.let { status -> into.setResponse(Response().apply { statusCode = status }) }
}

/** Drops the query string and fragment, and masks emails in the path. */
private fun scrubUrl(url: String): String = maskEmails(url.substringBefore('?').substringBefore('#'))
