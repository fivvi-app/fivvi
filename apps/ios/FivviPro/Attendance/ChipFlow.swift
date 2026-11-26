import SwiftUI

/// Chips in a row that wraps onto the next line when the width runs out (the prototype's `.chips`). Each chip is offered at
/// most the available width, so a chip longer than a line (at the accessibility text sizes) wraps its text instead of
/// running off the screen.
struct ChipFlow: Layout {
    var spacing: CGFloat

    /// Where each chip goes and how large it is, and the size of them all.
    private struct Arrangement {
        var frames: [CGRect] = []
        var size = CGSize.zero
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let placed = arrange(width: bounds.width, subviews)
        for (subview, frame) in zip(subviews, placed.frames) {
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(frame.size)
            )
        }
    }

    private func arrange(width: CGFloat, _ subviews: Subviews) -> Arrangement {
        var result = Arrangement()
        var left: CGFloat = 0, top: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: width.isFinite ? width : nil, height: nil))
            if left > 0, left + size.width > width {
                left = 0
                top += rowHeight + spacing
                rowHeight = 0
            }
            result.frames.append(CGRect(origin: CGPoint(x: left, y: top), size: size))
            left += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, left - spacing)
        }
        result.size = CGSize(width: widest, height: top + rowHeight)
        return result
    }
}
