// swift-tools-version: 6.0
import PackageDescription

// Pins the swift-openapi-generator CLI that packages/contract runs to generate the Swift client,
// with every transitive dependency locked in Package.resolved. Only a tool; nothing imports it.
// SwiftPM only builds a dependency's executable when a target uses it, hence the no-op plugin.
// See packages/contract/README.md.
let package = Package(
    name: "swift-openapi-generator-cli",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1"),
    ],
    targets: [
        .plugin(
            name: "BuildGenerator",
            capability: .command(
                intent: .custom(verb: "noop", description: "Does nothing; see the comment above.")
            ),
            dependencies: [.product(name: "swift-openapi-generator", package: "swift-openapi-generator")]
        ),
    ]
)
