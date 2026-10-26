import FivviAPI
import XCTest

@testable import FivviPro

/// What the screen reader was told, in order.
final class Announcements {
    private(set) var texts: [String] = []
    func record(_ text: String) { texts.append(text) }
}

/// How often the sign-in view model handed over to the signed-in home.
final class SignedIn: @unchecked Sendable {
    private(set) var count = 0
    func bump() { count += 1 }
}

/// What the sign-in view model tests share: the app's interface language in this test-plan configuration, its
/// catalog, and a model against a `StubAPI`. The test plan runs every test in nl and en.
@MainActor
class SignInModelTestCase: XCTestCase {
    let language = InterfaceLanguage.resolve(.system())
    lazy var catalog = Catalog(locale: language)

    func model(
        _ api: StubAPI, store: InMemorySessionStore = InMemorySessionStore(), signedIn: SignedIn = SignedIn(),
        afterRejection: Bool = false, announcements: Announcements = Announcements()
    ) -> SignInViewModel {
        SignInViewModel(
            api: api, store: store, catalog: catalog, showsSignedOutNotice: afterRejection,
            onSignedIn: { signedIn.bump() }, announce: { announcements.record($0) }
        )
    }

    /// A model on the code step for `owner@example.com`.
    func modelOnCodeStep(_ api: StubAPI, announcements: Announcements = Announcements()) async -> SignInViewModel {
        let model = model(api, announcements: announcements)
        model.email = "owner@example.com"
        await model.requestCode()
        return model
    }
}
