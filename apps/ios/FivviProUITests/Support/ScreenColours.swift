import SwiftUI
import UIKit
import XCTest

/// A colour as 8-bit sRGB, the way the screen shows it.
struct RGB: Equatable, CustomStringConvertible {
    let red: Int
    let green: Int
    let blue: Int

    /// `color` (a design token) as it resolves in light or dark mode.
    init(_ color: Color, in style: UIUserInterfaceStyle) {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
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
    func distance(to other: RGB) -> Int {
        max(abs(red - other.red), abs(green - other.green), abs(blue - other.blue))
    }

    var description: String { String(format: "#%02X%02X%02X", red, green, blue) }
}

extension XCUIApplication {
    /// A screenshot of the app and its device pixels per point: the bitmap's width over the window's in points.
    @MainActor func screenshotBitmap() throws -> (image: CGImage, scale: CGFloat) {
        let image = try XCTUnwrap(screenshot().image.cgImage, "the screenshot has no bitmap")
        return (image, CGFloat(image.width) / windows.firstMatch.frame.width)
    }
}

/// The pixels of a screenshot of the app, converted to sRGB, addressed in the points of element frames.
struct ScreenColours {
    private let pixels: [UInt8]
    private let width: Int
    private let height: Int
    private let scale: CGFloat

    @MainActor init(_ app: XCUIApplication) throws {
        let screenshot = try app.screenshotBitmap()
        let image = screenshot.image
        scale = screenshot.scale
        width = image.width
        height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let drawn: Bool = pixels.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                bytesPerRow: image.width * 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        XCTAssertTrue(drawn, "could not read the screenshot's pixels")
        self.pixels = pixels
    }

    /// The colour at a point.
    func colour(at point: CGPoint) -> RGB {
        let column = min(max(Int(point.x * scale), 0), width - 1)
        let row = min(max(Int(point.y * scale), 0), height - 1)
        let offset = (row * width + column) * 4
        return RGB(red: Int(pixels[offset]), green: Int(pixels[offset + 1]), blue: Int(pixels[offset + 2]))
    }

    /// The colour in `rect` that differs most from `background`: for text on a flat background, the text colour
    /// (anti-aliased edges are blends, the strokes' insides are the colour itself).
    func foreground(in rect: CGRect, on background: RGB) -> RGB {
        var furthest = background
        for top in stride(from: rect.minY, to: rect.maxY, by: 1 / scale) {
            for left in stride(from: rect.minX, to: rect.maxX, by: 1 / scale) {
                let colour = colour(at: CGPoint(x: left, y: top))
                if colour.distance(to: background) > furthest.distance(to: background) { furthest = colour }
            }
        }
        return furthest
    }
}
