import SwiftUI
import XCTest
import FivviAPI
import FivviDesignTokens

@testable import FivviPro
@testable import FivviStrings
@testable import FivviLanguage
@testable import FivviUI

/// The level icon of the v2 kit (F067): three bars of rising height filled by level, in the tokens' secondary text
/// colour, with *Niveau: {level}* as its VoiceOver label; a compact form for rows and a full one with the word. Drawn in
/// light and dark against the design tokens, like the rest of the kit (`KitRenderedTests`).
@MainActor
final class LevelIconTests: XCTestCase {
    private let language = InterfaceLanguage.resolve(.system())
    private var catalog: Catalog { Catalog(locale: language) }
    private let styles: [UIUserInterfaceStyle] = [.light, .dark]

    func test_F067_AC7_theBarsAreFilledByLevelAndAlleNiveausFillsAllThree() {
        XCTAssertEqual(Components.Schemas.ClassLevel.beginner.filledBars, 1)
        XCTAssertEqual(Components.Schemas.ClassLevel.intermediate.filledBars, 2)
        XCTAssertEqual(Components.Schemas.ClassLevel.advanced.filledBars, 3)
        XCTAssertEqual(Components.Schemas.ClassLevel.allLevels.filledBars, 3, "all three at the same weight")
        XCTAssertEqual(
            Components.Schemas.ClassLevel.fieldOrder, [.allLevels, .beginner, .intermediate, .advanced]
        )
    }

    func test_F067_AC6_aListShowsNoIconForAlleNiveausButTheFullFormAndTheEyebrowDo() {
        for level in Components.Schemas.ClassLevel.allCases {
            let inList = level != .allLevels
            XCTAssertEqual(LevelIcon.isShown(level, in: .compact), inList, "\(level) in a list")
            XCTAssertTrue(LevelIcon.isShown(level, in: .full))
            XCTAssertTrue(LevelIcon.isShown(level, in: .bars))
        }
    }

    func test_F067_AC5_theAccessibleNameIsNiveauColonTheWordInTheViewersLanguage() {
        let expected = TestCatalog(language)
        for level in Components.Schemas.ClassLevel.allCases {
            let key = level == .allLevels ? "allLevels" : level.rawValue
            XCTAssertEqual(
                catalog.levelAccessibleName(level),
                String(format: expected["classLevel.accessibleName"], expected["classLevel.\(key)"])
            )
        }
        let advanced = language == .en ? "Level: Advanced" : "Niveau: Gevorderd"
        XCTAssertEqual(catalog.levelAccessibleName(.advanced), advanced)
        XCTAssertEqual(catalog.levelWord(nil), language == .en ? "None" : "Geen")
    }

    /// The bar `index` (0 to 2) of an icon drawn at the top left of a view of its own size: a point in its middle.
    private func barPoint(_ index: Int) -> CGPoint {
        let height = LevelBarsMetrics.heights[index]
        let left = CGFloat(index) * (LevelBarsMetrics.width + LevelBarsMetrics.gap) + LevelBarsMetrics.width / 2
        return CGPoint(x: left, y: 11 - height / 2)
    }

    func test_F067_AC13_theFilledBarsAreTheSecondaryTextColourAndTheUnfilledOnesAreFainter() throws {
        for style in styles {
            let icon = try RenderedView(
                LevelIcon(level: .intermediate, catalog: catalog, form: .compact).fixedSize(), width: 40, style: style
            )
            let background = Pixel(Tokens.Colors.bgCanvas, in: style)
            let secondary = Pixel(Tokens.Colors.textSecondary, in: style)
            assertColour(icon.colour(at: barPoint(0)), is: secondary, "bar 1 filled, \(style.rawValue)")
            assertColour(icon.colour(at: barPoint(1)), is: secondary, "bar 2 filled, \(style.rawValue)")
            let faded = icon.colour(at: barPoint(2))
            XCTAssertGreaterThan(faded.distance(to: secondary), colourTolerance, "bar 3 is unfilled, \(style.rawValue)")
            XCTAssertLessThan(faded.distance(to: background), secondary.distance(to: background))
        }
    }

    func test_F067_AC13_theFilledBarsMeetThreeToOneOnTheCanvasTheCardAndTheSheetInLightAndDark() throws {
        let grounds = [Tokens.Colors.bgCanvas, Tokens.Colors.bgSurface, Tokens.Colors.bgRaised]
        for style in styles {
            for ground in grounds {
                let icon = try RenderedView(
                    LevelIcon(level: .advanced, catalog: catalog, form: .compact).fixedSize(), width: 40,
                    style: style, canvas: ground
                )
                let bar = icon.colour(at: barPoint(2))
                let ratio = Self.contrast(bar, Pixel(ground, in: style))
                XCTAssertGreaterThanOrEqual(ratio, 3, "filled bar on \(ground), \(style.rawValue): \(ratio)")
            }
        }
    }

    func test_F067_AC7_theFullFormHasTheWordNextToTheBarsAndTheCompactFormDoesNot() throws {
        let compact = try RenderedView(
            LevelIcon(level: .advanced, catalog: catalog, form: .compact).fixedSize(), width: 120
        )
        let full = try RenderedView(
            LevelIcon(level: .advanced, catalog: catalog, form: .full).fixedSize(), width: 120
        )
        let background = Pixel(Tokens.Colors.bgCanvas, in: .light)
        let secondary = Pixel(Tokens.Colors.textSecondary, in: .light)
        let wordArea = CGRect(x: 25, y: 0, width: 90, height: 18)
        XCTAssertFalse(compact.contains(secondary, in: wordArea), "bars only")
        XCTAssertTrue(
            full.foreground(in: wordArea, on: background).distance(to: background) > colourTolerance,
            "the word is drawn"
        )
    }

    /// WCAG relative luminance contrast of two 8-bit sRGB colours.
    private static func contrast(_ first: Pixel, _ second: Pixel) -> Double {
        let high = max(luminance(first), luminance(second))
        let low = min(luminance(first), luminance(second))
        return (high + 0.05) / (low + 0.05)
    }

    private static func luminance(_ pixel: Pixel) -> Double {
        func linear(_ channel: Int) -> Double {
            let value = Double(channel) / 255
            return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(pixel.red) + 0.7152 * linear(pixel.green) + 0.0722 * linear(pixel.blue)
    }
}
