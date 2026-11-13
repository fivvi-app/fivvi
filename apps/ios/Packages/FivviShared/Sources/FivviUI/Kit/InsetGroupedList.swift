import SwiftUI
import FivviDesignTokens

public enum InsetGroupStyle {
    /// A group's corner radius: the card radius (`radius.card`).
    public static let radius = Tokens.Radius.card
    /// How far a separator is inset from the group's leading edge, so it starts under the row's text.
    public static let separatorInset = Tokens.Spacing.space4
    /// The least a row is high.
    public static let rowMinHeight: CGFloat = 52
    /// The space above and below a row's content: with a line of body text it fills the least height, and a second
    /// line makes the row taller.
    public static let rowVerticalPadding: CGFloat = 11
}

/// An inset grouped list (E020 AC14, Calendar, Fitness and Health): a scroll view holding `InsetGroup`s, the way the
/// prototype draws lists. A screen's `LargeTitleHeader` goes in `header`, which has the full width; the groups sit in
/// the gutters. The grouped-grey canvas is behind the screen's navigation container, not on this scroll view
/// (`fivviCanvas()`, which `LargeTitleScreen` applies): a scroll view the system tracks for the tab bar and the bars'
/// edge effects is left as it is, with nothing wrapped around it.
public struct InsetGroupedList<Header: View, Content: View>: View {
    public let header: Header
    public let content: Content

    public init(@ViewBuilder header: () -> Header, @ViewBuilder content: () -> Content) {
        self.header = header()
        self.content = content()
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                VStack(alignment: .leading, spacing: Tokens.Spacing.space6) {
                    content
                }
                .padding(.horizontal, Tokens.Spacing.gutter)
            }
            .padding(.bottom, Tokens.Spacing.space6)
        }
    }
}

extension View {
    /// The grouped-grey canvas (`bgCanvas`) behind a screen, under the bars and the content: the background of the
    /// navigation container the screen is in. The screen's scroll view itself gets no `background`.
    public func fivviCanvas() -> some View {
        containerBackground(Tokens.Colors.bgCanvas, for: .navigation)
    }
}

extension InsetGroupedList where Header == EmptyView {
    public init(@ViewBuilder content: () -> Content) {
        self.init(header: { EmptyView() }, content: content)
    }
}

/// One group of an `InsetGroupedList`: rows in a card of radius 26, separated by hairlines inset from the leading edge,
/// with an optional small header above and a note below.
public struct InsetGroup<Content: View>: View {
    public init(
        header: String? = nil, headerIdentifier: String? = nil, footer: String? = nil,
        separatorInset: CGFloat = InsetGroupStyle.separatorInset, lazy: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.header = header
        self.headerIdentifier = headerIdentifier
        self.footer = footer
        self.separatorInset = separatorInset
        self.lazy = lazy
        self.content = content()
    }
    public var header: String?
    /// The header's accessibility identifier, for a screen with test ids for its group titles.
    public var headerIdentifier: String?
    public var footer: String?
    /// How far the separators start from the leading edge: the rows' text (`InsetGroupStyle.separatorInset`), or past
    /// an avatar or a mark in front of it (the prototype's `--inset`: 68 pt for a 40 pt avatar).
    public var separatorInset: CGFloat
    /// Whether the rows are made only when they come on screen (a `LazyVStack`), for a list that pages: a row's `.task`
    /// then runs when it is reached, not for every row at once. A short group of a few rows keeps the plain stack.
    public var lazy: Bool
    @ViewBuilder public let content: Content
    @Environment(\.displayScale) private var displayScale

    @ViewBuilder private func headerText(_ header: String) -> some View {
        let text = Text(header)
            .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
            .textCase(.uppercase)
            .foregroundStyle(Tokens.Colors.textSecondary)
            .padding(.horizontal, Tokens.Spacing.space5)
            .accessibilityAddTraits(.isHeader)
        if let headerIdentifier {
            text.accessibilityIdentifier(headerIdentifier)
        } else {
            text
        }
    }

    /// The rows with a hairline between them. A row keeps its own identity (not its place) when the rows change, so a
    /// row's `.task` runs again for a row that is new in the list, such as the last one after a search.
    @ViewBuilder private func separated(_ rows: SubviewsCollection) -> some View {
        ForEach(rows) { row in
            if row.id != rows.first?.id {
                Rectangle()
                    .fill(Tokens.Colors.borderDefault)
                    .frame(height: 1 / displayScale)
                    .padding(.leading, separatorInset)
            }
            row
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space2) {
            if let header {
                headerText(header)
            }
            Group(subviews: content) { rows in
                if lazy {
                    LazyVStack(spacing: 0) { separated(rows) }
                } else {
                    VStack(spacing: 0) { separated(rows) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Tokens.Colors.bgSurface,
                in: RoundedRectangle(cornerRadius: InsetGroupStyle.radius, style: .continuous)
            )
            .clipShape(RoundedRectangle(cornerRadius: InsetGroupStyle.radius, style: .continuous))
            if let footer {
                Text(footer)
                    .font(.system(Tokens.TextStyle.footnote))
                    .foregroundStyle(Tokens.Colors.textSecondary)
                    .padding(.horizontal, Tokens.Spacing.space5)
            }
        }
    }
}

/// A row of an `InsetGroup`: a title, an optional line under it, a value and a chevron on the trailing side. Wrap it in
/// a `Button` or a `NavigationLink` with `.buttonStyle(.insetRow)` to make it tappable.
public struct InsetRow: View {
    public init(title: String, subtitle: String? = nil, value: String? = nil, showsChevron: Bool = false) {
        self.title = title
        self.subtitle = subtitle
        self.value = value
        self.showsChevron = showsChevron
    }
    public let title: String
    public var subtitle: String?
    public var value: String?
    public var showsChevron = false

    public var body: some View {
        HStack(spacing: Tokens.Spacing.space3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(Tokens.TextStyle.body, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(Tokens.TextStyle.subhead))
                        .foregroundStyle(Tokens.Colors.textSecondary)
                }
            }
            Spacer(minLength: Tokens.Spacing.space2)
            if let value {
                Text(value)
                    .font(.system(Tokens.TextStyle.subhead))
                    .foregroundStyle(Tokens.Colors.textSecondary)
            }
            if showsChevron {
                Image(systemName: "chevron.forward")
                    .font(.system(Tokens.TextStyle.footnote, weight: .semibold))
                    .foregroundStyle(Tokens.Colors.fillDecorative)
                    .accessibilityHidden(true)
            }
        }
        .multilineTextAlignment(.leading)
        .insetRowLayout()
    }
}

extension View {
    /// The layout of a row of an `InsetGroup`: the side padding, the space above and below, the full width, the least
    /// height and the whole row as the touch area. `InsetRow` has it; a row with other content (a field, a switch, a
    /// mark and a role) takes it from here instead of copying it.
    public func insetRowLayout() -> some View {
        padding(.horizontal, Tokens.Spacing.space4)
            .padding(.vertical, InsetGroupStyle.rowVerticalPadding)
            .frame(maxWidth: .infinity, minHeight: InsetGroupStyle.rowMinHeight, alignment: .leading)
            .contentShape(Rectangle())
    }
}

/// A tappable row: the row's fill darkens a little while it is pressed.
public struct InsetRowButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Tokens.Colors.bgSubtle : Color.clear)
    }
}

extension ButtonStyle where Self == InsetRowButtonStyle {
    /// A row of an `InsetGroup` that can be tapped.
    public static var insetRow: InsetRowButtonStyle { InsetRowButtonStyle() }
}
