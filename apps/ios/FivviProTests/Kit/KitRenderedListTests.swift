import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro
@testable import FivviUI

/// E020 AC14, the kit's blocks for the lists of people (Klanten, the client profile): the avatar and the separators that
/// start after it, drawn in light and dark (the helpers are those of `KitRenderedTests`).
extension KitRenderedTests {
    /// The rows of a list with an avatar in front (Klanten) start their separators past it: 68 pt in for a 40 pt avatar.
    func test_E020_AC14_aGroupCanStartItsSeparatorsPastAnAvatar() throws {
        for style in styles {
            let group = try RenderedView(
                InsetGroup(separatorInset: 68) {
                    InsetRow(title: sample)
                    InsetRow(title: sample)
                },
                width: 300, style: style
            )
            let line = pixel(Tokens.Colors.borderDefault, style)
            XCTAssertTrue(group.contains(line, in: CGRect(x: 150, y: 50, width: 1, height: 4)), mode(style))
            let before = CGRect(x: 20, y: 50, width: 44, height: 4)
            XCTAssertFalse(group.contains(line, in: before), "no separator before 68 pt, \(mode(style))")
        }
    }

    // MARK: Person avatar

    /// The avatar of a client (E020 TM-02, TM-03): a circle of 40 pt in a row and 84 pt on a profile, in the private
    /// session's gradient, with the initials in its on-solid text colour; its corners show what is behind it.
    func test_E020_AC14_aPersonAvatarIsACircleInThePrivateGradientWithInitials() throws {
        for style in styles {
            for size in [PersonAvatarMetrics.row, PersonAvatarMetrics.large] {
                let avatar = PersonAvatar(name: sample, size: size)
                let view = try RenderedView(avatar.fixedSize(), width: size, style: style)
                let name = "\(Int(size)) pt, \(mode(style))"
                XCTAssertEqual(view.size.width, size, accuracy: 0.5, "width, \(name)")
                XCTAssertEqual(view.size.height, size, accuracy: 0.5, "height, \(name)")
                let top = view.colour(at: CGPoint(x: size / 2, y: 3))
                let bottom = view.colour(at: CGPoint(x: size / 2, y: size - 3))
                XCTAssertLessThanOrEqual(
                    top.distance(to: pixel(Tokens.Colors.sessionPrivateGradientTop, style)), 8, "top, \(name)"
                )
                XCTAssertLessThanOrEqual(
                    bottom.distance(to: pixel(Tokens.Colors.sessionPrivateGradientBottom, style)), 8, "bottom, \(name)"
                )
                assertPixel(view, at: CGPoint(x: 1, y: 1), is: Tokens.Colors.bgCanvas, style, "corner, \(name)")
                let letters = CGRect(x: size * 0.2, y: size * 0.3, width: size * 0.6, height: size * 0.4)
                XCTAssertTrue(
                    view.contains(pixel(Tokens.Colors.sessionPrivateOnSolid, style), in: letters),
                    "the initials are in the on-solid colour, \(name)"
                )
            }
        }
    }

    func test_E020_AC14_theInitialsAreThoseOfTheFirstAndTheLastWord() {
        XCTAssertEqual(PersonAvatarMetrics.initials(of: "Anna de Vries"), "AV")
        XCTAssertEqual(PersonAvatarMetrics.initials(of: "  mark   jansen "), "MJ")
        XCTAssertEqual(PersonAvatarMetrics.initials(of: "Sophie"), "S")
        XCTAssertEqual(PersonAvatarMetrics.initials(of: "   "), "")
        XCTAssertEqual(PersonAvatarMetrics.initials(of: ""), "")
    }
}
