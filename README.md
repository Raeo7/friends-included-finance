# Friends Included — finance system

Day 4 homework. Staff report sales and expenses through Telegram or the website. The manager approves splits and allocations, and the results update automatically. All people and transactions are fictional.

| System           | Role                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| Supabase         | Source of truth: sales, expenses, proposals, decisions, Telegram links |
| Vercel (Next.js) | Website, forms, manager approvals, dashboard, Telegram webhook         |
| Telegram         | `/sale`, `/expense`, `/my`; confirmations and decision notifications   |
| Google Sheets    | Read-only copy: `Sales` and `Expenses` tabs, one row per reference     |

The same service layer (`src/server/service.ts`) handles bot and website actions, and role checks run on the server for every action.

## Rules implemented

- Commission pool = 10% of sale, split across Richard / Anastasia / Jean-Claude (must total 100%). Rounding is to cents, and any difference goes to the largest share (ties: Richard, Anastasia, Jean-Claude).
- Pending sales are excluded from income and commission. Every expense reduces company result immediately. Overhead expenses are allocated automatically; A/B expenses wait for the manager.
- Approval is a conditional update (`status = pending`), so a second approval changes nothing.
- The Sheets row is upserted by reference. Failures show `Sync failed` with a retry, and the transaction stays saved.
- Notifications go to the originating bot chat. Website entries go to the employee's linked chat, or show `No Telegram recipient linked`. A failed delivery shows the error and a retry.

## Setup

1. **Supabase**: create a project and run `supabase/schema.sql` in the SQL editor.
2. **Telegram**: create a bot with @BotFather and note the token and username.
3. **Google Sheets**: in Google Cloud, enable the Sheets API, create a service account and download a JSON key. Create a spreadsheet and share it with the service-account email as Editor, and share it with the instructor as Viewer. The tabs are created automatically.
4. **Vercel**: import the GitHub repo and set every variable from `.env.example` (`GOOGLE_PRIVATE_KEY` with `\n` escapes, as in the JSON key).
5. **Webhook**: copy `.env.example` to `.env.local` with the same Telegram values, then run:
   ```bash
   pnpm set-webhook https://<your-app>.vercel.app
   ```
6. **Before Test 1**: remove practice data (keeps Telegram links):
   ```bash
   pnpm reset-transactions --yes
   ```

## Running Test 1 (solo)

1. Send `/start` to the bot. As Svetlana, open **Manager setup** and link your ID to Richard.
2. Submit S01 in Telegram, e.g. `/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50/30/20`.
3. Relink your ID to Kevin and submit E01 in Telegram: `/expense E01 | Rented suit and fake pearl necklace for the relatives | Materials | 120 | A`.
4. Enter the rest on the website with the **Demonstration role** selector, then approve as Svetlana.

## Development

```bash
pnpm install
pnpm test        # unit, rule and full Test 1 + Test 2 scenario tests
pnpm lint && pnpm typecheck && pnpm format:check
```

`src/server/scenario.test.ts` replays both homework tests and asserts the published results. `rules.test.ts` covers permission denials, duplicates, double approval, and Sheets/Telegram failures with retry.
