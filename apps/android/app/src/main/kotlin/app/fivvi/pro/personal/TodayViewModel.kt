package app.fivvi.pro.personal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MyDay
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

enum class TodayLoad {
    Loading,
    Loaded,

    /** Nothing is known to show: no answer yet and none kept for today. */
    Failed,
}

/** What TD-01 shows and holds. */
data class TodayState(
    val load: TodayLoad = TodayLoad.Loading,
    /** Today's answer, fresh or the phone's copy of it; never the day of another date. */
    val day: MyDay? = null,
    /** The day on screen is the phone's copy, because the connection failed. */
    val isOffline: Boolean = false,
    /** A read failed for another reason than the connection and the day on screen stays. */
    val updateFailed: Boolean = false,
    /** When the day on screen was read. */
    val updatedAt: Instant? = null,
    /** The names of the workspaces the person lost access to: *Je hebt geen toegang meer tot John's Gym.*, until closed. */
    val notices: List<String> = emptyList(),
    /** A pull to refresh or *Opnieuw* is under way. */
    val refreshing: Boolean = false,
    /** The time of the last read, for what is dimmed as past. */
    val now: Instant = Instant.EPOCH,
) {
    /** *Vandaag kon niet worden bijgewerkt.* with *Opnieuw*: the day on screen stays, or there is none. */
    val showsFailure: Boolean get() = updateFailed || (load == TodayLoad.Failed && !isOffline)
}

/**
 * TD-01 *Vandaag* (F013, the design of `DECISIONS.md` §3): everything the person is the trainer of today, in all their
 * workspaces, from `GET /v1/me/day` through the generated client. The server decides the summary, *Straks*, the free gap and
 * the places ahead; [TodayContent] words them. The last answer is kept on the phone ([PersonalCache]): without a connection
 * it stays on screen with *Je bent offline. Laatst bijgewerkt om {time}.*, and an answer that fails otherwise leaves it there
 * with *Opnieuw*. A day of another date is never shown. A workspace the person was on and is not any more shows its notice
 * once ([workspacesListed]).
 *
 * [refreshAccount] reads `GET /v1/me` again and answers the workspaces it lists, or `null` when that failed (a pull to refresh
 * and *Opnieuw* ask it too). File reads and writes of the cache run on [io]. An answer that arrives after the sign-out
 * ([stillSignedIn] is false) is dropped: this view model outlives the sign-out in the activity's store, and what the next
 * account would find on the phone must not be this one's.
 */
class TodayViewModel(
    private val api: MeApi,
    private val store: PersonalStore,
    private val clock: () -> Instant = Instant::now,
    private val refreshAccount: suspend () -> List<PersonalCache.Workspace>? = { null },
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val stillSignedIn: () -> Boolean = { true },
) : ViewModel() {
    private val cache = PersonalCache(store)
    private val _state = MutableStateFlow(TodayState(now = clock()))
    val state: StateFlow<TodayState> = _state.asStateFlow()
    private var loading: Job? = null
    private val listing = Mutex()

    /** The time now on the model's clock, for the countdown on the next card. */
    fun now(): Instant = clock()

    /** Opening, foreground, the OS's time-change signals: reads today again. */
    fun load() {
        loading?.cancel()
        loading = viewModelScope.launch { read() }
    }

    /** Pull to refresh and *Opnieuw*: the account is read again too (a workspace the person lost shows its notice), and so is the day. */
    fun refresh() {
        loading?.cancel()
        _state.update { it.copy(refreshing = true) }
        loading = viewModelScope.launch {
            try {
                coroutineScope {
                    val listed = async { refreshAccount() }
                    read()
                    listed.await()?.let { workspacesListed(it) }
                }
            } finally {
                _state.update { it.copy(refreshing = false) }
            }
        }
    }

    private suspend fun read() {
        val at = clock()
        val date = DATE.format(at.atZone(PersonalRows.TIME_ZONE))
        _state.update { it.copy(now = at) }
        val fresh = try {
            val response = api.getMyDay(date, MeApi.SurfaceGetMyDay.ANDROID)
            response.body()?.takeIf { response.isSuccessful } ?: return failed(offline = false, date)
        } catch (_: IOException) {
            return failed(offline = true, date)
        } catch (_: SerializationException) {
            return failed(offline = false, date)
        }
        if (!stillSignedIn()) return
        _state.update {
            it.copy(
                load = TodayLoad.Loaded,
                day = fresh,
                isOffline = false,
                updateFailed = false,
                updatedAt = at,
            )
        }
        withContext(io) { whileSignedIn { cache.day = PersonalCache.Day(fresh, at) } }
    }

    private suspend fun failed(offline: Boolean, date: String) {
        if (!stillSignedIn()) return
        // Offline across midnight, or reopened the next morning: yesterday's day is not today's.
        if (_state.value.day?.date.let {
                it != null && it != date
            }
        ) {
            _state.update { it.copy(day = null, updatedAt = null) }
        }
        if (_state.value.day == null) {
            val kept = withContext(io) { cache.day }?.takeIf { it.day.date == date }
            if (kept !=
                null
            ) {
                _state.update { it.copy(day = kept.day, updatedAt = kept.savedAt, load = TodayLoad.Loaded) }
            }
        }
        _state.update {
            if (it.day == null) {
                // The error state has its own *Opnieuw*: an earlier failure's banner must not show a second one.
                it.copy(load = TodayLoad.Failed, updateFailed = false, isOffline = offline)
            } else {
                it.copy(isOffline = offline, updateFailed = !offline)
            }
        }
    }

    // A write checks the sign-in under the store's own lock, which the sign-out's clear takes too: the check and the write
    // are one step as far as the clear is concerned, so a sign-out between them can't leave this account's files behind.
    private inline fun <T> whileSignedIn(block: () -> T): T? =
        synchronized(store) { if (stillSignedIn()) block() else null }

    /**
     * The account's workspaces after `GET /v1/me`: one the phone knew and the list lacks says so once (F013 AC8). The first
     * list has nothing to lose; the list is kept for the next one, also after the app starts again.
     */
    suspend fun workspacesListed(listed: List<PersonalCache.Workspace>) = listing.withLock {
        val gone = withContext(io) {
            whileSignedIn {
                val known = cache.workspaces.orEmpty()
                if (cache.workspaces != listed) cache.workspaces = listed
                known.filter { k -> listed.none { it.id == k.id } }
            }
        }
        if (!gone.isNullOrEmpty()) {
            _state.update {
                it.copy(
                    notices =
                        it.notices + gone.map(PersonalCache.Workspace::name),
                )
            }
        }
    }

    fun dismissNotices() = _state.update { it.copy(notices = emptyList()) }

    private companion object {
        val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ROOT)
    }
}
