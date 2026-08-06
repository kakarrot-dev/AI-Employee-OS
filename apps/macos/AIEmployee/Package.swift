// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AIEmployee",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "AIEmployee", targets: ["AIEmployee"]),
        .executable(name: "AIEmployeeCredentialBroker", targets: ["AIEmployeeCredentialBroker"]),
    ],
    targets: [
        .executableTarget(name: "AIEmployee"),
        .executableTarget(name: "AIEmployeeCredentialBroker"),
    ]
)
