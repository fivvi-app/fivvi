import SwiftUI

/// Chips in a row that wraps onto the next line when the width runs out (the prototype's `.chips`).
struct ChipFlow: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let placed = arrange(width: bounds.width, subviews)
        for (subview, origin) in zip(subviews, placed.origins) {
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, _ subviews: Subviews) -> (origins: [CGPoint], size: CGSize) {
        var origins: [CGPoint] = []
        var left: CGFloat = 0, top: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if left > 0, left + size.width > width {
                left = 0
                top += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: left, y: top))
            left += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, left - spacing)
        }
        return (origins, CGSize(width: widest, height: top + rowHeight))
    }
}
