import FivviDesignTokens
import XCTest

/// What the sign-in UI tests share: the wait for an element and the checks of a screen's layout.
@MainActor
class SignInUITestCase: XCTestCase {
    let timeout: TimeInterval = 10

    /// The wait for another app to come to the foreground (Safari after `home.openWeb`). On a cold CI simulator Safari's
    /// first launch (no warm process, first-run set-up) can take far longer than a screen of our own app, so it has its own
    /// bound; it only ends early on success, so a warm launch costs nothing extra (#338).
    let externalAppLaunchTimeout: TimeInterval = 60

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// `element` is at least the minimum touch target, compared in the screen's device pixels (`TouchTarget`).
    func assertTouchTarget(_ element: XCUIElement, on screen: SignInScreen) throws {
        let size = element.frame.size
        let scale = try screen.app.screenshotBitmap().scale
        XCTAssertTrue(
            TouchTarget.isMet(by: size, scale: scale),
            "\(element.identifier) is \(size.width) × \(size.height) pt at \(scale)x, "
                + "below the \(TouchTarget.minimum) pt touch target"
        )
    }

    /// No text is clipped or cut off, and every element fits the window's width. A text field keeps what is typed on
    /// one line and scrolls it, so the audit's "may be clipped" for a field whose value is typed text (not empty, not
    /// its placeholder) is not counted; an empty field showing its placeholder is audited. With `wholeInWindow`, every
    /// element also lies inside the window vertically (a screen that scrolls has to bring it into view first).
    func assertReadable(_ screen: SignInScreen, _ elements: [XCUIElement], wholeInWindow: Bool = false) throws {
        // The message and the keyboard shift the layout for a moment; audit the settled screen.
        for element in elements { screen.settle(element) }
        let window = screen.app.windows.firstMatch.frame
        for element in elements {
            XCTAssertTrue(element.exists, "\(element.identifier) is not on screen")
            XCTAssertGreaterThanOrEqual(element.frame.minX, window.minX, element.identifier)
            XCTAssertLessThanOrEqual(element.frame.maxX, window.maxX, element.identifier)
            guard wholeInWindow else { continue }
            XCTAssertGreaterThanOrEqual(element.frame.minY, window.minY, "\(element.identifier) starts above")
            XCTAssertLessThanOrEqual(element.frame.maxY, window.maxY, "\(element.identifier) ends below")
            XCTAssertTrue(element.isHittable, "\(element.identifier) can't be reached")
        }
        // The audit may scroll the screen, so it comes after the frames are read.
        try screen.app.performAccessibilityAudit(for: [.textClipped, .dynamicType, .hitRegion]) { issue in
            if issue.auditType == .textClipped, let field = issue.element, field.elementType == .textField,
               let typed = field.value as? String, !typed.isEmpty, typed != field.placeholderValue {
                return true
            }
            XCTFail("\(issue.auditType) on \(issue.element?.identifier ?? "-"): \(issue.detailedDescription)")
            return true
        }
    }

    /// The accessibility audit with the contrast check, for a screen in `style`. Text-field clipping of typed text is not
    /// counted (see `assertReadable`). A contrast issue is accepted only on text drawn in the secondary text token
    /// (`textSecondary`, E020 AC3 and AC15): the element's strongest pixels are compared with the token resolved for the
    /// mode, on the canvas and on the group's surface. Text scrolled under the navigation bar is blended with the bar's
    /// glass, so the audit's pixels are not the text's own: a contrast issue on an element that reaches into the bar is
    /// not counted. The sheet's *Annuleren* and *Opslaan* are the system's own glass bar buttons (and *Naam wijzigen*
    /// its bar title): the audit flags the buttons whatever the colour of their text (*Annuleren* with the accent and with the label colour, as black on the
    /// glass is flagged too, so it measures the glass and not the text), so a contrast issue on an element in
    /// `systemBarItems` is not counted either, nor is the Dynamic Type one (the text of a bar item doesn't scale with
    /// the text size, which is the system's) and, for the title in the bar, the "may be clipped" one; the text is the text-safe accent (`NameEditorView`). Any other issue fails.
    func auditWithContrast(_ app: XCUIApplication, style: UIUserInterfaceStyle, _ context: String) throws {
        let secondary = RGB(Tokens.Colors.textSecondary, in: style)
        let systemBarItems: Set<String> = ["profile.nameCancel", "profile.nameSave", "profile.nameEditor"]
        let barBottom = app.navigationBars.firstMatch.frame.maxY
        let backgrounds = [RGB(Tokens.Colors.bgCanvas, in: style), RGB(Tokens.Colors.bgSurface, in: style)]
        try app.performAccessibilityAudit(
            for: [.textClipped, .dynamicType, .hitRegion, .contrast]
        ) { issue in
            if issue.auditType == .textClipped, let field = issue.element, field.elementType == .textField,
               let typed = field.value as? String, !typed.isEmpty, typed != field.placeholderValue {
                return true
            }
            if [.contrast, .dynamicType, .textClipped].contains(issue.auditType), let element = issue.element,
               systemBarItems.contains(element.identifier) {
                return true
            }
            if issue.auditType == .contrast, let element = issue.element, element.elementType == .staticText,
               let colours = try? ScreenColours(app) {
                if element.frame.minY < barBottom { return true }
                let frame = element.frame.insetBy(dx: 1, dy: 1)
                let isSecondary = backgrounds.contains {
                    colours.foreground(in: frame, on: $0).distance(to: secondary) <= 8
                }
                if isSecondary { return true }
            }
            XCTFail("\(context): \(issue.auditType) on \(issue.element?.identifier ?? "-") "
                + "(\(issue.element?.label ?? "-")): \(issue.detailedDescription)")
            return true
        }
    }
}
