// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AIEmployee",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "AIEmployee", targets: ["AIEmployee"])],
    targets: [.executableTarget(name: "AIEmployee")]
)
