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
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "4.5.1"),
    ],
    targets: [
        .target(
            name: "SecureNotesAppleCore",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto"),
            ]
        ),
        .testTarget(
            name: "SecureNotesAppleTests",
            dependencies: ["SecureNotesAppleCore"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
