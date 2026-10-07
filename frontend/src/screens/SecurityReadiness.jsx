import React from 'react';
import { CONTACT } from '../config.js';
import PublicShell from '../components/PublicShell.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

function Section({ title, children }) {
  return (
    <section className="policy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function SecurityReadiness() {
  usePageMeta({
    title: 'Security and Compliance Readiness | RaktaSetu',
    description: 'Technical safeguards in RaktaSetu and the legal, contractual, and operational work that remains.',
    path: '/security-readiness',
  });

  return (
    <PublicShell>
      <article className="policy-wrap">
        <p className="policy-kicker">Trust and safeguards</p>
        <h1>Security and compliance readiness</h1>
        <p className="policy-lede">
          A factual view of the controls implemented in the product and the work that
          source code cannot complete.
        </p>
        <p className="policy-date">Reviewed: 15 July 2026</p>

        <div className="policy-callout">
          <strong>Status:</strong> RaktaSetu is not represented as GDPR compliant, HIPAA
          compliant, certified, audited, or legally verified. The product includes
          technical controls designed to support a future compliance program.
        </div>

        <Section title="Technical controls implemented in the application">
          <ul>
            <li>TLS is provided on the production Railway domain.</li>
            <li>Passwords are hashed with bcrypt before storage.</li>
            <li>Signed tokens include expiration and version information.</li>
            <li>Logout and account deletion can invalidate active token identifiers.</li>
            <li>Donor, hospital, and administrator API routes use server-side role checks.</li>
            <li>API payload sizes and request rates are limited.</li>
            <li>Selected authentication and sensitive actions create audit records.</li>
            <li>Production responses use Content Security Policy, HSTS, Referrer Policy, frame protection, MIME sniffing protection, and a restrictive Permissions Policy.</li>
            <li>New registrations record consent time, source, and policy version.</li>
            <li>Signed-in users can export scoped account data and request anonymization.</li>
            <li>Push notification subscription secrets are excluded from account exports.</li>
          </ul>
        </Section>

        <Section title="GDPR and European data protection readiness">
          <p>
            The product supports access, export, correction through profile tools,
            consent records, and account deletion. These features can support a privacy
            program, but they do not establish compliance.
          </p>
          <h3>Required legal and operational work</h3>
          <ul>
            <li>Identify and publish the controller, processors, representatives, and privacy contacts.</li>
            <li>Approve the legal basis for every processing purpose and sensitive data category.</li>
            <li>Complete records of processing and a data inventory.</li>
            <li>Complete a Data Protection Impact Assessment where required.</li>
            <li>Execute Data Processing Agreements and review international transfer mechanisms.</li>
            <li>Approve and enforce a retention and backup deletion schedule.</li>
            <li>Document rights-request identity verification, exceptions, and response deadlines.</li>
            <li>Establish incident response, breach assessment, and regulator and user notification procedures.</li>
            <li>Maintain a public subprocessor list and a process for changes.</li>
          </ul>
        </Section>

        <Section title="India DPDP Act readiness">
          <p>
            Registration requires an affirmative privacy choice and the service provides
            data access and deletion tools. The operating organization still needs to
            confirm its Data Fiduciary obligations, notice language, consent management,
            grievance process, retention rules, cross-border restrictions, and any
            Significant Data Fiduciary duties.
          </p>
        </Section>

        <Section title="HIPAA readiness and scope">
          <p>
            This page is not a HIPAA Notice of Privacy Practices. RaktaSetu's status as a
            covered entity, business associate, subcontractor, or service outside HIPAA
            scope has not been legally determined.
          </p>
          <p>
            If RaktaSetu creates, receives, maintains, or transmits protected health
            information for a covered entity, the operating organization must complete a
            HIPAA scope analysis and implement all applicable administrative, physical,
            and technical safeguards.
          </p>
          <h3>Work that remains before any HIPAA claim</h3>
          <ul>
            <li>Determine covered entity and business associate status for each relationship.</li>
            <li>Execute required Business Associate Agreements with hospitals and vendors.</li>
            <li>Confirm hosting services and configurations are eligible for regulated workloads.</li>
            <li>Complete an organization-wide risk analysis and risk management plan.</li>
            <li>Establish security responsibility, workforce training, sanctions, and access reviews.</li>
            <li>Define emergency access, contingency planning, backups, recovery, and testing.</li>
            <li>Establish incident response, breach risk assessment, and notification procedures.</li>
            <li>Validate audit coverage, retention, integrity, and ongoing log review.</li>
          </ul>
        </Section>

        <Section title="Known technical limitations">
          <ul>
            <li>Web access tokens stay in memory; refresh uses an HttpOnly cookie. Capacitor native still uses local storage.</li>
            <li>Multi-factor authentication is not currently implemented.</li>
            <li>The code does not provide automated key rotation or a complete secrets governance process.</li>
            <li>Audit logging covers selected events, not every read of sensitive data.</li>
            <li>Automated retention and backup deletion are not complete.</li>
            <li>Independent penetration testing and formal security certification are not evidenced in this repository.</li>
          </ul>
        </Section>

        <Section title="Reporting a security concern">
          <p>
            Send a concise description, affected URL, reproduction steps, and impact to
            {' '}<a href={`mailto:${CONTACT.security}`}>{CONTACT.security}</a>.
            Do not include live personal, medical, password, or token data in the report.
          </p>
          <p>
            The operating organization must confirm that this mailbox is monitored and
            publish response expectations. The source code cannot establish those
            operational commitments.
          </p>
        </Section>
      </article>
    </PublicShell>
  );
}
