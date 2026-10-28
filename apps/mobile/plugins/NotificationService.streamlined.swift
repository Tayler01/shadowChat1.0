import Foundation
import UserNotifications

// Scoped community builds use generic OS text; detailed content is shown only after in-app scope/auth checks.
// The sender MUST also provide generic top-level text: an NSE may not run at all.
final class NotificationService: UNNotificationServiceExtension {
  private let lock=NSLock()
  private var handler:((UNNotificationContent)->Void)?
  private var fallback:UNNotificationContent?
  override func didReceive(_ request:UNNotificationRequest,withContentHandler contentHandler:@escaping(UNNotificationContent)->Void){
    let content=(request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    content.title="ShadoChat"
    content.subtitle=""
    content.body="Open ShadoChat to view a notification."
    content.attachments=[]
    content.threadIdentifier="shadowchat-private"
    content.summaryArgument=""
    content.badge=nil
    lock.lock();handler=contentHandler;fallback=content;lock.unlock()
    finish()
  }
  override func serviceExtensionTimeWillExpire(){finish()}
  private func finish(){lock.lock();let completion=handler;let content=fallback;handler=nil;lock.unlock();if let completion,let content{completion(content)}}
}
