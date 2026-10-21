import CoreGraphics

/// The minimum touch target: 44 × 44 pt (HIG; `size.control.ios` in the design tokens).
enum TouchTarget {
    static let minimum: CGFloat = 44

    /// Whether an element of `size` points is at least `minimum` wide and high on a screen of `scale` pixels per point.
    /// Compared in whole device pixels: layout puts frames on the pixel grid, but XCTest reports them in points with
    /// floating-point error (132 px at 3x comes back as 43.99999999999994 pt). A frame one pixel short still fails.
    static func isMet(by size: CGSize, scale: CGFloat) -> Bool {
        let pixels = { (points: CGFloat) in (points * scale).rounded() }
        return pixels(size.width) >= pixels(minimum) && pixels(size.height) >= pixels(minimum)
    }
}
