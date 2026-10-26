import Foundation
import Intents
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
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
    // A background extension has no current member authorization. Keep the
    // system app icon and text even when an old queued payload contains media.
    content.attachments = []

    var updatedUserInfo = content.userInfo
    updatedUserInfo["shadowchatRichStatus"] = "content_only"
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
      image: nil,
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

}
