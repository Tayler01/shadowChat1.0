import type { ReactNode } from 'react'
import { STREAMLINED_POLICY_EFFECTIVE_DATE, STREAMLINED_POLICY_VERSION } from './streamlinedPolicyVersion'

export type StreamlinedLegalPage = 'privacy' | 'terms' | 'safety' | 'delete-account'

interface StreamlinedPoliciesProps {
  page: StreamlinedLegalPage
  /** Pass the public VITE_SUPPORT_EMAIL value only after the mailbox is verified. */
  supportEmail?: string
  /** Pass the public VITE_PRIVACY_EMAIL value only after the mailbox is verified. */
  privacyEmail?: string
  /** The actual individual or organization operating this service. */
  operatorName?: string
}

const policyPages: { page: StreamlinedLegalPage; title: string }[] = [
  { page: 'privacy', title: 'Privacy policy' },
  { page: 'terms', title: 'Terms of use' },
  { page: 'safety', title: 'Community safety' },
  { page: 'delete-account', title: 'Delete account' },
]

const linkClass = 'inline-flex min-h-12 items-center text-[var(--theme-accent-readable)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-focus-ring)]'
const paragraphClass = 'text-sm leading-7 text-[var(--text-secondary)]'

function validContact(value?: string): string | null {
  const email = value?.trim()
  return email && email.length <= 254 && /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
    <div className={`${paragraphClass} space-y-3`}>{children}</div>
  </section>
}

