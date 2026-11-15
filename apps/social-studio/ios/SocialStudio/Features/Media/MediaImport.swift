import AVFoundation
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// Movie file received from the Photos picker. The system hands us a temporary file that is
/// only valid inside the importing closure, so we copy it to our own temporary location.
struct PickedMovie: Transferable {
    let url: URL
    let suggestedName: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let name = received.file.lastPathComponent
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let target = destination.appendingPathComponent(name)
            try FileManager.default.copyItem(at: received.file, to: target)
            return PickedMovie(url: target, suggestedName: name)
        }
    }
}

/// Reads file metadata (size, duration, MIME type) for an imported video.
enum MediaInspector {
    struct Info {
        var sizeBytes: Int64?
        var durationSec: Double?
        var mimeType: String?
    }

    static func inspect(_ url: URL) async -> Info {
        var info = Info()
        if let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey]) {
            info.sizeBytes = values.fileSize.map { Int64($0) }
            info.mimeType = values.contentType?.preferredMIMEType
        }
        if info.mimeType == nil {
            info.mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
        }
        let asset = AVURLAsset(url: url)
        if let duration = try? await asset.load(.duration) {
            let seconds = CMTimeGetSeconds(duration)
            if seconds.isFinite && seconds >= 0 {
                info.durationSec = (seconds * 10).rounded() / 10
            }
        }
        return info
    }
}
