import Foundation
import Intents
import UniformTypeIdentifiers
import UserNotifications

final class NotificationService: UNNotificationServiceExtension, URLSessionTaskDelegate {
  private let completionLock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNNotificationContent?
  private var originalContent: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    completionLock.lock()
    self.contentHandler = contentHandler
    originalContent = request.content
    completionLock.unlock()
    guard let mutable = request.content.mutableCopy() as? UNMutableNotificationContent else {
      finish(request.content)
      return
    }
    setBestAttempt(mutable)
    Task { [weak self] in
      await self?.enrich(mutable)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    finish(nil)
  }

  private func finish(_ content: UNNotificationContent?) {
    completionLock.lock()
    let handler = contentHandler
    let resolvedContent = content ?? bestAttemptContent ?? originalContent
    contentHandler = nil
    completionLock.unlock()
    guard let handler, let content = resolvedContent else { return }
    handler(content)
  }

  private func setBestAttempt(_ content: UNNotificationContent) {
    completionLock.lock()
    if contentHandler != nil {
      bestAttemptContent = content
    }
    completionLock.unlock()
  }

  private func enrich(_ content: UNMutableNotificationContent) async {
    guard
      let envelope = notificationEnvelope(from: content.userInfo),
      number(envelope["schemaVersion"]) == 2,
      let category = envelope["category"] as? String,
      let privacy = envelope["privacy"] as? String,
      let groupKey = envelope["groupKey"] as? String,
      let expiresAt = envelope["expiresAt"] as? String,
      let expiry = notificationDate(from: expiresAt),
      expiry > Date()
    else {
      finish(content)
      return
    }

    let communicationCategories: Set<String> = [
      "dm",
      "general_chat",
      "mentions_replies",
    ]
    let actor = envelope["actor"] as? [String: Any]
    let media = privacy == "full" ? envelope["media"] as? [String: Any] : nil
    let actorURL = privacy == "private"
      ? nil
      : allowedURL(actor?["avatarUrl"] as? String)
    let mediaURL = allowedURL(media?["thumbnailUrl"] as? String)

    async let avatarFile = download(actorURL, maximumBytes: 2_000_000)
    async let mediaFile = download(mediaURL, maximumBytes: 8_000_000)
    let downloadedAvatar = await avatarFile
    let downloadedMedia = await mediaFile

    var richStatus = "content_only"
    if let downloadedMedia,
       let attachment = notificationAttachment(
         identifier: "shadowchat-media",
         file: downloadedMedia
       ) {
      content.attachments = [attachment]
      richStatus = "media_attached"
      setBestAttempt(content)
    } else if
      !communicationCategories.contains(category),
      let downloadedAvatar,
      let attachment = notificationAttachment(
        identifier: "shadowchat-actor",
        file: downloadedAvatar
      ) {
      content.attachments = [attachment]
      richStatus = "actor_attached"
      setBestAttempt(content)
    }

    var updatedUserInfo = content.userInfo
    updatedUserInfo["shadowchatRichStatus"] = richStatus
    content.userInfo = updatedUserInfo
    setBestAttempt(content)

    guard
      communicationCategories.contains(category),
      privacy != "private",
      let actor,
      let actorId = actor["id"] as? String,
      let actorLabel = actor["label"] as? String,
      !actorId.isEmpty,
      !actorLabel.isEmpty
    else {
      finish(content)
      return
    }

    let handle = INPersonHandle(value: actorId, type: .unknown)
    let sender = INPerson(
      personHandle: handle,
      nameComponents: nil,
      displayName: actorLabel,
      image: downloadedAvatar.flatMap { INImage(url: $0) },
      contactIdentifier: nil,
      customIdentifier: actorId,
      isMe: false,
      suggestionType: .none
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: nil,
      conversationIdentifier: groupKey,
      serviceName: "ShadowChat",
      sender: sender,
      attachments: nil
    )
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = INInteractionDirection.incoming
    interaction.donate { _ in }

    do {
      let updated = try content.updating(from: intent)
      if let mutableUpdated = updated.mutableCopy() as? UNMutableNotificationContent {
        mutableUpdated.attachments = content.attachments
        setBestAttempt(mutableUpdated)
        finish(mutableUpdated)
      } else {
        finish(updated)
      }
    } catch {
      finish(content)
    }
  }