function PrivacyPolicy() {
  return <>
    <Section title="One account across ShadowChat">
      <p>The member community in the streamlined edition uses the same ShadowChat account, approved membership and content as the full web app. Activity in one edition can appear in the other. Installing an app does not grant membership.</p>
      <p>The separate demonstration community uses its own accounts and synthetic review content. It does not provide access to the member community.</p>
    </Section>
    <Section title="Information the service handles">
      <ul className="list-disc space-y-3 pl-5">
        <li><strong>Account and profile:</strong> sign-in email, authentication and invitation information, username, profile details, profile images and account status.</li>
        <li><strong>Member content:</strong> group and direct messages, replies, reactions, photos, videos, files, voice messages, and ShadowPin posts, comments and related interactions.</li>
        <li><strong>Preferences and activity:</strong> saved items, blocked members, in-app Connections and Inner Circle relationships, read state, presence and notification preferences. These social features do not import your phone address book. ShadowPin also records visits, time spent viewing, opened Pins, reactions, shares and related activity associated with your account for operator analytics.</li>
        <li><strong>Notifications and operation:</strong> push subscriptions or device tokens, notification delivery information, browser/device details, and diagnostic, security and service-performance records processed by the app and its service providers.</li>
        <li><strong>Safety:</strong> reports, relevant content or evidence, moderation decisions and updates to the reporting member.</li>
      </ul>
      <p>The adult membership screen asks for an 18-or-older declaration. It does not request a date of birth or an identity document and does not verify your age. Your declaration, accepted policy version and acceptance time are stored with your account so your acknowledgement applies across devices.</p>
    </Section>
    <Section title="How information is used and shared">
      <p>Information is used to authenticate members, deliver and synchronize conversations and media, support the features you use, send notifications, investigate reports, and maintain the service.</p>
      <p>Content is shown to members through the relevant chat or ShadowPin features. Authorized operators may access information needed for account support, safety investigations and administration. Do not post another person&apos;s private information without permission.</p>
      <p>Submitting a report shares the reported item and its attached media with authorized case reviewers, including when the item came from a direct message. This does not share the surrounding private conversation. Reported media and supplied evidence can be retained for the case after the original content or account is removed, under the safety-evidence retention rules below.</p>
    </Section>
    <Section title="Service providers and optional connected features">
      <ul className="list-disc space-y-3 pl-5">
        <li><strong>Supabase:</strong> sign-in, account and conversation records, realtime delivery, files, reports and server functions.</li>
        <li><strong>Netlify:</strong> web hosting and media-related server functions. Requests can include IP addresses, browser details and the resource requested.</li>
        <li><strong>Bunny Stream:</strong> uploaded ShadowPin video processing, storage and playback delivery. Playback requests expose network and technical playback information to Bunny. Removing a video from the active service is separate from copies in a viewer&apos;s browser, caches and provider operational records.</li>
        <li><strong>GIF availability:</strong> KLIPY search and KLIPY-hosted media are unavailable in this edition, including the demonstration community. Existing messages are preserved and show an unavailable-media notice instead of loading that provider. The full web app still offers KLIPY GIFs under its separate enabled features; shared accounts and conversations do not make those provider requests part of this edition. Uploaded images, including animated GIF files, remain available.</li>
        <li><strong>AI features:</strong> before each <code>@ai</code> or <code>/summary</code> request, a confirmation shows the text to share and the configured AI recipient. If you approve, <code>@ai</code> shares your question and <code>/summary</code> shares up to 20 recent loaded message texts. The app does not add account identifiers or media files to that request, but message text may itself contain personal information or links. The currently configured recipient is OpenRouter and the model hosting provider it selects; the current default model is Mistral Nemo. The confirmation identifies the recipient and model for your request. Canceling the confirmation does not send that request. Do not approve information you do not want processed by the named AI service.</li>
        <li><strong>Linked media:</strong> link previews can request a shared page and its information from the destination site. Previews and automatically playing linked videos can contact YouTube, Pinterest and other external hosts as you browse, before you open an item. Choosing to load an external player can send additional requests. These providers receive your IP address and browser information and apply their own privacy practices. This edition uses YouTube&apos;s privacy-enhanced player mode; that mode still contacts Google to load and operate the player. A playback confirmation does not prevent earlier image, preview or automatically playing video requests.</li>
        <li><strong>Push and diagnostics:</strong> browser push services handle subscription endpoints and delivery. Native iPhone notifications use Expo Push Service and Apple Push Notification service, which process device tokens, delivery metadata and notification payloads. Notifications can display content according to your settings. Hosting and infrastructure providers also process diagnostic and security records.</li>
        <li><strong>Zoho Mail:</strong> emails you send to our support or privacy addresses, including their contents, attachments and sender details. Both addresses are handled directly in the same Zoho inbox; support mail is not forwarded to another mailbox.</li>
      </ul>
      <p>Our primary database is in the United States. Hosting, delivery, communication and other providers can process information in other countries. Their retention and uses vary with the service, account settings and legal obligations. Optional AI processing shares only the text approved for that request with the named recipient and model host; we do not promise universal zero retention or that no provider can train on approved request text.</p>
    </Section>
    <Section title="Information on your device">
      <p>The app uses browser storage for sign-in continuity, drafts, pending messages, cached conversation data and device preferences such as accessibility settings. Signing out and account deletion have different effects; downloaded or copied content and copies on other devices are not remotely erased. Use your browser or device controls to clear remaining local data on a shared device.</p>
    </Section>
    <Section title="Security and media access">
      <p>ShadowChat is not end-to-end encrypted. Do not treat chat messages or uploaded files as inaccessible to the service operator or its infrastructure providers.</p>
      <p>We use account permissions, private media storage and time-limited playback or download links to limit access to member content. A valid signed link can remain usable until it expires, including after access to the original content changes. Authorized viewers can save or share content. Browser caches, downloads and independent copies are not remotely erased when access changes or an account is deleted. Public profile images and external linked media have different visibility and provider controls.</p>
      <p>No online service can promise absolute security. Do not share information you cannot risk another member retaining or disclosing.</p>
    </Section>
    <Section title="Retention and account deletion">
      <p>Ordinary account content is retained to provide the service until you remove it or request account deletion, subject to operational cleanup rules. Account deletion removes the shared sign-in, authored content, profile, uploads and related registrations from the active service, with the exceptions below. Interrupted requests can be retried; removal is complete when the server confirms completion. Existing backups are not individually edited by an account-deletion request.</p>
      <p>Submitted safety evidence is a limited exception. It is kept while a case or appeal is active or a documented legal hold applies; otherwise it becomes eligible for removal 90 days after case closure. This is an operator-selected retention period, not a claimed legal requirement. Caleb Y Polder reviews eligible closed cases weekly for evidence removal, excluding active appeals and legal holds. Eligibility does not mean automatic deletion exactly on day 90.</p>
      <p>Resolved support and privacy emails are deleted after 90 days unless still needed for a safety case or legal obligation.</p>
      <p>Completed deletion receipts remain valid for 24 hours, and cleanup of expired completed receipts is scheduled hourly. Minimal records of removed provider assets remain to prevent reauthorization. Backups, provider records and external copies are separate from active-service removal.</p>
      <p>Our current Supabase Pro service provides access to seven days of daily database backups. This is a recovery window, not a deadline for physical erasure from every provider system. Database backups do not contain uploaded Storage file contents. Providers can retain operational, security, recovery and legally required records separately from active account content. We do not promise immediate erasure of every provider-held record or external copy.</p>
      <p>An account deletion request applies to your shared ShadowChat account in both editions. Signing out or uninstalling an app does not delete it. Content another member has independently shared may remain as a copy under that member&apos;s account; removing the original account or Pin does not withdraw that independent copy.</p>
      <a href="/?legal=delete-account" className={linkClass}>How to delete your account</a>
    </Section>
    <Section title="Your choices">
      <p>Use Settings to update your profile, control notifications, manage blocked members, or open account deletion. Device settings control permissions such as camera, microphone and notifications. Contact the privacy address below for access, correction, deletion or other privacy questions. We may need to verify account ownership before acting.</p>
    </Section>
  </>
}

