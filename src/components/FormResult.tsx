export type Outcome =
  { kind: "ok"; lines: string[] } | { kind: "error"; message: string; details: string[] };

export function FormResult({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;
  if (outcome.kind === "ok") {
    return (
      <div className="alert success" role="status">
        {outcome.lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="alert error" role="alert">
      <strong>{outcome.message}</strong>
      {outcome.details.length > 0 && (
        <ul>
          {outcome.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
