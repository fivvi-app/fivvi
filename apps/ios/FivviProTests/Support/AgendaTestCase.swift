import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// What the tests of Agenda's model share: the language the plan runs in, and a model on a stub of the API.
@MainActor
class AgendaTestCase: XCTestCase {
    let language = InterfaceLanguage.resolve(.system())
    var catalog: TestCatalog { TestCatalog(language) }
    var format: SessionFormat {
        SessionFormat(locale: Catalog(locale: language).formattingLocale, timeZone: SessionFixtures.amsterdam)
    }

    func model(
        _ api: StubAPI, store: PersonalStore = MemoryPersonalStore(), now: Date = PersonalFixtures.now,
        device: TimeZone = SessionFixtures.amsterdam
    ) -> AgendaModel {
        AgendaModel(api: api, catalog: Catalog(locale: language), store: store, now: { now }, deviceTimeZone: device)
    }

    func served(
        _ items: [PersonalItem] = PersonalFixtures.septemberWeek, workspaceCount: Int = 2, showsKindLabel: Bool = true
    ) -> StubAPI {
        let api = StubAPI()
        api.mySessions.serve(items, workspaceCount: workspaceCount, showsKindLabel: showsKindLabel)
        return api
    }
}
