package app.fivvi.pro.personal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fivvi.api.apis.MeApi
import app.fivvi.api.models.MySessions
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

/** *Dag | Week | Maand*. */
enum class AgendaMode { Day, Week, Month }

/** The days one request reads, both included. */
data class AgendaRange(val from: LocalDate, val until: LocalDate)

enum class AgendaLoad {
    Loading,
    Loaded,

    /** Nothing is known to show: no answer yet and none kept for these days. */
    Failed,
}

/** An answer for a range, and when the phone read it. */
data class AgendaRead(val response: MySessions, val savedAt: Instant)

/** How the last read of a range went. */
enum class AgendaResult { Success, Offline, Failed }

/** What TD-04 shows and holds: the view, the selected day and the answers read so far. */
data class AgendaState(
    val mode: AgendaMode = AgendaMode.Week,
    val selectedDay: LocalDate,
    /** The time of the last read, for what is dimmed as past. */
    val now: Instant = Instant.EPOCH,
    val loaded: Map<AgendaRange, AgendaRead> = emptyMap(),
    val results: Map<AgendaRange, AgendaResult> = emptyMap(),
    /** A pull to refresh or *Opnieuw* is under way. */
    val refreshing: Boolean = false,
) {
    /** The days the view on screen shows: the week of the selected day, or the grid of its month. */
    val visibleDays: List<LocalDate>
        get() = if (mode == AgendaMode.Month) CALENDAR.monthGrid(selectedDay) else CALENDAR.week(selectedDay)

    /** The days a request reads: it changes only when the view shows other days. */
    val range: AgendaRange get() = visibleDays.let { AgendaRange(it.first(), it.last()) }

    /** The answer for the days on screen, fresh or the phone's copy of it. */
    val read: AgendaRead? get() = loaded[range]

    val load: AgendaLoad
        get() = when {
            read != null -> AgendaLoad.Loaded
            results[range] == null -> AgendaLoad.Loading
            else -> AgendaLoad.Failed
        }

    /** The days on screen are the phone's copy: the connection failed. */
    val isOffline: Boolean get() = results[range] == AgendaResult.Offline

    /** The read failed for another reason than the connection, and the days on screen are an earlier one's. */
    val updateFailed: Boolean get() = results[range] == AgendaResult.Failed && read != null

    /** *De agenda kon niet worden bijgewerkt.* with *Opnieuw*: the days on screen stay, or there are none. */
    val showsFailure: Boolean get() = updateFailed || (load == AgendaLoad.Failed && !isOffline)

    /** When the days on screen were read. */
    val updatedAt: Instant? get() = read?.savedAt

    private companion object {
        val CALENDAR = AgendaCalendar(PersonalRows.TIME_ZONE)
    }
}

/**
 * TD-04 *Agenda* (F013, the design of `DECISIONS.md` §3, Android): *Dag | Week | Maand* of everything the person is the
 * trainer of, in all their workspaces, from `GET /v1/me/sessions` through the generated client. One request reads the days a
 * view shows (the seven of the week, or the weeks of the month grid), and picking a day or the other view of the same days
 * asks for nothing. The last [PersonalCache.KEPT_RANGES] answers are kept on the phone ([PersonalCache]): without a connection
 * they stay on screen with *Je bent offline. Laatst bijgewerkt om {time}.*, and an answer that fails otherwise leaves them
 * there with *Opnieuw*. The server decides which sessions there are; [AgendaContent] decides which days, dots and notes a
 * view shows.
 *
 * File reads and writes of the cache run on [io]. An answer that arrives after the sign-out ([stillSignedIn] is false) is
 * dropped: this view model outlives the sign-out in the activity's store, and what the next account would find on the phone
 * must not be this one's.
 */
class AgendaViewModel(
    private val api: MeApi,
    private val store: PersonalStore,
    private val clock: () -> Instant = Instant::now,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val stillSignedIn: () -> Boolean = { true },
) : ViewModel() {
    private val cache = PersonalCache(store)
    private val calendar = AgendaCalendar(PersonalRows.TIME_ZONE)
    private val _state = MutableStateFlow(
        clock().let { start -> AgendaState(selectedDay = calendar.day(start), now = start) },
    )
    val state: StateFlow<AgendaState> = _state.asStateFlow()
    private var loading: Job? = null

    /** The time now on the model's clock, for the now-line as time passes. */
    fun now(): Instant = clock()

    // MARK: Which days

    fun show(mode: AgendaMode) = _state.update { it.copy(mode = mode) }

    fun select(day: LocalDate) = _state.update { it.copy(selectedDay = day) }

    /** *Morgen* on Vandaag opens Agenda on that day, in the week view (the prototype's `S.aview = "week"`). */
    fun open(day: LocalDate) = _state.update { it.copy(mode = AgendaMode.Week, selectedDay = day) }

    /** *Vandaag* in the bar. */
    fun goToToday() = _state.update { it.copy(selectedDay = calendar.day(clock())) }

    fun stepWeek(weeks: Int) = _state.update { it.copy(selectedDay = calendar.addingDays(7 * weeks, it.selectedDay)) }

    fun stepMonth(months: Int) = _state.update { it.copy(selectedDay = calendar.addingMonths(months, it.selectedDay)) }

    // MARK: Loading

    /** Reads the days on screen (opening, another week or month, the foreground, the OS's time signals). */
    fun load() {
        loading?.cancel()
        loading = viewModelScope.launch { read() }
    }

    /** Pull to refresh and *Opnieuw*. */
    fun refresh() {
        loading?.cancel()
        _state.update { it.copy(refreshing = true) }
        loading = viewModelScope.launch {
            try {
                read()
            } finally {
                _state.update { it.copy(refreshing = false) }
            }
        }
    }

    private suspend fun read() {
        val at = clock()
        val range = _state.value.range
        _state.update { it.copy(now = at) }
        val fresh = try {
            val response = api.listMySessions(
                range.from.toString(),
                range.until.toString(),
                MeApi.SurfaceListMySessions.ANDROID,
            )
            response.body()?.takeIf { response.isSuccessful } ?: return failed(offline = false, range)
        } catch (_: IOException) {
            return failed(offline = true, range)
        } catch (_: SerializationException) {
            return failed(offline = false, range)
        }
        if (!stillSignedIn()) return
        _state.update {
            it.copy(
                loaded = it.loaded + (range to AgendaRead(fresh, at)),
                results = it.results + (range to AgendaResult.Success),
            )
        }
        withContext(io) { whileSignedIn { cache.keep(PersonalCache.Sessions(range.from, range.until, fresh, at)) } }
    }

    private suspend fun failed(offline: Boolean, range: AgendaRange) {
        if (!stillSignedIn()) return
        if (_state.value.loaded[range] == null) {
            val kept = withContext(io) {
                cache.sessions
            }.firstOrNull { it.from == range.from && it.until == range.until }
            if (kept != null) {
                _state.update { it.copy(loaded = it.loaded + (range to AgendaRead(kept.response, kept.savedAt))) }
            }
        }
        _state.update {
            it.copy(results = it.results + (range to if (offline) AgendaResult.Offline else AgendaResult.Failed))
        }
    }

    // A write checks the sign-in under the store's own lock, which the sign-out's clear takes too: the check and the write
    // are one step as far as the clear is concerned, so a sign-out between them can't leave this account's files behind.
    private inline fun <T> whileSignedIn(block: () -> T): T? =
        synchronized(store) { if (stillSignedIn()) block() else null }
}
