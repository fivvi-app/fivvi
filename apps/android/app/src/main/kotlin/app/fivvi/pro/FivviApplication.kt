package app.fivvi.pro

import android.app.Application
import android.content.Context
import app.fivvi.api.apis.BookingLinksApi
import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.GroupClassesApi
import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.MeApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.apis.SignInApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi
import app.fivvi.core.LanguagePreference
import app.fivvi.core.LanguageSettings
import app.fivvi.core.SharedPreferencesLanguageStore
import app.fivvi.core.SystemLanguageSettings
import app.fivvi.core.auth.ApiServices
import app.fivvi.core.auth.KeystoreSessionStore
import app.fivvi.core.auth.Session
import app.fivvi.core.net.AndroidConnectivity
import app.fivvi.core.net.Connectivity
import app.fivvi.core.observability.Observability
import app.fivvi.pro.personal.FilePersonalStore
import app.fivvi.pro.personal.PersonalStore
import app.fivvi.pro.personal.ProTab
import app.fivvi.pro.workspace.CurrentWorkspace
import app.fivvi.pro.workspace.SharedPreferencesLastWorkspaceStore
import java.io.File
import java.time.Clock

/** What the screens depend on. Instrumented tests replace it before an activity starts. */
interface AppDependencies {
    val signInApi: SignInApi
    val meApi: MeApi
    val workspacesApi: WorkspacesApi
    val clientsApi: ClientsApi
    val trainersApi: TrainersApi
    val sessionsApi: SessionsApi
    val locationsApi: LocationsApi
    val groupClassesApi: GroupClassesApi
    val bookingLinksApi: BookingLinksApi
    val session: Session
    val languageSettings: LanguageSettings

    /** Whether the phone has a working connection: an action that needs the server is off while it hasn't (F026). */
    val connectivity: Connectivity

    /** The language shown and kept (F010). */
    val languagePreference: LanguagePreference

    /** The workspace used last on this device, kept across sign-outs (F012). */
    val currentWorkspace: CurrentWorkspace

    /** What Vandaag keeps on the phone for its offline view: an app-private file, kept out of backups, cleared on sign-out (F013 AC7). */
    val personalStore: PersonalStore

    /**
     * What the offline queue of attendance keeps on the phone (F025): an app-private file, kept out of backups. Not the
     * personal store: a token the API rejects clears that one, and the taps still waiting stay for the same account's next
     * sign-in; only a sign-out the person chose, after the warning, clears them.
     */
    val attendanceStore: PersonalStore

    /** The clock the personal screens read: the real one, fixed by a test. */
    val clock: Clock get() = Clock.systemUTC()

    /** The tab the signed-in app opens on: Vandaag; a test of a home screen starts on the home. */
    val initialTab: ProTab get() = ProTab.TODAY

    /** The sign-in API for the one sign-out request that carries [token] (AC10). */
    fun signOutApi(token: String): SignInApi
}

/** The folder of the app's files that holds the attendance queue. */
const val ATTENDANCE_DIRECTORY = "attendance"

class DefaultAppDependencies(context: Context) : AppDependencies {
    override val personalStore: PersonalStore by lazy {
        FilePersonalStore(File(context.filesDir, PersonalStore.DIRECTORY))
    }

    override val attendanceStore: PersonalStore by lazy {
        FilePersonalStore(File(context.filesDir, ATTENDANCE_DIRECTORY))
    }

    // Signing out, also after a rejected token, clears the error-reporting user (F001 AC3) and what Vandaag kept (F013 AC7).
    override val session: Session by lazy {
        Session(
            KeystoreSessionStore(context),
            onSignedOut = {
                Observability.clearUser()
                personalStore.clear()
            },
        )
    }

    // One client for every call, with the auth layer, and nothing that logs.
    private val services: ApiServices by lazy {
        ApiServices(BuildConfig.API_BASE_URL, session, acceptLanguage = { languagePreference.language.value.tag })
    }
    override val signInApi: SignInApi get() = services.signInApi
    override val meApi: MeApi get() = services.meApi
    override val workspacesApi: WorkspacesApi get() = services.workspacesApi
    override val clientsApi: ClientsApi get() = services.clientsApi
    override val trainersApi: TrainersApi get() = services.trainersApi
    override val sessionsApi: SessionsApi get() = services.sessionsApi
    override val locationsApi: LocationsApi get() = services.locationsApi
    override val groupClassesApi: GroupClassesApi get() = services.groupClassesApi
    override val bookingLinksApi: BookingLinksApi get() = services.bookingLinksApi
    override fun signOutApi(token: String): SignInApi = services.signOutApi(token)
    override val languageSettings: LanguageSettings = SystemLanguageSettings(context)
    override val connectivity: Connectivity by lazy { AndroidConnectivity(context) }
    override val languagePreference: LanguagePreference by lazy {
        LanguagePreference(SharedPreferencesLanguageStore(context), languageSettings)
    }
    override val currentWorkspace: CurrentWorkspace by lazy {
        CurrentWorkspace(SharedPreferencesLastWorkspaceStore(context))
    }
}

class FivviApplication : Application() {
    lateinit var dependencies: AppDependencies

    override fun onCreate() {
        super.onCreate()
        Observability.start(this, observabilityConfigOfThisBuild())
        dependencies = DefaultAppDependencies(this)
    }
}
