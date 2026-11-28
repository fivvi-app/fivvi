import FivviObservability
import FivviSession

/// The files the app keeps on the phone for the person who is signed in.
struct PhoneFiles {
    /// What the personal screens keep for the offline view (F013 AC7).
    let personal: any PersonalStore
    /// The attendance taps waiting to be sent (F025).
    let attendance: any PersonalStore

    static let live = PhoneFiles(personal: FilePersonalStore.shared, attendance: FilePersonalStore.attendance)
}

/// The app's sign-in state and the middleware that turns a rejected token into a sign-out. What goes with a sign-out is
/// decided here: the error-reporting user and what the personal screens keep for the offline view (F013 AC7). The
/// attendance taps do not go with it: the sign-out the person chose clears them as it starts (`AccountViewModel`), and a
/// token the API rejected leaves them on the phone for the same account's next sign-in (#1618).
@MainActor
struct AppSignIn {
    let session: Session
    let auth: AuthMiddleware
    /// The files of the phone, which the home reads and writes as well (`HomeView(files:)`).
    let files: PhoneFiles

    init(
        store: any SessionStore, files: PhoneFiles = .live,
        clearReportingUser: @escaping () -> Void = ErrorReporting.clearUser
    ) {
        let session = Session(store: store, onSignedOut: {
            clearReportingUser()
            files.personal.clear()
        })
        self.session = session
        self.files = files
        auth = AuthMiddleware(store: store) { await session.tokenRejected() }
    }
}
