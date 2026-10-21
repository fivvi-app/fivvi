// swift-tools-version: 6.0
import PackageDescription

// Fivvi's design tokens for iOS (ADR-015). Sources/FivviDesignTokens/Generated is
// generated from ../tokens by `pnpm --filter @fivvi/design-tokens generate`; never edit it.
// See ../README.md. The minimums are what the adaptive colours need; the apps set their own (E008).
let package = Package(
    name: "FivviDesignTokens",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "FivviDesignTokens", targets: ["FivviDesignTokens"]),
    ],
    targets: [
        .target(name: "FivviDesignTokens"),
    ]
)
