import XCTest

/// What a person sees of the tab bar: whether it is full (every tab in it) or shrunk to the selected tab, as
/// `tabBarMinimizeBehavior(.onScrollDown)` makes it while the content scrolls down.
///
/// Everything is read through snapshots and guarded matches: a tab or the bar can be gone for a moment while the bar
/// animates, and a read that fails is "unknown", never "narrower". A bar that is not there at all, or one without its
/// selected tab, is neither full nor shrunk.
@MainActor
struct TabBarProbe {
    let tabBar: XCUIElement
    private let selected: XCUIElementQuery
    private let other: XCUIElementQuery
    /// The widths of the selected tab and of the bar when it is full.
    private let fullTab: CGFloat
    private let fullBar: CGFloat

    /// The bar in its full state: `selected` is the label of the selected tab, `other` that of another one. Waits for
    /// the bar to settle and for the other tab to be there to touch; nil when it never is.
    static func full(of tabBar: XCUIElement, selected: String, other: String, timeout: TimeInterval) -> TabBarProbe? {
        let tabs = tabBar.buttons
        let selectedTab = tabs.matching(NSPredicate(format: "label == %@", selected))
        let otherTab = tabs.matching(NSPredicate(format: "label == %@", other))
        var widths: (tab: CGFloat, bar: CGFloat)?
        // A read that finds no bar yet, or no tab to touch, is nothing to settle on: it returns nil, never a value that
        // three reads could agree on (#679).
        let settled = Polling.settled(timeout: timeout, interval: 0.2, reads: 3) { () -> [CGFloat]? in
            guard let tab = Self.width(of: selectedTab), let bar = Self.width(of: tabBar),
                Self.canBeHit(otherTab)
            else { return nil }
            widths = (tab, bar)
            return [tab, bar]
        }
        guard settled, let widths else { return nil }
        return TabBarProbe(
            tabBar: tabBar, selected: selectedTab, other: otherTab, fullTab: widths.tab, fullBar: widths.bar
        )
    }

    private init(
        tabBar: XCUIElement, selected: XCUIElementQuery, other: XCUIElementQuery, fullTab: CGFloat, fullBar: CGFloat
    ) {
        self.tabBar = tabBar
        self.selected = selected
        self.other = other
        self.fullTab = fullTab
        self.fullBar = fullBar
    }

    /// The width of the widest match of `query`; nil when there is none or a read failed.
    private static func width(of query: XCUIElementQuery) -> CGFloat? {
        query.allElementsBoundByIndex.compactMap { try? $0.snapshot().frame.width }.max()
    }

    private static func width(of element: XCUIElement) -> CGFloat? {
        guard element.exists else { return nil }
        return try? element.snapshot().frame.width
    }

    /// Some match is there and hittable, checked match by match (`exists` first, so one that goes while the bar
    /// animates counts as gone).
    private static func canBeHit(_ query: XCUIElementQuery) -> Bool {
        (0..<query.count).contains { index in
            let element = query.element(boundBy: index)
            return element.exists && element.isHittable
        }
    }

    /// Every tab is in the bar, at the width it had at the start.
    var isFull: Bool {
        guard let tab = Self.width(of: selected), let bar = Self.width(of: tabBar) else { return false }
        return Self.canBeHit(other) && tab >= fullTab - 1 && bar >= fullBar - 1
    }

    /// The bar is there with its selected tab, which a person can touch, and the other tab can't be touched any more
    /// (it is gone or hidden), or the selected tab or the bar itself is narrower than it was. A full bar is none of
    /// these, and neither is a bar that is gone or slid off the screen.
    var isShrunk: Bool {
        guard let tab = Self.width(of: selected), tabBar.exists, Self.canBeHit(selected) else { return false }
        let bar = Self.width(of: tabBar)
        return !Self.canBeHit(other) || tab < fullTab - 1 || (bar ?? fullBar) < fullBar - 1
    }
}

/// How a person scrolls: the ways a finger moves a list down the screen.
enum ScrollGesture: String, CaseIterable {
    /// A flick at the speed `swipeUp()` has: what a person does most of the time.
    case flick
    case fastFlick = "fast flick"
    /// The finger stays on the glass and drags the content, with no fling.
    case drag

    @MainActor
    func scrollDown(_ scroll: XCUIElement) {
        switch self {
        case .flick: scroll.swipeUp()
        case .fastFlick: scroll.swipeUp(velocity: .fast)
        case .drag:
            let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            start.press(forDuration: 0.1, thenDragTo: end)
        }
    }
}
