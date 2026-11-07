import SwiftUI
import XCTest
import FivviDesignTokens

@testable import FivviPro

/// E020 AC14: the building blocks drawn, in light and dark: their sizes and the colours of their pixels, against the
/// design tokens. Hosted in the app like the other unit tests, so none of it costs UI-test time. Texts are samples;
/// the blocks take their texts as parameters.
@MainActor
final class KitRenderedTests: XCTestCase {
    private let styles: [UIUserInterfaceStyle] = [.light, .dark]
    private let sample = "Anna de Vries"
    private let longSample = "Aanwezig"

    private func mode(_ style: UIUserInterfaceStyle) -> String { style == .dark ? "dark" : "light" }

    /// The pixel at `point` is `token` in `style`.
    private func assertPixel(
        _ view: RenderedView, at point: CGPoint, is token: Color, _ style: UIUserInterfaceStyle, _ message: String
    ) {
        assertColour(view.colour(at: point), is: Pixel(token, in: style), "\(message) at \(point), \(mode(style))")
    }

    private func pixel(_ token: Color, _ style: UIUserInterfaceStyle) -> Pixel { Pixel(token, in: style) }

    // MARK: Card and inset group

    /// How far along a row 1 pt under the top edge the surface starts: the rounder the corner, the further.
    private func surfaceStart(_ view: RenderedView, _ style: UIUserInterfaceStyle) -> CGFloat? {
        let surface = pixel(Tokens.Colors.bgSurface, style)
        return stride(from: CGFloat(0), to: 60, by: 1.0 / 3).first { column in
            view.colour(at: CGPoint(x: column, y: 1)).distance(to: surface) <= colourTolerance
        }
    }

    /// A point 7 pt in from a corner is outside a radius of 26 (a radius of 24 or less would draw the surface there)
    /// and 11 pt in is inside it, so the two points tell 26 from every smaller radius. Along the row 1 pt under the top
    /// edge the surface starts at 20 pt (measured; 18.5 for a radius of 24, 21.5 for Android's 28), which tells 26 from
    /// every larger one.
    private func assertRounded26(_ view: RenderedView, _ name: String, _ style: UIUserInterfaceStyle) {
        let right = view.size.width
        let bottom = view.size.height
        for (horizontal, vertical) in [(CGFloat(1), CGFloat(1)), (-1, 1), (1, -1), (-1, -1)] {
            let edgeX = horizontal > 0 ? CGFloat(0) : right
            let edgeY = vertical > 0 ? CGFloat(0) : bottom
            let outside = CGPoint(x: edgeX + horizontal * 7, y: edgeY + vertical * 7)
            let inside = CGPoint(x: edgeX + horizontal * 11, y: edgeY + vertical * 11)
            assertPixel(view, at: outside, is: Tokens.Colors.bgCanvas, style, "\(name) outside the corner")
            assertPixel(view, at: inside, is: Tokens.Colors.bgSurface, style, "\(name) inside the corner")
        }
        let start = surfaceStart(view, style) ?? .infinity
        XCTAssertEqual(start, 20, accuracy: 0.8, "\(name): the surface starts 20 pt along the top row, \(mode(style))")
    }

    func test_E020_AC14_aCardIsRounded26() throws {
        for style in styles {
            let card = try RenderedView(Card { Text(sample).frame(height: 60) }, width: 300, style: style)
            assertRounded26(card, "card", style)
            let middle = CGPoint(x: 150, y: card.size.height / 2)
            assertPixel(card, at: middle, is: Tokens.Colors.bgSurface, style, "card surface")
        }
    }

    func test_E020_AC14_anInsetGroupIsRounded26WithSeparatorsInsetFromTheEdge() throws {
        for style in styles {
            let group = try RenderedView(
                InsetGroup {
                    InsetRow(title: sample)
                    InsetRow(title: sample)
                },
                width: 300, style: style
            )
            assertRounded26(group, "group", style)
            // The hairline between the rows starts 16 pt in: found in the middle, not in the first 8 pt.
            let line = pixel(Tokens.Colors.borderDefault, style)
            let middle = CGRect(x: 150, y: 50, width: 1, height: 4)
            XCTAssertTrue(group.contains(line, in: middle), "separator, \(mode(style))")
            let inset = CGRect(x: 4, y: 50, width: 8, height: 4)
            XCTAssertFalse(group.contains(line, in: inset), "no separator in the inset, \(mode(style))")
        }
    }

    // MARK: Buttons

    func test_E020_AC14_aPillButtonIs50PointsHigh() throws {
        for style in styles {
            let button = try RenderedView(
                Button {} label: { Text(sample) }.buttonStyle(.pill()).fixedSize(), width: 240, style: style
            )
            XCTAssertEqual(button.size.height, 50, "pill height, \(mode(style))")
            assertPixel(button, at: CGPoint(x: 120, y: 3), is: Tokens.Colors.actionPrimaryBg, style, "pill fill")
        }
    }

