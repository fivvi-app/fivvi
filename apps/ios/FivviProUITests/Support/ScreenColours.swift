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

    /// The WCAG contrast ratio between this colour and `other` (1 to 21).
    func contrast(with other: RGB) -> Double {
        func luminance(_ rgb: RGB) -> Double {
            func linear(_ channel: Int) -> Double {
                let value = Double(channel) / 255
                return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue)
        }
        let (lighter, darker) = (max(luminance(self), luminance(other)), min(luminance(self), luminance(other)))
        return (lighter + 0.05) / (darker + 0.05)
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

    /// Every device pixel in `rect` (points), left to right, top to bottom.
    private func colours(in rect: CGRect) -> [RGB] {
        var found: [RGB] = []
        for top in stride(from: rect.minY, to: rect.maxY, by: 1 / scale) {
            for left in stride(from: rect.minX, to: rect.maxX, by: 1 / scale) {
                found.append(colour(at: CGPoint(x: left, y: top)))
            }
        }
        return found
    }

    /// The colour in `rect` that differs most from `background`: for text on a flat background, the text colour
    /// (anti-aliased edges are blends, the strokes' insides are the colour itself).
    func foreground(in rect: CGRect, on background: RGB) -> RGB {
        colours(in: rect).reduce(background) { furthest, colour in
            colour.distance(to: background) > furthest.distance(to: background) ? colour : furthest
        }
    }

    /// The colour that covers most of `rect`: for text, the background actually drawn behind it (the text strokes
    /// are a small part of the frame).
    func dominant(in rect: CGRect) -> RGB {
        var counts: [Int: Int] = [:]
        for colour in colours(in: rect) {
            counts[(colour.red << 16) | (colour.green << 8) | colour.blue, default: 0] += 1
        }
        let key = counts.max { $0.value < $1.value }?.key ?? 0
        return RGB(red: (key >> 16) & 255, green: (key >> 8) & 255, blue: key & 255)
    }
}
