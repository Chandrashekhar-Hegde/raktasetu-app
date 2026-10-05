import React from 'react';
import { CONTACT } from '../config.js';
import { Link } from 'react-router-dom';
import PublicShell from '../components/PublicShell.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

function PolicySection({ title, children }) {
  return (
    <section className="policy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicy() {
  usePageMeta({
    title: 'Privacy Policy | RaktaSetu',
    description: 'How RaktaSetu collects, uses, stores, and shares information for blood donor coordination.',
    path: '/privacy',
  });

  return (
    <PublicShell>
      <article className="policy-wrap">
        <p className="policy-kicker">Privacy</p>
        <h1>Privacy Policy</h1>
        <p className="policy-lede">
          This policy explains how RaktaSetu handles information when donors and
          participating hospitals use the service.
        </p>
        <p className="policy-date">Effective date: 15 July 2026 · Policy version: 2026-07-15</p>

        <div className="policy-callout">
          <strong>Important status note:</strong> This is a draft operational policy for
          the current product and must be reviewed by qualified counsel and the
          organization responsible for RaktaSetu. Publishing it does not establish GDPR,
          DPDP Act, or HIPAA compliance.
        </div>

        <PolicySection title="1. Who is responsible for the data">
          <p>
            RaktaSetu operates the application and determines how the product processes
            account and coordination data. The legal entity acting as data controller or
            data fiduciary, its registered address, and its appointed privacy contact
            have not yet been confirmed in this application.
          </p>
          <p>
            Before production use beyond evaluation, the operating organization must
            publish those details and confirm whether participating hospitals act as
            independent controllers, joint controllers, processors, or another legally
            recognized role.
          </p>
        </PolicySection>

        <PolicySection title="2. Information we collect">
          <ul>
            <li><strong>Account details:</strong> name, email address, phone number, password hash, role, city, state, and account timestamps.</li>
            <li><strong>Donor details:</strong> blood group, date of birth, sex (used only to apply the NBTC donation interval of 90 days for men and 120 days for women), availability, approximate location (rounded to about 100 metres, captured only when you tap the location button), preferred request radius, eligibility dates, and verification state.</li>
            <li><strong>Hospital details:</strong> organization name, address, license information when supplied, location, contact details, and verification state.</li>
            <li><strong>Coordination records:</strong> blood requests, donor responses, arrival states, donation records, credits, and related timestamps.</li>
            <li><strong>Device and security data:</strong> IP address, user agent, audit events, authentication identifiers, and push notification subscription information.</li>
            <li><strong>Google sign-in data:</strong> Google account identifier, name, and email address when a donor chooses Google Identity Services.</li>
          </ul>
          <p>
            Blood group, donation history, and eligibility information can be sensitive
            personal data. Users should provide only information needed for the service.
          </p>
        </PolicySection>

        <PolicySection title="3. Why information is used">
          <ul>
            <li>Create and secure donor or hospital accounts.</li>
            <li>Identify compatible requests using blood group, availability, and distance.</li>
            <li>Coordinate responses between donors and participating hospitals.</li>
            <li>Record completed donation verification and related credits.</li>
            <li>Send requested in-app, local, or push notifications.</li>
            <li>Prevent abuse, enforce role permissions, investigate failures, and maintain audit records.</li>
            <li>Respond to access, correction, export, deletion, and support requests.</li>
          </ul>
          <p>
            The final legal basis for each purpose depends on the user, location, operator,
            and hospital relationship. Possible bases can include explicit consent,
            contract, legitimate interests, vital interests, and legal obligations.
            Counsel must approve the applicable basis and required notices before broad
            production processing.
          </p>
        </PolicySection>

        <PolicySection title="4. When information is shared">
          <p>RaktaSetu does not sell personal information or use it for advertising.</p>
          <ul>
            <li><strong>Participating hospitals:</strong> receive information needed to review and coordinate an accepted request, subject to role-based access.</li>
            <li><strong>Infrastructure providers:</strong> Railway hosts the service and Neon provides PostgreSQL database infrastructure. Their processing locations depend on the configured service regions.</li>
            <li><strong>Google:</strong> provides Identity Services only on the donor sign-in page when Google sign-in is configured and loaded.</li>
            <li><strong>OpenStreetMap:</strong> when you open the map view of nearby requests, your browser loads map images from OpenStreetMap's tile servers, which receive your IP address.</li>
            <li><strong>Browser push services:</strong> if you turn on alerts, notifications are delivered through your browser vendor's push service (for example Google for Chrome). Alert text contains the blood group and hospital name, never your personal details.</li>
            <li><strong>Authorities or safety recipients:</strong> information may be disclosed when the operator determines that law requires it or a valid emergency process applies.</li>
          </ul>
          <p>
            The operating organization must maintain and publish a current subprocessor
            inventory and execute any required data processing agreements.
          </p>
        </PolicySection>

        <PolicySection title="5. Browser storage and cookies">
          <p>
            On the web app, the short-lived access token is kept in memory for the
            browsing session. A longer-lived refresh token is stored in an essential
            HttpOnly cookie scoped to authentication endpoints and cleared on logout.
            Native app builds may use on-device storage for the same session material.
          </p>
          <p>
            RaktaSetu does not currently include advertising or analytics trackers and
            does not set nonessential cookies in its own code. For that reason, the app
            does not display a general cookie consent banner. Google Identity Services
            may use Google-controlled storage or cookies according to Google's policies
            when a donor opens the sign-in page.
          </p>
        </PolicySection>

        <PolicySection title="6. Retention and deletion">
          <p>
            When you request account deletion, RaktaSetu immediately deactivates the
            account, signs you out, and removes you from donor matching. For 30 days you
            may restore the account from the sign-in page. After that window, the
            retention job anonymizes direct identifiers (name, email, phone, location,
            date of birth, and similar profile fields) and removes push subscriptions and
            family-member rows.
          </p>
          <p>
            Donation records, credit ledger entries, and audit logs are retained in
            anonymized form so blood banks can keep operational and safety traceability.
            Backups and legal holds may retain copies for longer according to operator
            policy. This description supports DPDP readiness; it is not a compliance
            certificate.
          </p>
        </PolicySection>

        <PolicySection title="7. International processing">
          <p>
            Railway, Neon, Google, and other configured providers may process information
            outside the user's country. The operator must confirm actual regions,
            restricted transfer rules, contractual safeguards, and any required transfer
            impact assessment before production use in affected jurisdictions.
          </p>
        </PolicySection>

        <PolicySection title="8. Security">
          <p>
            Current technical safeguards include TLS in production, password hashing,
            role-based API authorization, request limits, selected audit logging, token
            invalidation, security headers, and data export and deletion controls.
          </p>
          <p>
            No online service can guarantee absolute security. Organizational controls
            such as access reviews, workforce training, incident response, vendor review,
            backup testing, and breach notification procedures are not established by
            this source code. See the <Link to="/security-readiness">Security and Readiness Statement</Link>.
          </p>
        </PolicySection>

        <PolicySection title="9. Your choices and rights">
          <p>
            Depending on applicable law, a person may have rights to access, correct,
            export, delete, restrict, or object to processing, withdraw consent, and
            complain to a supervisory authority. These rights can be limited by law and
            must be evaluated for each request.
          </p>
          <p>
            Signed-in users can use the <Link to="/data-rights">Data Rights Center</Link> to
            download an account export or request account deletion. Requests can also be
            sent to <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>.
          </p>
        </PolicySection>

        <PolicySection title="10. Children">
          <p>
            Donor registration is intended for people aged 18 or older. RaktaSetu is not
            designed for children to create donor accounts. If information about a child
            was submitted improperly, contact the privacy address so the operator can
            review and remove it where appropriate.
          </p>
        </PolicySection>

        <PolicySection title="11. Policy updates and contact">
          <p>
            Material changes should be communicated in the application and recorded with
            a new policy version and effective date. The current consent record stores
            the policy version for new registrations.
          </p>
          <p>
            Privacy and data-rights requests: <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a><br />
            General support: <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>
          </p>
          <p>
            These inboxes must be actively monitored and connected to an approved request
            handling process. The application cannot verify that operational requirement.
          </p>
        </PolicySection>
      </article>
    </PublicShell>
  );
}