function TermsOfUse() {
  return <>
    <Section title="Membership and age">
      <p>ShadowChat Streamlined is for approved members who are at least 18 years old. Use your own account and keep your credentials secure. An invitation or app download does not remove the age requirement, and membership may be restricted or revoked for rule violations.</p>
      <p>The full and streamlined editions share accounts and content. These terms and the community safety standards apply to your use of the streamlined edition, including messages, uploads, voice messages, reactions and ShadowPin.</p>
    </Section>
    <Section title="Content and conduct">
      <p>Only share content you have the right to share. By submitting content, you permit the service to store, process and display it as needed to provide the features you choose and to handle safety reports. You retain any rights you hold in your content.</p>
      <p>The following are prohibited:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Illegal activity, credible threats, harassment, bullying, hate or discriminatory abuse.</li>
        <li>Sexually explicit material, graphic violence, or content that encourages serious harm.</li>
        <li>Child sexual abuse or exploitation, including child sexual abuse material, grooming, sexual extortion or trafficking. This prohibition applies even though membership is adults only.</li>
        <li>Sharing private information without permission, impersonation, scams, spam, malware, or attempts to bypass access controls.</li>
        <li>Retaliation against someone who reports a concern, or deliberate misuse of reporting tools.</li>
      </ul>
      <a href="/?legal=safety" className={linkClass}>Read the community safety standards</a>
    </Section>
    <Section title="Reporting and enforcement">
      <p>Report objectionable content or abusive members through the in-app reporting controls. Blocking is available to manage unwanted contact. Authorized operators may review reports and relevant evidence, remove content, restrict accounts, and take further action required by applicable law.</p>
      <p>Reports go to the operator Safety Case Center. Caleb Y Polder is the sole reviewer and checks that center and the support/privacy inbox daily. Daily review is not a guaranteed response time or continuous emergency coverage. In-app reports are not an emergency service.</p>
    </Section>
    <Section title="Privacy and account choices">
      <p>Read the privacy policy before sharing content, including its explanation of service providers and optional AI features. The service is not end-to-end encrypted. You can decline these terms and use the account-management link to request deletion instead of entering the app.</p>
      <div className="flex flex-wrap gap-x-5">
        <a href="/?legal=privacy" className={linkClass}>Privacy policy</a>
        <a href="/?legal=delete-account" className={linkClass}>Account deletion</a>
      </div>
    </Section>
    <Section title="Changes to these terms">
      <p>We may update these terms as the service changes. A material policy update may require a new acknowledgement before you continue.</p>
    </Section>
  </>
}

