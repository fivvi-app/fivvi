// swift-tools-version: 6.0
import PackageDescription

// Trainer Hub's design tokens for iOS (ADR-015). Sources/TrainerHubDesignTokens/Generated is
// generated from ../tokens by `pnpm --filter @trainer-hub/design-tokens generate`; never edit it.
// See ../README.md. The minimums are what the adaptive colours need; the apps set their own (E008).
let package = Package(
    name: "TrainerHubDesignTokens",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "TrainerHubDesignTokens", targets: ["TrainerHubDesignTokens"]),
    ],
    targets: [
        .target(name: "TrainerHubDesignTokens"),
    ]
)