  private func notificationAttachment(
    identifier: String,
    file: URL
  ) -> UNNotificationAttachment? {
    try? UNNotificationAttachment(
      identifier: identifier,
      url: file,
      options: nil
    )
  }

  private func notificationEnvelope(
    from userInfo: [AnyHashable: Any]
  ) -> [String: Any]? {
    if let body = dictionary(userInfo["body"]),
       let envelope = dictionary(body["envelopeV2"]) {
      return envelope
    }
    if let envelope = dictionary(userInfo["envelopeV2"]) {
      return envelope
    }
    if let data = dictionary(userInfo["data"]),
       let envelope = dictionary(data["envelopeV2"]) {
      return envelope
    }
    return nil
  }

  private func dictionary(_ value: Any?) -> [String: Any]? {
    if let dictionary = value as? [String: Any] {
      return dictionary
    }
    guard
      let string = value as? String,
      let data = string.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data)
    else {
      return nil
    }
    return object as? [String: Any]
  }

  private func number(_ value: Any?) -> Int? {
    if let value = value as? Int { return value }
    if let value = value as? NSNumber { return value.intValue }
    return nil
  }

  private func notificationDate(from value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) {
      return date
    }
    let standard = ISO8601DateFormatter()
    standard.formatOptions = [.withInternetDateTime]
    return standard.date(from: value)
  }

  private func allowedURL(_ rawValue: String?) -> URL? {
    guard
      let rawValue,
      rawValue.count <= 2_048,
      let url = URL(string: rawValue),
      url.scheme?.lowercased() == "https",
      url.user == nil,
      url.password == nil,
      url.port == nil,
      let host = url.host?.lowercased()
    else {
      return nil
    }
    let appHosts: Set<String> = [
      "shadochat.online",
      "www.shadochat.online",
      "shadowchat.app",
      "www.shadowchat.app",
    ]
    if appHosts.contains(host) || host.hasSuffix(".b-cdn.net") {
      return url
    }
    if host == "shsqqouecvdoifzufkqm.supabase.co",
       (
         url.path.hasPrefix("/storage/v1/object/public/")
          || url.path.hasPrefix("/storage/v1/render/image/public/")
       ) {
      if url.path.hasPrefix("/storage/v1/render/image/public/"),
         var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
        components.path = url.path.replacingOccurrences(
          of: "/storage/v1/render/image/public/",
          with: "/storage/v1/object/public/"
        )
        components.query = nil
        return components.url
      }
      return url
    }
    return nil
  }

  private func download(_ url: URL?, maximumBytes: Int) async -> URL? {
    guard let url else { return nil }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 12
    let session = URLSession(
      configuration: configuration,
      delegate: self,
      delegateQueue: nil
    )
    defer { session.finishTasksAndInvalidate() }
    do {
      let (bytes, response) = try await session.bytes(from: url)
      guard
        let http = response as? HTTPURLResponse,
        (200 ... 299).contains(http.statusCode),
        http.expectedContentLength <= 0
          || http.expectedContentLength <= Int64(maximumBytes),
        allowedURL(http.url?.absoluteString) != nil
      else {
        return nil
      }
      let mime = (http.mimeType ?? "image/jpeg").lowercased()
      let allowedImageTypes: Set<String> = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/heic",
        "image/heif",
        "image/webp",
      ]
      guard allowedImageTypes.contains(mime) else { return nil }
      var data = Data()
      data.reserveCapacity(
        min(
          maximumBytes,
          max(0, Int(http.expectedContentLength))
        )
      )
      for try await byte in bytes {
        guard data.count < maximumBytes else { return nil }
        data.append(byte)
      }
      guard !data.isEmpty else { return nil }
      let fileExtension = UTType(mimeType: mime)?.preferredFilenameExtension ?? "jpg"
      let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true
      )
      let file = directory.appendingPathComponent("asset.\(fileExtension)")
      try data.write(to: file, options: .atomic)
      return file
    } catch {
      return nil
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(
      request.url.flatMap { allowedURL($0.absoluteString) } == nil
        ? nil
        : request
    )
  }
}
