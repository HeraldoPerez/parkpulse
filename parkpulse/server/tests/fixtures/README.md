# Test fixtures

Real responses from the National Park Service API (`https://developer.nps.gov/api/v1`), recorded on 9 November 2026, so the tests run without a network connection or an API key.

| File | Request | Notes |
| --- | --- | --- |
| `alerts.json` | `/alerts?parkCode=yell,grca,zion,acad&limit=50` | Unchanged. 14 alerts across 4 parks, every category. |
| `alerts_odd_codes.json` | taken from `/alerts?limit=1000` | The only 2 of 608 alerts whose `parkCode` isn't 4 letters: `"es-es/cham"` and `""`. |
| `parks.json` | taken from `/parks?limit=1000` | 6 of the 475 parks. Large arrays (images, activities, fees, hours…) emptied to keep the file small. |
| `empty.json` | `/alerts?parkCode=zzzz` | What the API sends for a park code that doesn't exist: a 200 with no data. |
| `error_api_key_invalid.json` | any request with a wrong key | Sent with status 403. |
| `error_api_key_missing.json` | any request without a key | Sent with status 403. |

The over-the-limit (429) response is written inline in `nps.test.js`, using the shape from the api.data.gov documentation, because getting a real one means using up the key's hourly limit.
