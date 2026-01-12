// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "MongoDo",
    platforms: [
        .macOS(.v12),
        .iOS(.v15),
        .tvOS(.v15),
        .watchOS(.v8)
    ],
    products: [
        .library(
            name: "MongoDo",
            targets: ["MongoDo"]
        ),
    ],
    dependencies: [
        // RPC transport for edge communication
        // .package(url: "https://github.com/dotdo/rpc-swift", from: "0.1.0"),
    ],
    targets: [
        .target(
            name: "MongoDo",
            dependencies: [
                // "RpcDo",
            ],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        ),
        .testTarget(
            name: "MongoDoTests",
            dependencies: ["MongoDo"]
        ),
    ]
)
