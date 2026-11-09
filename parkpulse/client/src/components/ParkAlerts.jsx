import { categoryInfo, countByCategory, formatDate, isOld } from "../lib/format.js";

/** One park's current alerts, most serious first. */
export function ParkAlerts({ park, now }) {
  const headingId = `park-${park.code}`;
  const counts = countByCategory(park.alerts);

  return (
    <article className="park" aria-labelledby={headingId}>
      <header className="park-head">
        <h2 id={headingId}>{park.fullName}</h2>
        <a className="park-link" href={park.url} target="_blank" rel="noreferrer">
          Park website<span className="visually-hidden"> for {park.fullName} (opens in a new tab)</span>
        </a>
      </header>

      {park.alerts.length === 0 ? (
        <p className="park-clear">No current alerts from the park service.</p>
      ) : (
        <>
          <ul className="counts" aria-label="Alert counts">
            {counts.map((c) => (
              <li key={c.category} className={`count tone-${c.tone}`}>
                {c.text}
              </li>
            ))}
          </ul>
          <ul className="alerts">
            {park.alerts.map((alert) => (
              <AlertItem key={alert.id || alert.title} alert={alert} now={now} />
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

function AlertItem({ alert, now }) {
  const info = categoryInfo(alert.category);
  const old = isOld(alert.lastUpdated, now);
  const roadUrl = alert.roadEvents.find((event) => event.url && event.url !== alert.url)?.url;

  return (
    <li className={`alert tone-${info.tone}`}>
      <div className="alert-meta">
        <span className="badge">{info.label}</span>
        {alert.lastUpdated && (
          <span className={old ? "alert-date old" : "alert-date"}>
            Updated {formatDate(alert.lastUpdated)}
            {old && " · over a year ago, may be out of date"}
          </span>
        )}
      </div>
      <h3 className="alert-title">{alert.title}</h3>
      {alert.description && <p className="alert-text">{alert.description}</p>}
      {(alert.url || roadUrl) && (
        <p className="alert-links">
          {alert.url && (
            <a href={alert.url} target="_blank" rel="noreferrer">
              More details<span className="visually-hidden"> about {alert.title} (opens in a new tab)</span>
            </a>
          )}
          {roadUrl && (
            <a href={roadUrl} target="_blank" rel="noreferrer">
              Road conditions<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
        </p>
      )}
    </li>
  );
}
