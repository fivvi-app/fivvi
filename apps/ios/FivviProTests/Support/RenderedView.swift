import SwiftUI
import UIKit
import XCTest
import FivviDesignTokens

/// A colour as 8-bit sRGB, the way a rendered view shows it.
struct Pixel: Equatable, CustomStringConvertible {
    let red: Int
    let green: Int
    let blue: Int

    /// `colour` (a design token) as it resolves in light or dark mode.
    init(_ colour: Color, in style: UIUserInterfaceStyle) {
        let resolved = UIColor(colour).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let byte = { (channel: CGFloat) in Int((channel * 255).rounded()) }
        self.init(red: byte(red), green: byte(green), blue: byte(blue))
    }

    init(red: Int, green: Int, blue: Int) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    /// The largest difference in one channel.
    func distance(to other: Pixel) -> Int {
        max(abs(red - other.red), abs(green - other.green), abs(blue - other.blue))
    }

    var description: String { String(format: "#%02X%02X%02X", red, green, blue) }
}

/// A SwiftUI view laid out and drawn in a window of its own, in light or dark mode, for tests of what a person sees:
/// its size and the colours of its pixels, addressed in points from the top left. It runs in the unit tests, hosted in
/// the app, so it costs none of the UI tests' time. System glass is not drawn reliably outside a real screen; check its
/// size, not its pixels.
@MainActor
struct RenderedView {
    /// The size the view takes at `width` points (and the default text size).
    let size: CGSize
    private let pixels: [UInt8]
    private let pixelsWide: Int
    private let pixelsHigh: Int
    private let scale: CGFloat = 3

    /// Lays `view` out at `width` points on `canvas`, in `style`, and draws it.
    init<Content: View>(
        _ view: Content, width: CGFloat, style: UIUserInterfaceStyle = .light, canvas: Color = Tokens.Colors.bgCanvas
    ) throws {
        let fitting = UIHostingController(rootView: view).sizeThatFits(
            in: CGSize(width: width, height: .greatestFiniteMagnitude)
        )
        size = CGSize(width: width, height: fitting.height.rounded(.up))
        // The mode and the canvas are SwiftUI's own: a colour converted to a UIColor loses its dark value, and a
        // window outside a scene doesn't pass its trait on. No safe area pushes the view down.
        let scheme: ColorScheme = style == .dark ? .dark : .light
        let host = UIHostingController(
            rootView: view
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .background(canvas)
                .environment(\.colorScheme, scheme)
                .ignoresSafeArea()
        )
        host.safeAreaRegions = []
        host.overrideUserInterfaceStyle = style
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.overrideUserInterfaceStyle = style
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        // SwiftUI draws on the next turns of the run loop; without them the snapshot is of an empty view.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.3))
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        let box = CGRect(origin: .zero, size: size)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            host.view.drawHierarchy(in: box, afterScreenUpdates: true)
        }
        let bitmap = try XCTUnwrap(image.cgImage, "the view has no bitmap")
        let wide = bitmap.width
        let high = bitmap.height
        var data = [UInt8](repeating: 0, count: wide * high * 4)
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let drawn: Bool = data.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress, width: wide, height: high, bitsPerComponent: 8,
                bytesPerRow: wide * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(bitmap, in: CGRect(x: 0, y: 0, width: wide, height: high))
            return true
        }
        XCTAssertTrue(drawn, "could not read the pixels")
        pixelsWide = wide
        pixelsHigh = high
        pixels = data
        window.isHidden = true
    }

    /// The size a view takes when it can have any size (a fixed-size view's own).
    static func fittingSize<Content: View>(of view: Content) -> CGSize {
        UIHostingController(rootView: view).sizeThatFits(
            in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        )
    }

    /// Whether some pixel in `rect` is `colour`, give or take the tolerance.
    func contains(_ colour: Pixel, in rect: CGRect) -> Bool {
        for top in stride(from: rect.minY, to: rect.maxY, by: 1 / scale) {
            for left in stride(from: rect.minX, to: rect.maxX, by: 1 / scale)
            where self.colour(at: CGPoint(x: left, y: top)).distance(to: colour) <= colourTolerance {
                return true
            }
        }
        return false
    }

    /// The colour at a point.
    func colour(at point: CGPoint) -> Pixel {
        let column = min(max(Int(point.x * scale), 0), pixelsWide - 1)
        let row = min(max(Int(point.y * scale), 0), pixelsHigh - 1)
        let offset = (row * pixelsWide + column) * 4
        return Pixel(red: Int(pixels[offset]), green: Int(pixels[offset + 1]), blue: Int(pixels[offset + 2]))
    }

    /// The colour in `rect` that differs most from `background`: for text on a flat background, the text colour.
    func foreground(in rect: CGRect, on background: Pixel) -> Pixel {
        var furthest = background
        for top in stride(from: rect.minY, to: rect.maxY, by: 1 / scale) {
            for left in stride(from: rect.minX, to: rect.maxX, by: 1 / scale) {
                let candidate = colour(at: CGPoint(x: left, y: top))
                if candidate.distance(to: background) > furthest.distance(to: background) { furthest = candidate }
            }
        }
        return furthest
    }
}

/// How far (per 8-bit channel) a drawn colour may be from its token: colour conversion rounds.
let colourTolerance = 4

@MainActor
func assertColour(
    _ actual: Pixel, is expected: Pixel, _ message: String, file: StaticString = #filePath, line: UInt = #line
) {
    XCTAssertLessThanOrEqual(
        actual.distance(to: expected), colourTolerance, "\(message): \(actual), expected \(expected)", file: file,
        line: line
    )
}
