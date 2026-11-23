import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro

/// The colours of the dots under the days of Agenda (F013, TD-04): a private session is the design tokens' blue, a class
/// the purple, so the strip reads the same as the timeline's blocks.
final class AgendaStripTests: XCTestCase {
    func test_F013_design_aDotIsInItsTypesColour() {
        XCTAssertEqual(AgendaModel.Kind.privateSession.dotColour, Tokens.Colors.sessionPrivateSolid)
        XCTAssertEqual(AgendaModel.Kind.group.dotColour, Tokens.Colors.sessionGroupSolid)
        XCTAssertNotEqual(AgendaModel.Kind.privateSession.dotColour, AgendaModel.Kind.group.dotColour)
    }

    func test_F013_design_theNameOfADotSaysItsKindForATest() {
        XCTAssertEqual(AgendaModel.Kind.privateSession.dotName, "private")
        XCTAssertEqual(AgendaModel.Kind.group.dotName, "group")
    }
}
