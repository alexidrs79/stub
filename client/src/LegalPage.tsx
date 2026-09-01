import { Link } from "react-router-dom"

type LegalPageProps = {
  page: "privacy" | "terms"
}

export function LegalPage({ page }: LegalPageProps) {
  const privacy = page === "privacy"

  return (
    <main className="legal-page pb-24 pt-12">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
        {privacy ? "PRIVACY" : "TERMS"}
      </p>
      <h1>{privacy ? "Your archive, kept private" : "The house rules"}</h1>
      <p className="legal-updated">EFFECTIVE AUGUST 31, 2026</p>

      {privacy ? (
        <div className="legal-copy">
          <section>
            <h2>What Stub stores</h2>
            <p>
              Stub stores your email address, display name, securely hashed password,
              watchlists, custom lists, ratings, notes, favorites, viewing progress,
              and diary entries. This information provides your private movie and
              television archive.
            </p>
          </section>
          <section>
            <h2>How your data is used</h2>
            <p>
              Your data is used only to operate Stub, secure your account, and send
              password-reset emails you request. Stub does not sell your personal data
              or display your archive publicly.
            </p>
          </section>
          <section>
            <h2>Cookies and services</h2>
            <p>
              Stub uses one essential, HTTP-only authentication cookie. Movie,
              television, and person metadata and imagery come from TMDb. Password
              recovery emails are delivered through Resend when configured.
            </p>
          </section>
          <section>
            <h2>Your choices</h2>
            <p>
              You can edit your display name or password in Settings. You can also
              permanently delete your account there, which removes your archive and
              account data from the active database. Provider backups may retain an
              encrypted copy until their normal retention period ends.
            </p>
          </section>
        </div>
      ) : (
        <div className="legal-copy">
          <section>
            <h2>Using Stub</h2>
            <p>
              Stub is a personal movie and television tracking service. Keep your
              account credentials secure and do not use the service to abuse,
              interfere with, or overload Stub or its data providers.
            </p>
          </section>
          <section>
            <h2>Your archive</h2>
            <p>
              You retain responsibility for notes and other content you add. Do not
              enter unlawful, harmful, or sensitive information. Stub may remove
              content or accounts used to disrupt the service.
            </p>
          </section>
          <section>
            <h2>Availability</h2>
            <p>
              Stub relies on third-party services, including TMDb, and may occasionally
              be unavailable or show incomplete metadata. The service is provided
              without a guarantee of uninterrupted availability.
            </p>
          </section>
          <section>
            <h2>TMDb</h2>
            <p>
              This product uses the TMDb API but is not endorsed or certified by TMDb.
              TMDb content remains subject to TMDb’s terms and policies.
            </p>
          </section>
        </div>
      )}

      <Link to="/" className="back-control mt-12">
        ← BACK TO STUB
      </Link>
    </main>
  )
}
