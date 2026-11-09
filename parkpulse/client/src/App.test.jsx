import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import App from "./App.jsx";
import { alert, alertsResponse, parks } from "./test/data.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fakes the ParkPulse server. `routes` maps a path (without query) to a function of the URL. */
function mockServer(routes = {}) {
  const handlers = {
    "/api/parks": () => json({ fetchedAt: "2026-11-09T12:00:00.000Z", stale: false, parks }),
    "/api/alerts": () => json({ ...alertsResponse, fetchedAt: new Date().toISOString() }),
    ...routes,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input, "http://localhost");
    const handler = handlers[url.pathname];
    return handler ? handler(url) : json({ error: "Not found" }, 404);
  });
}

function openAt(path) {
  window.history.replaceState(null, "", path);
}

describe("App", () => {
  test("with nothing picked, invites you to pick parks and suggests some", async () => {
    mockServer();
    render(<App />);
    expect(await screen.findByRole("combobox", { name: "Parks on your trip" })).toBeInTheDocument();
    expect(screen.getByText(/Pick the parks you're visiting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yellowstone" })).toBeInTheDocument();
  });

  test("a shared link shows alerts for those parks, grouped and counted", async () => {
    const fetch = mockServer();
    openAt("/?parks=yell,zion");
    render(<App />);

    const yellowstone = await screen.findByRole("article", { name: "Yellowstone National Park" });
    expect(within(yellowstone).getByRole("list", { name: "Alert counts" })).toHaveTextContent("1 closure1 info alert");
    expect(within(yellowstone).getByRole("heading", { name: "Most Park Roads Closed to All Vehicles" })).toBeInTheDocument();
    expect(within(yellowstone).getByText("Closure")).toBeInTheDocument();
    expect(within(yellowstone).getByRole("link", { name: /More details/ })).toHaveAttribute(
      "href",
      "https://www.nps.gov/yell/planyourvisit/parkroads.htm",
    );
    expect(within(yellowstone).getByRole("link", { name: /Road conditions/ })).toHaveAttribute(
      "href",
      "https://www.nps.gov/yell/planyourvisit/conditions.htm",
    );

    const zion = screen.getByRole("article", { name: "Zion National Park" });
    expect(within(zion).getByText("No current alerts from the park service.")).toBeInTheDocument();

    expect(screen.getByText("2 alerts")).toBeInTheDocument();
    expect(screen.getByText(/updated just now/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/alerts?parks=yell,zion", expect.anything());
  });

  test("picking a suggestion loads its alerts and updates the link", async () => {
    const user = userEvent.setup();
    mockServer();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Yellowstone" }));
    expect(await screen.findByRole("article", { name: "Yellowstone National Park" })).toBeInTheDocument();
    expect(window.location.search).toBe("?parks=yell");
    expect(window.localStorage.getItem("parkpulse:parks")).toBe("yell");
  });

  test("remembers the last parks when opened without a link", async () => {
    mockServer();
    window.localStorage.setItem("parkpulse:parks", "yell");
    render(<App />);
    expect(await screen.findByRole("article", { name: "Yellowstone National Park" })).toBeInTheDocument();
  });

  test("codes in a link that aren't parks are skipped, with a note", async () => {
    const fetch = mockServer();
    openAt("/?parks=yell,zzzz");
    render(<App />);
    expect(await screen.findByText(/Skipped zzzz from the link/)).toBeInTheDocument();
    await screen.findByRole("article", { name: "Yellowstone National Park" });
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("zzzz"), expect.anything());
  });

  test("marks alerts the park service hasn't updated in over a year", async () => {
    mockServer({
      "/api/alerts": () =>
        json({
          fetchedAt: new Date().toISOString(),
          stale: false,
          parks: [{ ...alertsResponse.parks[1], alerts: [alert("zion", "OLD1", "Caution", "Old notice", "2015-05-21")] }],
        }),
    });
    openAt("/?parks=zion");
    render(<App />);
    expect(await screen.findByText(/Updated May 21, 2015 · over a year ago, may be out of date/)).toBeInTheDocument();
  });

  test("warns when the alerts are stale", async () => {
    mockServer({
      "/api/alerts": () => json({ ...alertsResponse, stale: true, fetchedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }),
    });
    openAt("/?parks=yell");
    render(<App />);
    expect(await screen.findByText(/isn't answering right now, so these alerts are from 3 hours ago/)).toBeInTheDocument();
  });

  test("shows the server's error and can try again", async () => {
    const user = userEvent.setup();
    let fail = true;
    mockServer({
      "/api/alerts": () =>
        fail
          ? json({ error: "ParkPulse has hit the National Park Service's request limit. Try again in a few minutes." }, 503)
          : json({ ...alertsResponse, fetchedAt: new Date().toISOString() }),
    });
    openAt("/?parks=yell");
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("request limit");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Yellowstone National Park" })).toBeInTheDocument();
  });

  test("says so when the server can't be reached at all", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the list of parks. Couldn't reach the ParkPulse server.");
  });
});
