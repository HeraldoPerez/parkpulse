# Changelog

Notable changes go here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Express server that fetches park and alert data from the National Park Service API. The key is sent only in a request header and never reaches the browser.
- Caching: the park list for 24 hours and all current alerts for 10 minutes. One request gets every park's alerts. If the API fails, the last good data is served and marked as stale.
- `GET /api/parks`, `GET /api/alerts?parks=…` and `GET /api/health`, with clear errors for unknown park codes, a missing or rejected key, and the hourly request limit.
- React app with a searchable park picker, alerts grouped by park and sorted by how serious they are, shareable links, and a note on alerts not updated in over a year.
- The server can also serve the built app, so it runs as a single service.
- Tests for the server (using recorded NPS responses) and the app, and GitHub Actions CI on Node 22, 24 and 26.
