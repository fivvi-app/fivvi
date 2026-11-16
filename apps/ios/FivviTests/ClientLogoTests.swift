import FivviAPI
import UIKit
import XCTest

@testable import Fivvi
@testable import FivviStrings

/// The plain day dial B2 on the sign-in screens (E017 #503): the brand files light and dark, as an image of the app,
/// unchanged and independent of the app icon; never Fivvi Pro's dial with PRO.
final class ClientLogoTests: XCTestCase {
    /// The image drawn in `style`, as a bitmap of `side` points at scale 1.
    private func render(_ style: UIUserInterfaceStyle, side: CGFloat = 100) throws -> UIImage {
        let image = try XCTUnwrap(
            UIImage(named: ClientLogo.assetName, in: .main, compatibleWith: nil), "no \(ClientLogo.assetName)"
        )
        let traits = UITraitCollection(userInterfaceStyle: style)
        let resolved = image.imageAsset?.image(with: traits) ?? image
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            resolved.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private func pixel(of image: UIImage, column: Int, row: Int) throws -> (red: Int, green: Int, blue: Int) {
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
        return (Int(rgba[0]), Int(rgba[1]), Int(rgba[2]))
    }

    private func brightness(of image: UIImage, column: Int, row: Int) throws -> Double {
        let colour = try pixel(of: image, column: column, row: row)
        return Double(colour.red + colour.green + colour.blue) / (3 * 255)
    }

    func test_E017_AC4_theLogoIsTheLightDialInLightModeAndTheDarkDialInDarkMode() throws {
        let light = try brightness(of: try render(.light), column: 50, row: 8)
        let dark = try brightness(of: try render(.dark), column: 50, row: 8)

        XCTAssertGreaterThan(light, 0.85, "the light dial has the light background")
        XCTAssertLessThan(dark, 0.3, "the dark dial has the dark background")
    }

    func test_E017_AC4_theDialIsPinkAndItsMiddleIsEmpty() throws {
        let image = try render(.light, side: 1000)
        let pink = try pixel(of: image, column: 420, row: 250)
        let middle = try brightness(of: image, column: 500, row: 500)

        XCTAssertGreaterThan(pink.red, 200, "red")
        XCTAssertLessThan(pink.green, 120, "green")
        XCTAssertGreaterThan(middle, 0.85, "no PRO in the middle of the dial: that is Fivvi Pro's")
    }

    /// The files in the asset are the brand's own, byte for byte: never redrawn, and not the `b2-pro` ones.
    func test_E017_AC4_theAssetHoldsTheBrandFilesUnchanged() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()  // apps/ios
            .deletingLastPathComponent().deletingLastPathComponent()  // the repository
        for mode in ["light", "dark"] {
            let name = "fivvi-day-dial-b2-\(mode).svg"
            let brand = root.appending(path: "docs/design/brand/day-dial/b2/\(name)")
            let copy = root.appending(path: "apps/ios/Fivvi/Assets.xcassets/FivviLogo.imageset/\(name)")
            XCTAssertTrue(FileManager.default.fileExists(atPath: brand.path), "\(brand.path) exists")
            XCTAssertEqual(try Data(contentsOf: copy), try Data(contentsOf: brand), name)
        }
    }

    func test_E017_AC4_theLogoIsNamedFivviForVoiceOverInBothLanguages() {
        for locale in Components.Schemas.Locale.allCases {
            XCTAssertEqual(ClientLogo.logo(catalog: Catalog(locale: locale)).label, "Fivvi", locale.rawValue)
        }
    }
}
