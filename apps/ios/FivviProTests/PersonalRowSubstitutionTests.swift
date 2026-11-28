import FivviAPI
import XCTest

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage

/// The substitution on the rows of Vandaag and Agenda (F024 AC4, iOS): the covering trainer's row says "Je valt in voor
/// Sarah", the replaced trainer's row is dimmed with "Overgenomen door Mike", has no actions and is not counted. The test
/// plan runs every test in nl and en (FivviPro.xctestplan).
@MainActor
final class PersonalRowSubstitutionTests: AgendaTestCase {
    private var covering: PersonalItem {
        PersonalFixtures.session(
            "kracht-cover", PersonalFixtures.johns, from: "18:00", to: "19:00", className: "Kracht", booked: 2,
            capacity: 8, substituteFor: "Sarah Visser"
        )
    }

    private var takenOver: PersonalItem {
        PersonalFixtures.session(
            "kracht-away", PersonalFixtures.johns, from: "18:00", to: "19:00", className: "Kracht", booked: 2,
            capacity: 8, attendanceOpen: true, takenOverBy: "Mike Bakker"
        )
    }

    private func servedDay(_ day: PersonalDay) -> StubAPI {
        let api = StubAPI()
        api.myDay.serve(day)
        return api
    }

    private func builder() -> PersonalRows {
        PersonalRows(namesKinds: true, workspaceCount: 1, catalog: Catalog(locale: language), now: PersonalFixtures.now)
    }

    func test_F024_AC4_theCoveringRowSaysJeValtInVoorSarahAndIsNotDimmed() {
        let row = builder().row(covering)

        XCTAssertEqual(row.substitutionText, String(format: catalog["myDay.coveringFor"], "Sarah Visser"))
        XCTAssertFalse(row.isTakenOver)
        XCTAssertTrue(
            row.spokenLabel.contains(row.substitutionText ?? "?"), "in its one VoiceOver label: \(row.spokenLabel)"
        )
    }

    func test_F024_AC4_theTakenOverRowSaysOvergenomenDoorMikeAndIsDimmed() {
        let row = builder().row(takenOver)

        XCTAssertEqual(row.substitutionText, String(format: catalog["myDay.takenOverBy"], "Mike Bakker"))
        XCTAssertTrue(row.isTakenOver)
        XCTAssertTrue(row.spokenLabel.contains(row.substitutionText ?? "?"), row.spokenLabel)
    }

    func test_F024_AC4_aDateTheAccountTeachesHasNoSubstitutionLine() {
        let row = builder().row(PersonalFixtures.kracht)
        XCTAssertNil(row.substitutionText)
        XCTAssertFalse(row.isTakenOver)
    }

    func test_F024_AC4_todayListsBothAndGivesTheTakenOverRowNoNudge() async {
        let day = PersonalFixtures.sarah(items: [PersonalFixtures.anna, covering, takenOver])
        let api = StubAPI()
        api.myDay.serve(day)
        let queue = AttendanceQueue(api: api, store: MemoryPersonalStore(), isOnline: { true }, retryAfter: nil)
        let today = TodayViewModel(
            api: api, catalog: Catalog(locale: language), store: MemoryPersonalStore(), now: { PersonalFixtures.now },
            deviceTimeZone: SessionFixtures.amsterdam, attendance: queue
        )

        await today.load()

        XCTAssertEqual(today.rows.map(\.substitutionText), [
            String(format: catalog["myDay.coveringFor"], "Sarah Visser"),
            String(format: catalog["myDay.takenOverBy"], "Mike Bakker")
        ])
        XCTAssertTrue(today.rows[1].isTakenOver)
        XCTAssertNil(today.rows[1].nudge, "no actions on a date that was taken over")
        XCTAssertFalse(today.rows[1].attendanceLine)
        XCTAssertTrue(today.card?.todo.chips.isEmpty ?? false, "not in Te doen either")
        XCTAssertEqual(
            today.summaryText, String(format: catalog["myDay.app.summary"], 3, "0", "09:00", "19:00"),
            "the summary is the API's"
        )
    }

