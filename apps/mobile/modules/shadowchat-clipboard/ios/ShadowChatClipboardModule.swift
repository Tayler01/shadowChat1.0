import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// No polling, URL fetching, Photos-library access, or pasteboard mutation. iOS
// controls paste permission; only an explicit web paste gesture calls begin.
public final class ShadowChatClipboardModule: Module {
  private let limit = 64 * 1024 * 1024
  private let chunkSize = 192 * 1024
  private let lock = NSLock()
  private var transfers: [String: Transfer] = [:]
  private var cancelled: [String] = []

  private final class Transfer {
    let directory: URL
    var files: [URL] = []
    var total = 0
    var progress: Progress?
    init(directory: URL) { self.directory = directory }
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "ShadowChatClipboard", code: 1,
      userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func release(_ requestId: String) {
    lock.lock()
    // Fence cancellation that races ahead of begin's main-queue dispatch.
    if !cancelled.contains(requestId) {
      cancelled.append(requestId)
      if cancelled.count > 64 { cancelled.removeFirst() }
    }
    let transfer = transfers.removeValue(forKey: requestId)
    lock.unlock()
    transfer?.progress?.cancel()
    if let directory = transfer?.directory {
      try? FileManager.default.removeItem(at: directory)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("ShadowChatClipboard")

    OnCreate {
      // Recover orphaned cache files after a process crash. Only this module's
      // fixed namespace under the application's temporary directory is touched.
      let root = FileManager.default.temporaryDirectory
      if let urls = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
        for url in urls where url.lastPathComponent.hasPrefix("shadowchat-clipboard-") {
          try? FileManager.default.removeItem(at: url)
        }
      }
    }

    AsyncFunction("begin") { (requestId: String, promise: Promise) in
      guard UUID(uuidString: requestId) != nil else {
        promise.reject(self.failure("Invalid clipboard request.")); return
      }
      self.lock.lock()
      let occupied = !self.transfers.isEmpty
      let wasCancelled = self.cancelled.contains(requestId)
      self.lock.unlock()
      guard !wasCancelled else { promise.reject(self.failure("Clipboard paste cancelled.")); return }
      guard !occupied else {
        promise.reject(self.failure("A clipboard paste is already in progress.")); return
      }
      let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("shadowchat-clipboard-" + requestId, isDirectory: true)
      do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
      catch { promise.reject(error); return }
      let transfer = Transfer(directory: directory)
      self.lock.lock()
      guard !self.cancelled.contains(requestId) else {
        self.lock.unlock()
        try? FileManager.default.removeItem(at: directory)
        promise.reject(self.failure("Clipboard paste cancelled.")); return
      }
      self.transfers[requestId] = transfer
      self.lock.unlock()
      // This access can show Apple's paste permission prompt. An empty/denied
      // clipboard is surfaced to the composer; it is never retried silently.
      let providers = UIPasteboard.general.itemProviders.filter { provider in
        provider.registeredTypeIdentifiers.contains { UTType($0)?.conforms(to: .movie) == true }
      }
      guard !providers.isEmpty, providers.count <= 3 else {
        self.release(requestId)
        promise.reject(self.failure(providers.isEmpty
          ? "iOS did not provide a video from this clipboard. Allow Paste if asked, or use Attach files."
          : "You can paste up to 3 videos at once.")); return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 120) { [weak self, weak transfer] in
        guard let self, let transfer else { return }
        self.lock.lock(); let active = self.transfers[requestId] === transfer; self.lock.unlock()
        if active { self.release(requestId) }
      }
      self.load(providers, index: 0, requestId: requestId, transfer: transfer,
        metadata: [], promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("readChunk") { (requestId: String, fileIndex: Int, offset: Int) -> String in
      self.lock.lock(); defer { self.lock.unlock() }
      guard let transfer = self.transfers[requestId],
        transfer.files.indices.contains(fileIndex), offset >= 0 else {
        throw self.failure("This clipboard transfer has expired.")
      }
      let handle = try FileHandle(forReadingFrom: transfer.files[fileIndex])
      defer { try? handle.close() }
      try handle.seek(toOffset: UInt64(offset))
      return try (handle.read(upToCount: self.chunkSize) ?? Data()).base64EncodedString()
    }

    AsyncFunction("release") { (requestId: String) in self.release(requestId) }
    OnDestroy {
      self.lock.lock(); let ids = Array(self.transfers.keys); self.lock.unlock()
      ids.forEach { self.release($0) }
    }
  }

  private func load(_ providers: [NSItemProvider], index: Int, requestId: String,
    transfer: Transfer, metadata: [[String: Any]], promise: Promise) {
    lock.lock(); let active = transfers[requestId] === transfer; lock.unlock()
    guard active else { promise.reject(failure("Clipboard paste cancelled.")); return }
    guard index < providers.count else { promise.resolve(metadata); return }
    let provider = providers[index]
    guard let identifier = provider.registeredTypeIdentifiers.first(where: {
      UTType($0)?.conforms(to: .movie) == true
    }) else { release(requestId); promise.reject(failure("No readable movie representation.")); return }
    let progress = provider.loadFileRepresentation(forTypeIdentifier: identifier) { [weak self] url, error in
      guard let self else { return }
      do {
        guard let url else { throw error ?? self.failure("iOS could not load this video. Use Attach files.") }
        self.lock.lock()
        guard self.transfers[requestId] === transfer else {
          self.lock.unlock(); throw self.failure("Clipboard paste cancelled.")
        }
        // The provider's URL is temporary and valid only during this callback.
        // Copy it here, before returning; never return that URL to JavaScript.
        do {
          let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
          guard size > 0, size <= self.limit, transfer.total + size <= self.limit else {
            throw self.failure("Pasted videos must total 64 MB or less. Use Attach files for separate videos.")
          }
          let type = UTType(filenameExtension: url.pathExtension) ?? UTType(identifier)
          let mime = type?.preferredMIMEType ?? "video/quicktime"
          guard mime.hasPrefix("video/") else { throw self.failure("This clipboard item is not a video.") }
          let ext = type?.preferredFilenameExtension ?? "mov"
          let destination = transfer.directory.appendingPathComponent(UUID().uuidString + "." + ext)
          try FileManager.default.copyItem(at: url, to: destination)
          transfer.files.append(destination); transfer.total += size
          self.lock.unlock()
          let next = metadata + [["name": "pasted-video-\(index + 1).\(ext)", "type": mime, "size": size]]
          self.load(providers, index: index + 1, requestId: requestId,
            transfer: transfer, metadata: next, promise: promise)
        } catch { self.lock.unlock(); throw error }
      } catch {
        self.release(requestId); promise.reject(error)
      }
    }
    lock.lock()
    let stillActive = transfers[requestId] === transfer
    if stillActive { transfer.progress = progress }
    lock.unlock()
    if !stillActive { progress.cancel() }
  }
}
