// swift-tools-version: 6.2
import PackageDescription

// The code both iOS apps share (E017, #500): Fivvi Pro today, the client app Fivvi next. Everything a screen of either
// app needs besides its own feature code. The generated pieces are packages of their own and are not copied here: the
// API client (packages/contract/swift), the design tokens (packages/design-tokens/FivviDesignTokens) and the string
// catalogs (packages/i18n). See apps/ios/README.md, "Packages".
//
// Dependencies run one way: FivviStrings is the base; FivviLanguage builds on FivviStrings and FivviSession, FivviUI on
// FivviStrings, and FivviSignIn on all four; FivviObservability stands alone, and is the only target that imports Sentry
// (SwiftLint's `no_direct_sentry`).
let package = Package(
    name: "FivviShared",
    platforms: [.iOS(.v26)],
    products: [
        .library(name: "FivviStrings", targets: ["FivviStrings"]),
        .library(name: "FivviSession", targets: ["FivviSession"]),
        .library(name: "FivviLanguage", targets: ["FivviLanguage"]),
        .library(name: "FivviUI", targets: ["FivviUI"]),
        .library(name: "FivviSignIn", targets: ["FivviSignIn"]),
        .library(name: "FivviObservability", targets: ["FivviObservability"])
    ],
    dependencies: [
        .package(path: "../../../../packages/contract/swift"),
        .package(path: "../../../../packages/design-tokens/FivviDesignTokens"),
        .package(path: "../../../../packages/i18n/generated/ios"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.1"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.0.0"),
        .package(url: "https://github.com/getsentry/sentry-cocoa", from: "9.30.2")
    ],
    targets: [
        // The catalog of an interface language and the keys the shared screens use.
        .target(
            name: "FivviStrings",
            dependencies: [
                .product(name: "FivviAPI", package: "swift"),
                .product(name: "FivviStringCatalogs", package: "ios")
            ]
        ),
        // The bearer token's store, the signed-in/out state and the auth layer of the API client (F001).
        .target(
            name: "FivviSession",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "HTTPTypes", package: "swift-http-types")
            ]
        ),
        // The language the app shows and its saved choice (F010).
        .target(
            name: "FivviLanguage",
            dependencies: [
                "FivviStrings", "FivviSession",
                .product(name: "FivviAPI", package: "swift"),
                .product(name: "FivviStringCatalogs", package: "ios")
            ]
        ),
        // Button styles, fields, messages and the skeleton: every colour and size from the design tokens.
        .target(
            name: "FivviUI",
            dependencies: [
                "FivviStrings",
                .product(name: "FivviAPI", package: "swift"),
                .product(name: "FivviDesignTokens", package: "FivviDesignTokens")
            ]
        ),
        // The sign-in screen: email, then the 6-digit code (F001).
        .target(
            name: "FivviSignIn",
            dependencies: [
                "FivviStrings", "FivviSession", "FivviLanguage", "FivviUI",
                .product(name: "FivviAPI", package: "swift"),
                .product(name: "FivviDesignTokens", package: "FivviDesignTokens"),
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")
            ]
        ),
        // Error reporting to Sentry with the scrubber (E009).
        .target(
            name: "FivviObservability",
            dependencies: [
                .product(name: "Sentry", package: "sentry-cocoa")
            ]
        )
    ]
)