    func test_E020_AC14_stackedPillButtonsAre48PointsHighWith10Between() throws {
        for style in styles {
            let stack = try RenderedView(
                PillButtonStack {
                    Button {} label: { Text(sample) }.buttonStyle(.pill())
                    Button {} label: { Text(sample) }.buttonStyle(.pill(.tonal))
                    Button {} label: { Text(sample) }.buttonStyle(.pill(.destructive))
                },
                width: 300, style: style
            )
            XCTAssertEqual(stack.size.height, 3 * 48 + 2 * 10, "three buttons, two gaps, \(mode(style))")
            let fills = [Tokens.Colors.actionPrimaryBg, Tokens.Colors.actionTonalBg, Tokens.Colors.statusDangerBg]
            for (index, fill) in fills.enumerated() {
                let top = CGFloat(index) * 58
                // Equal width: the fill reaches across the stack at its middle.
                for column in [CGFloat(24), 150, 276] {
                    assertPixel(stack, at: CGPoint(x: column, y: top + 24), is: fill, style, "button \(index)")
                }
                guard index < 2 else { continue }
                for row in [top + 48.5, top + 53, top + 57.5] {
                    assertPixel(stack, at: CGPoint(x: 150, y: row), is: Tokens.Colors.bgCanvas, style, "gap")
                }
            }
        }
    }

    func test_E020_AC14_aRoundControlIsRoundAndAtLeast44Points() {
        for prominent in [false, true] {
            let size = RenderedView.fittingSize(
                of: RoundControl(systemImage: "plus", label: sample, prominent: prominent) {}
            )
            XCTAssertGreaterThanOrEqual(size.width, 44, "prominent \(prominent)")
            XCTAssertGreaterThanOrEqual(size.height, 44, "prominent \(prominent)")
            XCTAssertEqual(size.width, size.height, accuracy: 0.5, "a round control is as wide as it is high")
        }
    }

    // MARK: Status pill

    func test_E020_AC14_statusPillsUseTheirTintsAndTextColours() throws {
        for style in styles {
            for kind in StatusPillKind.allCases {
                let content = StatusPill(text: longSample, kind: kind).fixedSize()
                let pill = try RenderedView(content, width: 120, style: style)
                let tint = pixel(kind.background, style)
                let middle = CGPoint(x: 5, y: pill.size.height / 2)
                assertPixel(pill, at: middle, is: kind.background, style, "\(kind) tint")
                let text = CGRect(x: 10, y: 4, width: 40, height: pill.size.height - 8)
                let drawn = pill.foreground(in: text, on: tint)
                assertColour(drawn, is: pixel(kind.foreground, style), "\(kind) text, \(mode(style))")
                // A pill is a capsule: its corners show the canvas.
                assertPixel(pill, at: CGPoint(x: 1, y: 1), is: Tokens.Colors.bgCanvas, style, "\(kind) corner")
            }
        }
    }

    // MARK: Next card

    private func nextCard<Actions: View>(_ tone: NextCardTone, @ViewBuilder actions: () -> Actions) -> some View {
        NextCard(tone: tone, caption: longSample, title: sample, subtitle: longSample, actions: actions)
    }

    func test_E020_AC14_theNextCardIsAGradientInOneHueWithTextOnIt() throws {
        for style in styles {
            for tone in NextCardTone.allCases {
                let content = nextCard(tone) { NextCardButton(title: sample) {} }
                let card = try RenderedView(content, width: 340, style: style)
                let top = card.colour(at: CGPoint(x: 170, y: 3))
                let bottom = card.colour(at: CGPoint(x: 170, y: card.size.height - 3))
                // Within a few steps of the token's top and bottom: it is the tone's gradient, not another one.
                let name = "\(tone), \(mode(style))"
                XCTAssertLessThanOrEqual(top.distance(to: pixel(tone.gradient[0], style)), 8, "top of \(name)")
                XCTAssertLessThanOrEqual(bottom.distance(to: pixel(tone.gradient[1], style)), 8, "bottom of \(name)")
                XCTAssertGreaterThan(top.distance(to: bottom), 0, "darker at the bottom of \(name)")
                // The caption, on the gradient where it sits, is the tone's text colour.
                let ground = card.colour(at: CGPoint(x: 6, y: 26))
                let caption = CGRect(x: 18, y: 18, width: 80, height: 14)
                let drawn = card.foreground(in: caption, on: ground)
                assertColour(drawn, is: pixel(tone.text, style), "caption of \(name)")
                // Radius 26: 7 pt in from the corner is outside, 11 pt in is the gradient.
                assertPixel(card, at: CGPoint(x: 7, y: 7), is: Tokens.Colors.bgCanvas, style, "\(tone) corner")
                let inside = card.colour(at: CGPoint(x: 11, y: 11))
                XCTAssertGreaterThan(inside.distance(to: pixel(Tokens.Colors.bgCanvas, style)), 40, "inside \(name)")
            }
        }
    }

