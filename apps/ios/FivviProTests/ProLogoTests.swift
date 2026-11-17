import UIKit
import XCTest

@testable import FivviPro

/// The Fivvi Pro day dial on the sign-in screens (E020 #629): the brand files `b2-pro` light and dark, as an image of
/// the app, unchanged and independent of the app icon.
final class ProLogoTests: XCTestCase {
    /// The image drawn in `style`, as a bitmap of `side` points at scale 1.
    private func render(_ style: UIUserInterfaceStyle, side: CGFloat = 100) throws -> UIImage {
        let image = try XCTUnwrap(
            UIImage(named: ProLogo.assetName, in: .main, compatibleWith: nil), "no \(ProLogo.assetName)"
        )
        let traits = UITraitCollection(userInterfaceStyle: style)
        let resolved = image.imageAsset?.image(with: traits) ?? image
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            resolved.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private struct Pixel {
        let red: Int
        let green: Int
        let blue: Int
    }

    /// The colour of the pixel `column`, `row` as 8-bit red, green and blue.
    private func pixel(of image: UIImage, column: Int, row: Int) throws -> Pixel {
        let cgImage = try XCTUnwrap(image.cgImage?.cropping(to: CGRect(x: column, y: row, width: 1, height: 1)))
        var rgba = [UInt8](repeating: 0, count: 4)
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let drawn = rgba.withUnsafeMutableBytes { buffer in
            let context = CGContext(
                data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            return context != nil
        }
        XCTAssertTrue(drawn)
        return Pixel(red: Int(rgba[0]), green: Int(rgba[1]), blue: Int(rgba[2]))
    }

    private func brightness(of image: UIImage, column: Int, row: Int) throws -> Double {
        let colour = try pixel(of: image, column: column, row: row)
        return Double(colour.red + colour.green + colour.blue) / (3 * 255)
    }

    func test_E020_AC15_theLogoIsTheLightDialInLightModeAndTheDarkDialInDarkMode() throws {
        // Near the top edge, middle: the icon's background, outside the dial.
        let light = try brightness(of: try render(.light), column: 50, row: 8)
        let dark = try brightness(of: try render(.dark), column: 50, row: 8)

        XCTAssertGreaterThan(light, 0.85, "the light dial has the light background")
        XCTAssertLessThan(dark, 0.3, "the dark dial has the dark background")
    }

    func test_E020_AC15_theLogoHasTheDialInPink() throws {
        // The first of the five hours of the dial, at about 11 o'clock, in the pink gradient of the brand.
        let colour = try pixel(of: try render(.light, side: 1000), column: 420, row: 250)

        XCTAssertGreaterThan(colour.red, 200, "red")
        XCTAssertLessThan(colour.green, 120, "green")
    }

    /// The files in the asset are the brand's own, byte for byte: never redrawn.
    func test_E020_AC15_theAssetHoldsTheBrandFilesUnchanged() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()  // apps/ios
            .deletingLastPathComponent().deletingLastPathComponent()  // the repository
        for mode in ["light", "dark"] {
            let name = "fivvi-day-dial-b2-pro-\(mode).svg"
            let brand = root.appending(path: "docs/design/brand/day-dial/b2-pro/\(name)")
            let copy = root.appending(path: "apps/ios/FivviPro/Assets.xcassets/ProLogo.imageset/\(name)")
            XCTAssertTrue(FileManager.default.fileExists(atPath: brand.path), "\(brand.path) exists")
            XCTAssertEqual(try Data(contentsOf: copy), try Data(contentsOf: brand), name)
        }
    }
}
