import { PROJECT_NAMES, SHORT_NAMES } from "@/domain/employees";
import { formatEuro } from "@/domain/money";
import type { FinancialResults } from "@/domain/results";
import { SALESPEOPLE } from "@/domain/types";

function Money({ cents }: { cents: number }) {
  return <span className={cents < 0 ? "negative" : undefined}>{formatEuro(cents)}</span>;
}

export function Dashboard({ results }: { results: FinancialResults }) {
  const { projects: p, company: c } = results;
  const rows: [string, number | null, number | null, number][] = [
    ["Approved income", p.A.income, p.B.income, c.income],
    ["Commission expense", p.A.commission, p.B.commission, c.commission],
    [
      "Allocated project expenses",
      p.A.allocatedExpenses,
      p.B.allocatedExpenses,
      c.allocatedExpenses,
    ],
    ["Company overhead", null, null, c.overhead],
    ["Expenses awaiting allocation", null, null, c.awaitingAllocation],
  ];
  const totalCommission = SALESPEOPLE.reduce(
    (sum, s) => sum + results.commissionBySalesperson[s],
    0,
  );

  return (
    <section className="card">
      <h2>Financial results</h2>
      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">
                Project A<small>{PROJECT_NAMES.A}</small>
              </th>
              <th scope="col">
                Project B<small>{PROJECT_NAMES.B}</small>
              </th>
              <th scope="col">Company</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b, company]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{a === null ? "—" : <Money cents={a} />}</td>
                <td>{b === null ? "—" : <Money cents={b} />}</td>
                <td>
                  <Money cents={company} />
                </td>
              </tr>
            ))}
            <tr className="total">
              <th scope="row">Result</th>
              <td>
                <Money cents={p.A.result} />
              </td>
              <td>
                <Money cents={p.B.result} />
              </td>
              <td>
                <Money cents={c.result} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted reconciliation">
        Reconciliation: {formatEuro(p.A.result)} + {formatEuro(p.B.result)} −{" "}
        {formatEuro(c.overhead)} overhead − {formatEuro(c.awaitingAllocation)} awaiting allocation ={" "}
        {formatEuro(c.result)}
      </p>

      <div className="split-panels">
        <div>
          <h3>Commission earned</h3>
          <table className="compact">
            <tbody>
              {SALESPEOPLE.map((s) => (
                <tr key={s}>
                  <th scope="row">{SHORT_NAMES[s]}</th>
                  <td>
                    <Money cents={results.commissionBySalesperson[s]} />
                  </td>
                </tr>
              ))}
              <tr className="total">
                <th scope="row">Total</th>
                <td>
                  <Money cents={totalCommission} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>Not yet in project results</h3>
          <table className="compact">
            <tbody>
              <tr>
                <th scope="row">Pending sales ({results.pendingSales.count})</th>
                <td>
                  <Money cents={results.pendingSales.amount} />
                </td>
              </tr>
              <tr>
                <th scope="row">Expenses awaiting allocation ({results.awaitingExpenses.count})</th>
                <td>
                  <Money cents={results.awaitingExpenses.amount} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            Pending sales are excluded from income and commission. Awaiting expenses already reduce
            the company result but no project result.
          </p>
        </div>
      </div>
    </section>
  );
}