function CommunitySafety() {
  return <>
    <Section title="Standards for every member">
      <p>Be respectful, protect other people&apos;s privacy and follow the terms of use. Harassment, threats, hate, scams, illegal content, sexually explicit material and graphic violence are prohibited. An invitation or an adults-only community does not exempt anyone from these rules.</p>
    </Section>
    <Section title="Child safety: no abuse or exploitation">
      <p>ShadowChat prohibits child sexual abuse and exploitation (CSAE), including grooming, sexual extortion, trafficking and any conduct that sexually exploits or endangers a child. Creating, sharing, requesting or promoting child sexual abuse material (CSAM) is prohibited.</p>
      <p>Report suspected exploitation using the in-app report control on the relevant content or member. Describe the concern without downloading, forwarding or reposting suspected illegal material. If someone is in immediate danger, contact local emergency services.</p>
    </Section>
    <Section title="Report a concern or block a member">
      <p>Open the relevant content or member menu and choose Report, then describe the concern and submit it. View submitted reports and operator updates in Settings &gt; Safety reports.</p>
      <p>Use the member blocking controls to manage unwanted contact. You can review your blocked members in Settings &gt; Privacy. A report and a block are separate actions; submitting a report does not automatically block someone.</p>
      <a href="/?view=settings&settingsSection=safety" className={linkClass}>Open my safety reports</a>
    </Section>
    <Section title="Operator response">
      <p>Reports need review by authorized operators, with action on prohibited content and abusive accounts. Suspected CSAM must be handled under applicable child-safety and reporting law.</p>
      <p>Caleb Y Polder is the sole reviewer and checks the Safety Case Center and support/privacy inbox daily. Reports involving immediate danger or suspected child exploitation receive priority when reviewed. The service is not continuously monitored, and daily review is not a guaranteed response time. Use the support address below for a safety concern when you cannot use an in-app report. Report the location of suspected illegal material without emailing, downloading or reposting it. Appropriate authorities are contacted where required by applicable law. If someone is in immediate danger, contact local emergency services.</p>
    </Section>
  </>
}

