import FivviAPI
import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage
@testable import FivviUI

/// The level icon on the rows of Vandaag and Agenda (F067 AC5, AC6, AC8, AC13, iOS): the compact bars right after the class
/// name, the level in the row's one VoiceOver label, nothing for *Alle niveaus* and *Geen*. The test plan runs every test
/// in nl and en (FivviPro.xctestplan).
@MainActor
final class PersonalRowLevelTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: Catalog { Catalog(locale: language) }
    private var expected: TestCatalog { TestCatalog(language) }

    /// `plain`: no kind and no workspace on the row, so the only secondary-coloured pixels in its name's column are the bars.
    private func row(
        _ level: Components.Schemas.ClassLevel?, name: String = "Reformer Power", plain: Bool = false
    ) -> PersonalRow {
        let item = PersonalFixtures.session(
            "reformer", PersonalFixtures.johns, from: "15:00", to: "16:00", className: name, booked: 2, capacity: 8,
            level: level
        )
        return PersonalRows(
            namesKinds: !plain, workspaceCount: plain ? 1 : 2, catalog: catalog, now: PersonalFixtures.now
        ).row(item)
    }

    private func accessibleName(_ key: String) -> String {
        String(format: expected["classLevel.accessibleName"], expected["classLevel.\(key)"])
    }

    func test_F067_AC5_aGevorderdRowHasThreeBarsAndTheLevelInItsOneLabelAfterTheClassName() {
        let advanced = row(.advanced)
        XCTAssertEqual(advanced.level, .advanced)
                let label = advanced.spokenLabel
        let name = label.range(of: "Reformer Power")
        let level = label.range(of: accessibleName("advanced"))
        XCTAssertNotNil(name)
        XCTAssertNotNil(level, label)
        if let name, let level {
            XCTAssertLessThan(name.upperBound, level.lowerBound, "after the class name: \(label)")
            let between = label[name.upperBound..<level.lowerBound]
            XCTAssertFalse(between.contains(expected["myDay.typeGroup"].lowercased()), "right after it: \(label)")
        }
    }

    func test_F067_AC5_beginnerAndGemiddeldAlsoShowTheIconWithTheirOwnName() {
        XCTAssertEqual(row(.beginner).level?.filledBars, 1)
        XCTAssertTrue(row(.beginner).spokenLabel.contains(accessibleName("beginner")), row(.beginner).spokenLabel)
        XCTAssertTrue(
            row(.intermediate).spokenLabel.contains(accessibleName("intermediate")), row(.intermediate).spokenLabel
        )
        XCTAssertEqual(row(.intermediate).level?.filledBars, 2)
    }

    func test_F067_AC6_alleNiveausAndGeenShowNoIconAndTheLabelIsTheOneWithoutALevel() {
        let without = row(nil).spokenLabel
        for level in [Components.Schemas.ClassLevel.allLevels] {
            let shown = row(level)
            XCTAssertNil(shown.level, "\(level)")
            XCTAssertEqual(shown.spokenLabel, without)
        }
        XCTAssertNil(row(nil).level)
        XCTAssertFalse(without.contains(expected["classLevel.accessibleName"].prefix(3)), without)
    }

    func test_F067_AC5_aPrivateSessionHasNoLevelIcon() {
        let item = PersonalFixtures.session(
            "anna", PersonalFixtures.sarahPT, from: "09:00", to: "10:00", client: "Anna de Vries", level: .advanced
        )
        let built = PersonalRows(namesKinds: true, workspaceCount: 2, catalog: catalog, now: PersonalFixtures.now)
            .row(item)
        XCTAssertNil(built.level, "only a class has a level")
    }

    // MARK: Drawn

    private func listRow(_ row: PersonalRow, width: CGFloat, style: UIUserInterfaceStyle) throws -> RenderedView {
        try RenderedView(
            PersonalRowView(row: row, catalog: catalog, onOpen: {}).environment(\.locale, catalog.formattingLocale),
            width: width, style: style
        )
    }

    /// Where two renderings of the same row differ: the bars, when one has them and the other not.
    private func changedRegion(_ first: RenderedView, _ second: RenderedView) -> CGRect? {
        var region: CGRect?
        for top in stride(from: CGFloat(0), to: first.size.height, by: 1.0 / 3) {
            for left in stride(from: CGFloat(0), to: first.size.width, by: 1.0 / 3) {
                let point = CGPoint(x: left, y: top)
                guard first.colour(at: point).distance(to: second.colour(at: point)) > 24 else { continue }
                let dot = CGRect(origin: point, size: .zero)
                region = region.map { $0.union(dot) } ?? dot
            }
        }
        return region
    }

    func test_F067_AC5_theBarsStayWithTheLastWordOfAClassNameThatWrapsAndNothingIsCutOff() throws {
        let long = "Reformer Power Intensief met extra lange naam voor alle gevorderde deelnemers"
        for style in [UIUserInterfaceStyle.light, .dark] {
            let short = try listRow(row(.advanced, plain: true), width: 360, style: style)
            let wrapped = try listRow(row(.advanced, name: long, plain: true), width: 360, style: style)
            let alone = try listRow(row(.allLevels, name: long, plain: true), width: 360, style: style)
            XCTAssertGreaterThan(wrapped.size.height, short.size.height + 15, "the name wraps on more lines")
            XCTAssertEqual(alone.size.height, wrapped.size.height, accuracy: 1, "the icon adds no line")
            // The only difference between the two is the bars: three of them, 13 pt wide and 11 high, on the last line.
            let bars = try XCTUnwrap(changedRegion(wrapped, alone), "the bars are drawn, \(style.rawValue)")
            XCTAssertEqual(bars.width, 13, accuracy: 2, "\(style.rawValue)")
            XCTAssertEqual(bars.height, 11, accuracy: 2, "\(style.rawValue)")
            XCTAssertGreaterThan(bars.minY, wrapped.size.height * 0.4, "on the last line, \(style.rawValue)")
            XCTAssertLessThan(bars.maxX, wrapped.size.width - 40, "inside the row, not cut off, \(style.rawValue)")
        }
    }

    func test_F067_AC13_theBarsOnARowAreDrawnInTheSecondaryTextColourInLightAndDark() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let view = try listRow(row(.advanced, plain: true), width: 360, style: style)
            let alone = try listRow(row(.allLevels, plain: true), width: 360, style: style)
            let bars = try XCTUnwrap(changedRegion(view, alone), "\(style.rawValue)")
            // The tallest bar's middle, 1.5 pt in from its right edge.
            let point = CGPoint(x: bars.maxX - 1.5, y: bars.midY)
            assertColour(
                view.colour(at: point), is: Pixel(Tokens.Colors.textSecondary, in: style), "bar, \(style.rawValue)"
            )
        }
    }
}

/// The rows of John's *Hele studio* on Vandaag (F067 AC8): the same level, from the workspace's day.
@MainActor
final class StudioRowLevelTests: StudioDayTestCase {
    func test_F067_AC8_johnsHeleStudioRowsShowTheSameLevelAsSarahsAndNoOtherWayToChangeIt() async {
        let reformer = StudioFixtures.session(
            "reformer", from: "13:00", to: "14:00", trainer: StudioFixtures.sarah, className: "Reformer Power",
            level: .advanced
        )
        // Kracht at 10:00 is the next card; the other sessions are the rows.
        let model = await studio(johnWithATeam(day: StudioFixtures.johnsDay(items: [StudioFixtures.kracht, reformer])))

        let rows = model.rows(at: PersonalFixtures.now)

        XCTAssertEqual(rows.map(\.level), [.advanced])
        let name = String(format: catalog["classLevel.accessibleName"], catalog["classLevel.advanced"])
        XCTAssertTrue(rows.first?.spokenLabel.contains(name) == true, rows.first?.spokenLabel ?? "")
    }
}
