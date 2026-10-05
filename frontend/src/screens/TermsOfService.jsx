import React from 'react';
import { CONTACT } from '../config.js';
import { Link } from 'react-router-dom';
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

export default function TermsOfService() {
  usePageMeta({
    title: 'Terms of Service | RaktaSetu',
    description: 'Terms and service boundaries for donors and hospitals using RaktaSetu.',
    path: '/terms',
  });

  return (
    <PublicShell>
      <article className="policy-wrap">
        <p className="policy-kicker">Service terms</p>
        <h1>Terms of Service</h1>
        <p className="policy-lede">
          These terms describe the current service, its limits, and the responsibilities
          of donors and participating hospitals.
        </p>
        <p className="policy-date">Effective date: 15 July 2026 · Draft for organizational and legal approval</p>

        <div className="policy-callout">
          These terms are a product draft, not a substitute for legal review. The
          operating legal entity, governing law, dispute process, and authorized
          signatory must be confirmed before broad production use.
        </div>

        <Section title="1. What RaktaSetu provides">
          <p>
            RaktaSetu provides account, matching, notification, and coordination tools
            for blood donors and participating hospitals. The service can help a hospital
            share a request with compatible, available donors in a selected area.
          </p>
          <p>
            RaktaSetu is not an ambulance service, blood bank, healthcare provider,
            clinical screening service, medical device, or source of medical advice.
            It does not guarantee that a donor, hospital, blood unit, or successful match
            will be available.
          </p>
        </Section>

        <Section title="2. Emergencies and medical decisions">
          <p>
            Do not rely on the application as the only response to a medical emergency.
            Contact local emergency services and appropriate healthcare professionals.
            Hospitals remain responsible for donor screening, informed consent,
            collection, testing, storage, transfusion decisions, and applicable records.
          </p>
        </Section>

        <Section title="3. Account eligibility and accuracy">
          <ul>
            <li>Donor accounts are intended for people aged 18 or older.</li>
            <li>Users must provide accurate, current information and protect account credentials.</li>
            <li>Users must not impersonate another person or organization.</li>
            <li>Hospital users must have authority to act for the named organization.</li>
            <li>Account verification indicators do not replace clinical or regulatory checks.</li>
          </ul>
        </Section>

        <Section title="4. Donor responsibilities">
          <p>
            Donors choose whether to go on call and whether to respond. A response does
            not confirm eligibility. Donors must follow hospital instructions, disclose
            relevant information honestly during screening, and avoid donating when a
            qualified professional advises against it.
          </p>
        </Section>

        <Section title="5. Hospital responsibilities">
          <p>
            Hospital users must submit genuine requests, limit access to authorized
            staff, use donor information only for legitimate coordination and care
            purposes, and comply with applicable healthcare, blood banking, privacy, and
            security obligations. Hospitals must not treat a software match as proof of
            donor eligibility or blood compatibility.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>Users must not:</p>
          <ul>
            <li>submit false requests or manipulate donation records or credits</li>
            <li>harass, exploit, sell access to, or discriminate against donors</li>
            <li>attempt to bypass role permissions or access another user's data</li>
            <li>introduce malicious code, scrape protected data, or disrupt the service</li>
            <li>use the service for advertising, data brokerage, or unrelated solicitation</li>
          </ul>
        </Section>

        <Section title="7. Availability and changes">
          <p>
            The service may be interrupted, delayed, changed, or withdrawn. Features can
            depend on device permissions, network access, hosting providers, and hospital
            participation. Where practical, material changes will be communicated in the
            application.
          </p>
        </Section>

        <Section title="8. Suspension and termination">
          <p>
            Access may be limited when needed to address security, abuse, legal demands,
            false information, or risk to users. Users can request account deletion
            through the <Link to="/data-rights">Data Rights Center</Link>. Some records
            may be retained where a valid legal or safety requirement applies.
          </p>
        </Section>

        <Section title="9. Privacy and security">
          <p>
            The <Link to="/privacy">Privacy Policy</Link> explains current information
            practices. The <Link to="/security-readiness">Security and Readiness Statement</Link> describes
            technical safeguards and material organizational work that remains.
          </p>
        </Section>

        <Section title="10. Disclaimers and liability">
          <p>
            The final warranty, liability, indemnity, governing law, and dispute terms
            require approval by counsel for the operating organization. Until then, the
            service should be treated as an evaluation product and not as the sole system
            for critical clinical or emergency operations.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about these terms can be sent to
            {' '}<a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>.
          </p>
        </Section>
      </article>
    </PublicShell>
  );
}