function AccountDeletion({ privacyEmail }: { privacyEmail: string | null }) {
  return <>
    <Section title="Delete your shared ShadowChat account">
      <p>Account deletion affects the same account used by the full web app, the streamlined edition and any connected ShadowChat apps. You will lose access to all of them. Uninstalling an app or signing out does not delete your account.</p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>Open account deletion below. Sign in to your own account if asked; you do not need to install an app.</li>
        <li>In Account settings, choose Delete account and read the confirmation.</li>
        <li>Enter DELETE, select Permanently delete account, and confirm only if you want to remove the shared account.</li>
      </ol>
      <a href="/?view=settings&settingsSection=account" className={`${linkClass} font-semibold`}>Open account deletion</a>
    </Section>
    <Section title="If deletion is interrupted">
      <p>The updated workflow saves a deletion receipt in this browser before requesting removal. Keep this browser&apos;s site data until the server confirms completion. If the connection fails or you can no longer sign in, use the recovery link below in the same browser to retry the saved request. The receipt allows only completion of deletion; it does not restore account access. If that browser data is lost, contact privacy support.</p>
      <a href="/?accountDeletion=retry" className={linkClass}>Resume account deletion</a>
    </Section>
    <Section title="What deletion removes and what may remain">
      <p>The deletion workflow removes your shared sign-in, authored content, profile, uploaded media and notification registrations from the active service. Wait for server confirmation before treating removal as complete. Completed deletion receipts are valid for 24 hours and cleanup of expired completed receipts is scheduled hourly. Minimal removed-provider records remain to prevent reauthorization.</p>
      <p>Submitted safety evidence may be retained for an active case or appeal or a documented legal hold. Other submitted evidence becomes eligible for removal 90 days after case closure. Caleb Y Polder reviews eligible closed cases weekly for evidence removal; eligibility does not mean automatic deletion exactly on day 90. Unsubmitted evidence uploads are included in ordinary account cleanup. Existing database backups are not individually edited, and provider operational, recovery, security and legally required records can outlast active-service deletion. Authorized content another member independently shared can remain as their own copy, governed by that member&apos;s account. Deleting the original account or Pin does not delete that independent copy. Downloads and other external copies are not remotely erased.</p>
    </Section>
    <Section title="If you cannot sign in">
      <p>Try the password-reset option on the sign-in screen. If you still need help, email the privacy address below and ask to delete your ShadowChat account. Include the account email or username and send from the account email when possible. We will verify ownership before processing the request. You do not need to install the app or accept the streamlined terms to request deletion. Never send your password, verification code or identity documents in an initial email.</p>
      {privacyEmail
        ? <a href={`mailto:${privacyEmail}?subject=ShadowChat%20account%20deletion%20request`} className={linkClass}>Email a deletion request</a>
        : <p role="status" className="font-medium text-[var(--text-gold)]">The deletion-support mailbox is unavailable. You can still open account deletion or resume a saved deletion request using the links above.</p>}
    </Section>
  </>
}

export function StreamlinedPolicies({ page, supportEmail, privacyEmail, operatorName }: StreamlinedPoliciesProps) {
  const support = validContact(supportEmail)
  const privacy = validContact(privacyEmail)
  const operator = operatorName?.trim() || 'Caleb Y Polder'
  const title = policyPages.find(policy => policy.page === page)?.title ?? 'ShadowChat policies'

  return <main className="h-[100dvh] overflow-y-auto overscroll-contain bg-[var(--bg-app)] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-[var(--text-primary)] sm:px-6">
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <a href="/" className={linkClass}>Back to ShadowChat</a>
        <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">ShadowChat Streamlined</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Policy version {STREAMLINED_POLICY_VERSION} · Effective {STREAMLINED_POLICY_EFFECTIVE_DATE}</p>
      </header>
      <nav aria-label="ShadowChat policies" className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--border-panel)] pb-3">
        {policyPages.map(policy => <a key={policy.page} href={`/?legal=${policy.page}`} aria-current={page === policy.page ? 'page' : undefined} className={`${linkClass} text-sm ${page === policy.page ? 'font-semibold' : ''}`}>{policy.title}</a>)}
      </nav>
      <article className="space-y-8">
        {page === 'privacy' && <PrivacyPolicy />}
        {page === 'terms' && <TermsOfUse />}
        {page === 'safety' && <CommunitySafety />}
        {page === 'delete-account' && <AccountDeletion privacyEmail={privacy} />}
      </article>
      <footer className="space-y-3 border-t border-[var(--border-panel)] pt-6">
        <h2 className="text-lg font-semibold">Contact and operator</h2>
        <p className={paragraphClass}>Service operator: {operator}</p>
        <div className="space-y-2 text-sm">
          {support ? <p>Support: <a href={`mailto:${support}`} className={`${linkClass} break-all`}>{support}</a></p> : <p className="text-[var(--text-muted)]">Support mailbox: not configured.</p>}
          {privacy ? <p>Privacy and deletion: <a href={`mailto:${privacy}`} className={`${linkClass} break-all`}>{privacy}</a></p> : <p className="text-[var(--text-muted)]">Privacy mailbox: not configured.</p>}
        </div>
      </footer>
    </div>
  </main>
}
