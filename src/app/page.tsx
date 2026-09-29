import { App } from "@/components/App";

export const dynamic = "force-dynamic";

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export default function Home() {
  const studentName = env("STUDENT_NAME") ?? "Student name not set";
  const botUsername = env("TELEGRAM_BOT_USERNAME");
  const sheetId = env("GOOGLE_SHEET_ID");
  const githubUrl = env("GITHUB_REPO_URL");

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">Day 4 homework · {studentName}</p>
          <h1>Friends Included Ltd — finance system</h1>
          <p className="tagline">
            All friendships expire at checkout. All people and transactions are fictional.
          </p>
        </div>
        <nav className="links" aria-label="Project links">
          {botUsername ? (
            <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">
              Telegram bot @{botUsername}
            </a>
          ) : (
            <span>Telegram bot link not configured</span>
          )}
          {sheetId ? (
            <a
              href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              Google Sheets copy
            </a>
          ) : (
            <span>Sheet link not configured</span>
          )}
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noreferrer">
              GitHub repository
            </a>
          ) : (
            <span>GitHub link not configured</span>
          )}
        </nav>
      </header>

      <details className="card instructions">
        <summary>How to use this system</summary>
        <ol>
          <li>
            Pick a <strong>Demonstration role</strong> below. Richard, Anastasia and Jean-Claude
            enter sales; Kevin enters expenses; Svetlana (manager) approves, sees all results and
            links Telegram accounts.
          </li>
          <li>
            <strong>Telegram:</strong> open the bot and send <code>/start</code>. It replies with
            your Telegram user ID. As Svetlana, open <em>Manager setup</em> and link that ID to an
            employee. Then submit with <code>/sale</code> or <code>/expense</code> (send{" "}
            <code>/help</code> for the format). <code>/my</code> lists your submissions.
          </li>
          <li>
            <strong>Website:</strong> as a salesperson or Kevin, use the entry form. Everything is
            saved as pending until Svetlana decides; Company overhead expenses are allocated
            automatically.
          </li>
          <li>
            <strong>Approvals:</strong> as Svetlana, open <em>Decisions waiting</em>. Inspect the
            original proposal, optionally change the split or allocation, and approve. The submitter
            is notified in Telegram; the record shows whether delivery worked.
          </li>
          <li>
            Every record shows its Google Sheets sync and Telegram delivery status, with a retry
            button if something failed. Supabase is the source of truth; the sheet is a read-only
            copy.
          </li>
        </ol>
      </details>

      <App />
    </main>
  );
}
