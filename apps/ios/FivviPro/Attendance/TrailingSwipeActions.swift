import SwiftUI
import FivviDesignTokens

/// One action behind a swiped row: a word on a solid fill, as the system's swipe actions are drawn.
struct SwipeAction: Identifiable {
    let title: String
    /// What VoiceOver reads for it.
    let label: String
    let fill: Color
    let foreground: Color
    let identifier: String
    let perform: () -> Void

    var id: String { identifier }
}

/// The system's trailing swipe on a row of an `InsetGroup` (F025: *Aanwezig* and *Niet verschenen* on Vandaag's nudge). The
/// list is not a `List`, so the system's `swipeActions` are not there; this draws the same: dragging the row to the
/// leading side shows the actions behind it, full height, at the trailing edge, and a drag past half of them (or a quick
/// one) keeps them open. A tap on an action performs it and closes the row; a tap on the open row only closes it. Vertical
/// drags are left to the scroll view (the pan only begins sideways, and then it takes the touch from the row's button).
/// The actions stay out of VoiceOver and out of reach until the row is open: VoiceOver has them as custom actions of
/// the row.
struct TrailingSwipeActions<Content: View>: View {
    let actions: [SwipeAction]
    @ViewBuilder let content: Content
    @State private var offset: CGFloat = 0
    @State private var isOpen = false
    @ScaledMetric(relativeTo: .body) private var actionWidth: CGFloat = 96

    private var revealed: CGFloat { actionWidth * CGFloat(actions.count) }

    var body: some View {
        content
            .allowsHitTesting(!isOpen)
            .background(Tokens.Colors.bgSurface)
            .overlay { if isOpen { Color.clear.contentShape(Rectangle()).onTapGesture { close() } } }
            .offset(x: offset)
            .background(alignment: .trailing) { actionsView }
            .gesture(drag)
            .animation(.snappy(duration: 0.25), value: isOpen)
            .onChange(of: actions.isEmpty) { _, none in if none { close() } }
    }

    private var actionsView: some View {
        HStack(spacing: 0) {
            ForEach(actions) { action in
                Button {
                    close()
                    action.perform()
                } label: {
                    Text(action.title)
                        .font(.system(Tokens.TextStyle.subhead, weight: .semibold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(action.foreground)
                        .padding(.horizontal, Tokens.Spacing.space2)
                        .frame(width: actionWidth)
                        .frame(maxHeight: .infinity)
                        .background(action.fill)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(action.label)
                .accessibilityIdentifier(action.identifier)
            }
        }
        .opacity(offset < 0 ? 1 : 0)
        .allowsHitTesting(isOpen)
        .accessibilityHidden(!isOpen)
    }

    private var drag: HorizontalPan {
        HorizontalPan(
            onChange: { translation in
                let start = isOpen ? -revealed : 0
                offset = min(0, max(-revealed - 24, start + translation))
            },
            onEnd: { translation, velocity in
                // Where the row would come to rest: its place plus what its speed carries it on.
                let projected = (isOpen ? -revealed : 0) + translation + velocity * 0.15
                if projected < -revealed / 2 { open() } else { close() }
            }
        )
    }

    private func open() {
        withAnimation(.snappy(duration: 0.25)) {
            offset = -revealed
            isOpen = true
        }
    }

    private func close() {
        withAnimation(.snappy(duration: 0.25)) {
            offset = 0
            isOpen = false
        }
    }
}

/// A pan that begins only for a sideways move: a vertical one is the scroll view's. Once it has begun it takes the touch
/// from the row's button, so a swipe is not also a tap on the row.
private struct HorizontalPan: UIGestureRecognizerRepresentable {
    /// The sideways distance moved so far.
    let onChange: (CGFloat) -> Void
    /// The distance when the finger lifted, and its speed sideways in points per second.
    let onEnd: (CGFloat, CGFloat) -> Void

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y)
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let translation = recognizer.translation(in: recognizer.view).x
        switch recognizer.state {
        case .changed: onChange(translation)
        case .ended, .cancelled: onEnd(translation, recognizer.velocity(in: recognizer.view).x)
        default: break
        }
    }
}
