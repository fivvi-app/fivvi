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
    /// not counted. The text may be a static text or the label of a button (the sign-in's language options). A tonal
    /// pill button is accepted when its label on screen is the link text token on the tonal fill at 4.5:1 or more.
    ///
    /// `systemBarItems` are the system's own glass bar buttons and bar title of a sheet (the name sheet's *Annuleren*,
    /// *Opslaan* and *Naam wijzigen*). The audit flags them whatever the colour of their text (*Annuleren* with the accent
    /// and with the label colour; black on the glass is flagged too, so it measures the glass and not the text), so a
    /// contrast issue on them is not counted, nor is the Dynamic Type one (a bar item's text doesn't scale with the text
    /// size, which is the system's). The "may be clipped" one is not counted only for `systemBarTitle`, the title in the
    /// bar. Any other issue fails, on those ids too. A contrast issue on a disabled control is not counted either (WCAG
    /// 1.4.3 leaves inactive components out).
    func auditWithContrast(
        _ app: XCUIApplication, style: UIUserInterfaceStyle, _ context: String,
        systemBarItems: Set<String> = [], systemBarTitle: String? = nil
    ) throws {
        let secondary = RGB(Tokens.Colors.textSecondary, in: style)
        let bar = app.navigationBars.firstMatch
        let barBottom = bar.exists ? bar.frame.maxY : 0 // sign-in has no bar
        let backgrounds = [RGB(Tokens.Colors.bgCanvas, in: style), RGB(Tokens.Colors.bgSurface, in: style)]
        try app.performAccessibilityAudit(
            for: [.textClipped, .dynamicType, .hitRegion, .contrast]
        ) { issue in
            if issue.auditType == .textClipped, let field = issue.element, field.elementType == .textField,
               let typed = field.value as? String, !typed.isEmpty, typed != field.placeholderValue {
                return true
            }
            if let element = issue.element {
                let isBarItem = systemBarItems.contains(element.identifier)
                if isBarItem, [.contrast, .dynamicType].contains(issue.auditType) { return true }
                if issue.auditType == .textClipped, element.identifier == systemBarTitle { return true }
                // A control that is switched off (the code step's *Inloggen* until six digits are typed, drawn at
                // 40 %) is an inactive component, which WCAG 1.4.3 leaves out of the contrast rule.
                if issue.auditType == .contrast, !element.isEnabled { return true }
            }
            if issue.auditType == .contrast, let element = issue.element,
               [.staticText, .button].contains(element.elementType),
               let colours = try? ScreenColours(app) {
                if element.frame.minY < barBottom { return true }
                let frame = element.frame.insetBy(dx: 1, dy: 1)
                let isSecondary = backgrounds.contains {
                    colours.foreground(in: frame, on: $0).distance(to: secondary) <= 8
                }
                if isSecondary { return true }
                // The tonal pill's label (`PillButtonKind.tonal`): the audit flags it, so measure it here: the link
                // text token on the tonal fill, which must be the pixels on screen and pass 4.5:1.
                if element.elementType == .button {
                    let fill = RGB(Tokens.Colors.actionTonalBg, in: style)
                    let label = element.frame.insetBy(dx: element.frame.width * 0.2, dy: element.frame.height * 0.25)
                    let text = colours.foreground(in: label, on: fill)
                    if text.distance(to: RGB(Tokens.Colors.textLink, in: style)) <= 8,
                       text.contrast(with: fill) >= 4.5 { return true }
                }
            }
            XCTFail("\(context): \(issue.auditType) on \(issue.element?.identifier ?? "-") "
                + "(\(issue.element?.label ?? "-")): \(issue.detailedDescription)")
            return true
        }
    }
}