    /// The API names the first item `next`: with Kracht as the covering trainer's next class, the card is the only place
    /// the class shows (the rows leave it out), so the card says it (#1648).
    func test_F024_AC4_theNextCardOfTheCoveringTrainerSaysJeValtInVoorSarahAndNamesItForVoiceOver() async {
        let day = PersonalFixtures.sarah(items: [covering, PersonalFixtures.mark])
        let today = TodayViewModel(
            api: servedDay(day), catalog: Catalog(locale: language), store: MemoryPersonalStore(),
            now: { PersonalFixtures.now }, deviceTimeZone: SessionFixtures.amsterdam
        )

        await today.load()

        XCTAssertEqual(today.next?.row.title, "Kracht")
        XCTAssertEqual(today.nextDetail, String(format: catalog["myDay.coveringFor"], "Sarah Visser"))
        XCTAssertFalse(
            today.nextSubtitle?.contains(today.nextDetail ?? "?") ?? true, "a line of its own, not in the subtitle"
        )
        XCTAssertEqual(today.rows.map(\.title), ["Mark Jansen"], "the next class is not in the rows as well")
        XCTAssertTrue(
            today.nextSpokenLabel(at: PersonalFixtures.now).contains(today.nextDetail ?? "?"),
            "in what VoiceOver says of the card: \(today.nextSpokenLabel(at: PersonalFixtures.now))"
        )
    }

    func test_F024_AC4_theNextCardOfADateSheTeachesHasNoSubstitutionLine() async {
        let today = TodayViewModel(
            api: servedDay(PersonalFixtures.sarah()), catalog: Catalog(locale: language), store: MemoryPersonalStore(),
            now: { PersonalFixtures.now }, deviceTimeZone: SessionFixtures.amsterdam
        )

        await today.load()

        XCTAssertNil(today.nextDetail)
    }

    func test_F024_AC4_agendaShowsTheSameLabelsAndCountsOnlyWhatShePersonallyTeaches() async {
        let day = "2026-10-20"
        let teaches = PersonalFixtures.session(
            "kracht-own", PersonalFixtures.johns, from: "10:00", to: "11:00", className: "Kracht", booked: 1,
            capacity: 8, day: day
        )
        let away = PersonalFixtures.session(
            "kracht-away", PersonalFixtures.johns, from: "18:00", to: "19:00", className: "Kracht", booked: 2,
            capacity: 8, day: day, takenOverBy: "Mike Bakker"
        )
        let agenda = model(served([teaches, away]), now: PersonalFixtures.at("08:35", day))
        agenda.select(day)
        await agenda.load()

        let rows = agenda.rows(on: day)
        XCTAssertEqual(rows.map(\.isTakenOver), [false, true])
        XCTAssertEqual(rows[1].substitutionText, String(format: catalog["myDay.takenOverBy"], "Mike Bakker"))
        let cell = agenda.strip.first { $0.day == day }
        XCTAssertEqual(cell?.count, 1, "the day's dot and count are for the date she teaches")
        XCTAssertEqual(cell?.dots, [.group])

        let coveringAgenda = model(
            served([PersonalFixtures.session(
                "kracht-cover", PersonalFixtures.johns, from: "18:00", to: "19:00", className: "Kracht", booked: 2,
                capacity: 8, day: day, substituteFor: "Sarah Visser"
            )]),
            now: PersonalFixtures.at("08:35", day)
        )
        coveringAgenda.select(day)
        await coveringAgenda.load()
        XCTAssertEqual(
            coveringAgenda.rows(on: day).first?.substitutionText,
            String(format: catalog["myDay.coveringFor"], "Sarah Visser")
        )
        XCTAssertEqual(coveringAgenda.strip.first { $0.day == day }?.count, 1)
    }
}
