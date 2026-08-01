// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "SecureNotesApple",
    products: [
        .library(
            name: "SecureNotesAppleCore",
            targets: ["SecureNotesAppleCore"]
        ),
    ],
    targets: [
        .target(name: "SecureNotesAppleCore"),
        .testTarget(
            name: "SecureNotesAppleTests",
            dependencies: ["SecureNotesAppleCore"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
