import Foundation
import Vision
import ImageIO

let args = Array(CommandLine.arguments.dropFirst())
let boxes = args.first == "--boxes"
let paths = boxes ? args.dropFirst() : args[...]
do {
    let documents = try paths.map { path -> [[String: Any]] in
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = boxes ? ["en-US"] : ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = !boxes
        let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
        try handler.perform([request])
        return (request.results ?? []).compactMap { observation in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let box = observation.boundingBox
            return ["text": candidate.string, "x": box.minX, "y": 1 - box.maxY,
                    "width": box.width, "height": box.height]
        }
    }
    if boxes {
        print(String(decoding: try JSONSerialization.data(withJSONObject: documents), as: UTF8.self))
    } else {
        print((documents.first ?? []).compactMap { $0["text"] as? String }.joined(separator: "\n"))
    }
} catch {
    fputs("无法识别图片中的文字。\n", stderr)
    exit(1)
}
