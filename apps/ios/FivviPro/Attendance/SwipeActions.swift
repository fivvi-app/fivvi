import Observation
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

/// Which row of a list has its actions open: opening one closes the one before it, and a scroll closes it (the system's
/// swipe actions do the same).
@MainActor
@Observable
final class SwipeCoordinator {
    fileprivate(set) var openID: String?

    func closeAll() { openID = nil }
}

/// The system's swipe actions on a row of an `InsetGroup` (F025: *Aanwezig* on the leading side and *Niet verschenen* on
/// the trailing side of Vandaag's nudge, TD-01). The list is not a `List`, so the system's `swipeActions` are not there;
/// this draws the same: dragging the row rightward shows the leading actions behind it, leftward the trailing ones, full
/// height, and a drag past half of them (or a quick one) keeps them open. A tap on an action performs it and closes the
/// row; a tap on the open row only closes it. Vertical drags are left to the scroll view (the pan only begins sideways,
/// and only toward a side that has actions; then it takes the touch from the row's button). The actions stay out of
/// VoiceOver and out of reach until the row is open: VoiceOver has them as custom actions of the row.
struct SwipeActionsRow<Content: View>: View {
    /// The row's own ID, for the list's one open row (`SwipeCoordinator`).
    let id: String
    let leading: [SwipeAction]
    let trailing: [SwipeAction]
    @ViewBuilder let content: Content
    @Environment(SwipeCoordinator.self) private var coordinator: SwipeCoordinator?
    @State private var offset: CGFloat = 0
    @State private var side: Side?
    @ScaledMetric(relativeTo: .body) private var actionWidth: CGFloat = 96

    private enum Side { case leading, trailing }

    private var leadingWidth: CGFloat { actionWidth * CGFloat(leading.count) }
    private var trailingWidth: CGFloat { actionWidth * CGFloat(trailing.count) }
    private var isOpen: Bool { side != nil }

    var body: some View {
        content
            .allowsHitTesting(!isOpen)
            .background(Tokens.Colors.bgSurface)
            .overlay { if isOpen { Color.clear.contentShape(Rectangle()).onTapGesture { close() } } }
            .offset(x: offset)
            .background {
                ZStack {
                    actionsView(leading, on: .leading).frame(maxWidth: .infinity, alignment: .leading)
                    actionsView(trailing, on: .trailing).frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .gesture(drag)
            .animation(.snappy(duration: 0.25), value: side)
            .onChange(of: coordinator?.openID) { _, open in
                if open != id, isOpen { close(announce: false) }
            }
    }

    private func actionsView(_ actions: [SwipeAction], on edge: Side) -> some View {
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
        .opacity(edge == .leading ? (offset > 0 ? 1 : 0) : (offset < 0 ? 1 : 0))
        .allowsHitTesting(side == edge)
        .accessibilityHidden(side != edge)
    }

    /// Where the row rests: closed, or pulled out to the side that is open.
    private var restingOffset: CGFloat {
        switch side {
        case .leading: leadingWidth
        case .trailing: -trailingWidth
        case nil: 0
        }
    }

    private var drag: HorizontalPan {
        HorizontalPan(
            allows: { velocity in isOpen || (velocity > 0 ? !leading.isEmpty : !trailing.isEmpty) },
            onChange: { translation in
                let furthest = leading.isEmpty ? 0 : leadingWidth + 24
                let nearest = trailing.isEmpty ? 0 : -trailingWidth - 24
                offset = min(furthest, max(nearest, restingOffset + translation))
            },
            onEnd: { translation, velocity in
                // Where the row would come to rest: its place plus what its speed carries it on.
                let projected = restingOffset + translation + velocity * 0.15
                if projected > leadingWidth / 2, !leading.isEmpty {
                    open(.leading)
                } else if projected < -trailingWidth / 2, !trailing.isEmpty {
                    open(.trailing)
                } else {
                    close()
                }
            }
        )
    }

    private func open(_ edge: Side) {
        withAnimation(.snappy(duration: 0.25)) {
            side = edge
            offset = restingOffset
        }
        coordinator?.openID = id
    }

    private func close(announce: Bool = true) {
        withAnimation(.snappy(duration: 0.25)) {
            side = nil
            offset = 0
        }
        if announce, coordinator?.openID == id { coordinator?.closeAll() }
    }
}

/// A pan that begins only for a sideways move toward a side that has actions: a vertical one is the scroll view's. Once
/// it has begun it takes the touch from the row's button, so a swipe is not also a tap on the row.
private struct HorizontalPan: UIGestureRecognizerRepresentable {
    /// Whether the row has anything to reveal for a move at this sideways speed (positive: rightward).
    let allows: (CGFloat) -> Bool
    /// The sideways distance moved so far.
    let onChange: (CGFloat) -> Void
    /// The distance when the finger lifted, and its speed sideways in points per second.
    let onEnd: (CGFloat, CGFloat) -> Void

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var allows: (CGFloat) -> Bool = { _ in true }

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y) && allows(velocity.x)
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        let coordinator = Coordinator()
        coordinator.allows = allows
        return coordinator
    }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func updateUIGestureRecognizer(_ recognizer: UIPanGestureRecognizer, context: Context) {
        context.coordinator.allows = allows
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