    /// Where a view's top sits in the coordinate space named "card", written when it is laid out.
    private final class Top { var minY: CGFloat? }

    func test_E020_AC14_theNextCardsActionsAre48PointsHighAnd16PointsBelowTheText() throws {
        XCTAssertEqual(RenderedView.fittingSize(of: NextCardButton(title: sample) {}).height, 48)
        let icon = RenderedView.fittingSize(of: NextCardIconButton(systemImage: "plus", label: sample) {})
        XCTAssertEqual(icon.width, 48)
        XCTAssertEqual(icon.height, 48)
        // In the card: the card grows by exactly the actions' height...
        let thin = try RenderedView(nextCard(.accent) { Color.clear.frame(width: 10, height: 1) }, width: 340)
        let withButton = try RenderedView(nextCard(.accent) { NextCardButton(title: sample) {} }, width: 340)
        XCTAssertEqual(withButton.size.height - thin.size.height, 47, accuracy: 1)
        // ...and the actions start 16 pt under the text, which has the card's padding of 18 above it.
        let top = Top()
        _ = try RenderedView(
            nextCard(.accent) {
                Color.clear.frame(width: 10, height: 1)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named("card")).minY } action: { top.minY = $0 }
            }
            .coordinateSpace(name: "card"),
            width: 340
        )
        let text = try RenderedView(
            VStack(alignment: .leading, spacing: Tokens.Spacing.space1) {
                Text(longSample).font(.system(Tokens.TextStyle.footnote, weight: .semibold)).textCase(.uppercase)
                // 24 pt, as a literal: the reference doesn't use the constant it checks.
                Text(sample).font(.system(size: 24, weight: .bold))
                Text(longSample).font(.system(Tokens.TextStyle.subhead))
            },
            width: 304
        )
        XCTAssertEqual(try XCTUnwrap(top.minY), 18 + text.size.height + 16, accuracy: 1)
    }

    // MARK: Field

    func test_E020_AC14_aFieldWithAnErrorIsRedWithAWarningIconAndTheMessageUnderIt() throws {
        for style in styles {
            let view = try RenderedView(
                InsetGroup {
                    FormField(label: sample, error: longSample) { TextField(sample, text: .constant("")) }
                    FormField(label: sample) { TextField(sample, text: .constant("")) }
                },
                width: 300, style: style
            )
            let tint = pixel(Tokens.Colors.statusDangerBg, style)
            let surface = pixel(Tokens.Colors.bgSurface, style)
            // The first field's background is the danger tint, the second field's is the card.
            assertPixel(view, at: CGPoint(x: 8, y: 30), is: Tokens.Colors.statusDangerBg, style, "invalid field")
            let lastRow = view.size.height - 30
            assertPixel(view, at: CGPoint(x: 8, y: lastRow), is: Tokens.Colors.bgSurface, style, "valid field")
            // The message sits under the field, at the bottom of the first field, an icon in front of it.
            let end = try XCTUnwrap(
                (0..<Int(view.size.height)).first { row in
                    view.colour(at: CGPoint(x: 8, y: CGFloat(row))).distance(to: surface) <= colourTolerance
                },
                "the tinted field ends"
            )
            let rowTop = CGFloat(end) - 12 - 15
            let icon = CGRect(x: 16, y: rowTop, width: 14, height: 13)
            let danger = pixel(Tokens.Colors.statusDangerFg, style)
            XCTAssertTrue(view.contains(danger, in: icon), "warning icon, \(mode(style))")
            let message = CGRect(x: 36, y: rowTop, width: 40, height: 13)
            assertColour(
                view.foreground(in: message, on: tint), is: pixel(Tokens.Colors.statusDangerText, style),
                "message, \(mode(style))"
            )
        }
    }

    // MARK: Toast

    func test_E020_AC14_aWarningToastShowsADangerIconAndASuccessToastASuccessIcon() throws {
        for style in styles {
            let kinds = [(ToastKind.warning, Tokens.Colors.statusDangerFg), (.success, Tokens.Colors.statusSuccessFg)]
            for (kind, token) in kinds {
                let message = ToastMessage(kind: kind, text: sample)
                let toast = try RenderedView(ToastView(message: message).fixedSize(), width: 300, style: style)
                let icon = CGRect(x: 18, y: 0, width: 24, height: toast.size.height)
                XCTAssertTrue(toast.contains(pixel(token, style), in: icon), "\(kind) icon, \(mode(style))")
            }
        }
    }
}
