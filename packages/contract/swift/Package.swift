// swift-tools-version: 6.0
import PackageDescription

// Swift client for the Trainer Hub API. Sources/TrainerHubAPI/Generated is generated from
// ../openapi.json by swift-openapi-generator; never edit it. See ../README.md.
// Platform minimums are the runtime's; the apps set their own (ADR-003, E008).
let package = Package(
    name: "TrainerHubAPI",
    platforms: [.iOS(.v13), .macOS(.v10_15)],
    products: [
        .library(name: "TrainerHubAPI", targets: ["TrainerHubAPI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.1"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.1"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "TrainerHubAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ]
        ),
    ]
)
