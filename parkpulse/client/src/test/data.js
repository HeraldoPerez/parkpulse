// Small responses shaped like the ParkPulse server's, so the tests are easy to read.
// Park names and the Yellowstone alert titles are real NPS data from November 2026
// (see server/tests/fixtures); the descriptions are made up and short.

export const parks = [
  park("acad", "Acadia", "Acadia National Park", "National Park", ["ME"]),
  park("grca", "Grand Canyon", "Grand Canyon National Park", "National Park", ["AZ"]),
  park("grsm", "Great Smoky Mountains", "Great Smoky Mountains National Park", "National Park", ["NC", "TN"]),
  park("havo", "Hawaiʻi Volcanoes", "Hawaiʻi Volcanoes National Park", "National Park", ["HI"]),
  park("yell", "Yellowstone", "Yellowstone National Park", "National Park", ["ID", "MT", "WY"]),
  park("zion", "Zion", "Zion National Park", "National Park", ["UT"]),
  park("arch", "Arches", "Arches National Park", "National Park", ["UT"]),
  park("cebr", "Cedar Breaks", "Cedar Breaks National Monument", "National Monument", ["UT"]),
];

export const alertsResponse = {
  fetchedAt: "2026-11-09T12:00:00.000Z",
  stale: false,
  parks: [
    {
      code: "yell",
      name: "Yellowstone",
      fullName: "Yellowstone National Park",
      url: "https://www.nps.gov/yell/index.htm",
      alerts: [
        alert("yell", "A14CFF34", "Park Closure", "Most Park Roads Closed to All Vehicles", "2026-10-29", {
          url: "https://www.nps.gov/yell/planyourvisit/parkroads.htm",
        }),
        alert("yell", "57EFE369", "Information", "Traffic Delays - Gardner River High Bridge", "2026-10-29", {
          roadEvents: [{ id: "57EFE369", title: "Traffic Delays", url: "https://www.nps.gov/yell/planyourvisit/conditions.htm" }],
        }),
      ],
    },
    {
      code: "zion",
      name: "Zion",
      fullName: "Zion National Park",
      url: "https://www.nps.gov/zion/index.htm",
      alerts: [],
    },
  ],
};

export function park(code, name, fullName, designation, states) {
  return { code, name, fullName, designation, states, latitude: null, longitude: null, url: `https://www.nps.gov/${code}/index.htm` };
}

export function alert(parkCode, id, category, title, lastUpdated, extra = {}) {
  return {
    id,
    parkCode,
    title,
    description: `${title}. Details from the park.`,
    category,
    url: null,
    lastUpdated,
    roadEvents: [],
    ...extra,
  };
}
