package nl.trainerhub.app.observability

import io.sentry.Hint
import io.sentry.ITransportFactory
import io.sentry.SentryEnvelope
import io.sentry.SentryEvent
import io.sentry.SentryItemType
import io.sentry.SentryOptions
import io.sentry.transport.ITransport
import io.sentry.transport.RateLimiter
import java.io.ByteArrayOutputStream

/**
 * Keeps what the SDK would send to Sentry, after `beforeSend` and `beforeBreadcrumb`, instead of sending it: tests
 * assert on what leaves the app, never on how the SDK is called (spec #32, Testing Decisions).
 */
class CaptureTransport(private val options: SentryOptions) : ITransport {
    val envelopes = mutableListOf<SentryEnvelope>()

    /** Every envelope as Sentry would receive it, serialised. */
    val sent: String
        get() = envelopes.joinToString("\n") { envelope ->
            ByteArrayOutputStream().also { options.serializer.serialize(envelope, it) }.toString(Charsets.UTF_8)
        }

    val events: List<SentryEvent>
        get() = envelopes.flatMap { it.items }
            .filter { it.header.type == SentryItemType.Event }
            .mapNotNull { it.getEvent(options.serializer) }

    /** Every session update, as the JSON Sentry would receive. */
    val sessions: List<String>
        get() = envelopes.flatMap { it.items }
            .filter { it.header.type == SentryItemType.Session }
            .map { it.data.toString(Charsets.UTF_8) }

    override fun send(envelope: SentryEnvelope, hint: Hint) {
        envelopes += envelope
    }

    override fun flush(timeoutMillis: Long) = Unit

    override fun getRateLimiter(): RateLimiter? = null

    override fun close(isRestarting: Boolean) = Unit

    override fun close() = Unit

    companion object {
        /** Hands the transport to `onCreate` once the SDK makes it. */
        fun factory(onCreate: (CaptureTransport) -> Unit) = ITransportFactory { options, _ ->
            CaptureTransport(options).also(onCreate)
        }
    }
}
