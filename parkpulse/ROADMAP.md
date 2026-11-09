# Roadmap

Estimates are rough and include tests.

## v0.1.0

- [x] Express server that keeps the NPS API key private, with caching
- [x] Park picker
- [x] Alerts and closures view
- [ ] Campground status: each picked park's campgrounds, with open season, number of sites, first-come or reservable, and a link to book (~4h)
- [ ] Deploy to a Node host (Render or Railway), with the key set in the host's settings, and add the live link to the README (~2h)
- [ ] Gzip API responses; the park list is 110 KB uncompressed (~1h)
- [ ] Release v0.1.0 (~1h)

## v0.2.0

- [ ] Trip dates: only show alerts that matter for your trip (~8h). The API gives alerts no start or end dates, only when they were last updated, so this means finding dates in the alert text ("Nov 9-25", "April 1 through November 24, 2026") and keeping alerts without dates.
- [ ] Filter alerts by category, such as closures only (~2h)
- [ ] Map view of the picked parks, using the coordinates the server already sends (~6h)
- [ ] Weekly RSS digest for a set of parks (~5h)

## Later

- [ ] Offline PWA: open the last alerts you loaded without a connection (~4h)
- [ ] Show what changed since your last visit (new and removed alerts) (~4h)
- [ ] Visitor center hours and today's park events (~5h)
- [ ] End-to-end browser tests with Playwright (~4h)
- [ ] Accessibility check with a screen reader on phone and desktop (~2h)
