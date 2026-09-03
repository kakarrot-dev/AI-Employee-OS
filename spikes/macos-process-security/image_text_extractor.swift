import Foundation
import ImageIO
import Vision

struct TextLine: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
}

struct Result: Codable {
    let schemaVersion: Int
    let lines: [TextLine]
}

func fail(_ code: String) -> Never {
    FileHandle.standardError.write(Data((code + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("invalid_image_path") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fail("image_decode_failed")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "en-US"]

do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    fail("image_ocr_failed")
}

let lines = (request.results ?? []).compactMap { observation -> TextLine? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    return TextLine(
        text: candidate.string,
        confidence: candidate.confidence,
        x: observation.boundingBox.origin.x,
        y: observation.boundingBox.origin.y
    )
}.sorted {
    if abs($0.y - $1.y) > 0.02 { return $0.y > $1.y }
    return $0.x < $1.x
}

do {
    let data = try JSONEncoder().encode(Result(schemaVersion: 1, lines: lines))
    FileHandle.standardOutput.write(data)
} catch {
    fail("image_ocr_encode_failed")
}
