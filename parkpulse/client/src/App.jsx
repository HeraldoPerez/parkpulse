import { useEffect, useMemo, useState } from "react";
import { getAlerts, getParks } from "./api.js";
import { ParkAlerts } from "./components/ParkAlerts.jsx";
import { ParkPicker } from "./components/ParkPicker.jsx";
import { countByCategory, timeAgo } from "./lib/format.js";
import { readSelection, writeSelection } from "./lib/selection.js";

const SUGGESTED = ["yell", "grca", "zion", "yose", "grsm", "romo"];

export default function App() {
  const [parkList, setParkList] = useState({ status: "loading" });
  const [selected, setSelected] = useState(() => readSelection());
  const [skipped, setSkipped] = useState([]);
  const [alerts, setAlerts] = useState({ status: "idle" });
  const [parksAttempt, setParksAttempt] = useState(0);
  const [alertsAttempt, setAlertsAttempt] = useState(0);

  // Load the park list for the picker.
  useEffect(() => {
    const controller = new AbortController();
    setParkList({ status: "loading" });
    getParks({ signal: controller.signal }).then(
      (data) => setParkList({ status: "ready", parks: data.parks }),
      (error) => {
        if (!controller.signal.aborted) setParkList({ status: "error", message: error.message });
      },
    );
    return () => controller.abort();
  }, [parksAttempt]);

  // Once the list is here, drop codes from an old link that aren't parks.
  const known = useMemo(() => new Set(parkList.parks?.map((p) => p.code)), [parkList.parks]);
  useEffect(() => {
    if (parkList.status !== "ready") return;
    const unknown = selected.filter((code) => !known.has(code));
    if (unknown.length > 0) {
      setSkipped(unknown);
      setSelected(selected.filter((code) => known.has(code)));
    }
  }, [parkList.status, known, selected]);

  useEffect(() => {
    writeSelection(selected);
  }, [selected]);

  // Load alerts whenever the picked parks change.
  const ready = parkList.status === "ready" && selected.every((code) => known.has(code));
  const key = selected.join(",");
  useEffect(() => {
    if (!ready || key === "") {
      setAlerts({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setAlerts((previous) => ({ ...previous, status: "loading" }));
    getAlerts(key.split(","), { signal: controller.signal }).then(
      (data) => setAlerts({ status: "ready", data }),
      (error) => {
        if (!controller.signal.aborted) setAlerts({ status: "error", message: error.message });
      },
    );
    return () => controller.abort();
  }, [ready, key, alertsAttempt]);

  const suggestions = SUGGESTED.filter((code) => known.has(code) && !selected.includes(code)).map((code) =>
    parkList.parks.find((p) => p.code === code),
  );

  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <span className="brand-name">ParkPulse</span>
        </div>
        <p className="tagline">Current alerts and closures for the national parks on your trip.</p>
      </header>

      <main>
        <section className="panel" aria-label="Choose parks">
          {parkList.status === "loading" && <p className="muted">Loading the list of parks…</p>}
          {parkList.status === "error" && (
            <Problem message={`Couldn't load the list of parks. ${parkList.message}`} onRetry={() => setParksAttempt((n) => n + 1)} />
          )}
          {parkList.status === "ready" && (
            <ParkPicker
              parks={parkList.parks}
              selected={selected}
              onChange={(codes) => {
                setSkipped([]);
                setSelected(codes);
              }}
            />
          )}
          {skipped.length > 0 && (
            <p className="notice" role="status">
              Skipped {skipped.join(", ")} from the link: {skipped.length === 1 ? "it isn't a park code" : "they aren't park codes"}.
            </p>
          )}
          {parkList.status === "ready" && selected.length === 0 && suggestions.length > 0 && (
            <div className="suggestions">
              <span className="muted">Try:</span>
              {suggestions.map((park) => (
                <button key={park.code} type="button" className="suggestion" onClick={() => setSelected([park.code])}>
                  {park.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <Results
          alerts={alerts}
          picked={selected.length}
          onRetry={() => setAlertsAttempt((n) => n + 1)}
        />
      </main>

      <footer className="site-footer">
        <p>
          Alerts come from the{" "}
          <a href="https://www.nps.gov/subjects/developer/" target="_blank" rel="noreferrer">
            National Park Service API
          </a>
          . ParkPulse isn't an official NPS product, so check{" "}
          <a href="https://www.nps.gov" target="_blank" rel="noreferrer">
            nps.gov
          </a>{" "}
          before you travel.
        </p>
        <p>
          <a href="https://github.com/Khalick/parkpulse" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

function Results({ alerts, picked, onRetry }) {
  if (picked === 0) {
    return (
      <section className="empty-state">
        <p>Pick the parks you're visiting to see their current alerts, closures and warnings in one place.</p>
      </section>
    );
  }
  if (alerts.status === "error") return <Problem message={alerts.message} onRetry={onRetry} />;
  if (!alerts.data) {
    return (
      <p className="muted" role="status">
        Checking with the park service…
      </p>
    );
  }

  const { data } = alerts;
  const now = Date.now();
  const all = data.parks.flatMap((park) => park.alerts);
  const summary = countByCategory(all)
    .map((c) => c.text)
    .join(", ");

  return (
    <section aria-label="Alerts" aria-busy={alerts.status === "loading"} className={alerts.status === "loading" ? "results updating" : "results"}>
      {data.stale && (
        <p className="notice warn" role="status">
          The park service isn't answering right now, so these alerts are from {timeAgo(data.fetchedAt, now)}. Check nps.gov before you go.
        </p>
      )}
      <p className="status-line">
        <strong>
          {all.length === 0 ? "No current alerts" : `${all.length} alert${all.length === 1 ? "" : "s"}`}
        </strong>
        {summary && ` · ${summary}`}
        <span className="muted"> · updated {timeAgo(data.fetchedAt, now)}</span>
      </p>
      {data.parks.map((park) => (
        <ParkAlerts key={park.code} park={park} now={now} />
      ))}
    </section>
  );
}

function Problem({ message, onRetry }) {
  return (
    <div className="notice error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
