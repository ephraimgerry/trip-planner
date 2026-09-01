// Trip Planner API client — talks to the backend modulith.
// The app still works fully offline on localStorage; set USE_API = true (or
// window.PLANNER_USE_API = true) to route trips/places through the backend.
// This is the single integration point for the incremental FE→API migration.
(function () {
  const BASE = (window.PLANNER_API_BASE) || "http://localhost:4177/api";
  const USE_API = !!window.PLANNER_USE_API; // default off; flip on when backend is running
  let TOKEN = null; // set after login; sent as Bearer (auth enforced later)

  async function req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error("API " + method + " " + path + " → " + res.status);
    return res.status === 204 ? null : res.json();
  }

  window.PlannerAPI = {
    get useApi() { return USE_API; },
    setToken(t) { TOKEN = t; },
    health: () => req("GET", "/../health"),
    auth: {
      register: (email, name) => req("POST", "/auth/register", { email, name }),
      login: (email) => req("POST", "/auth/login", { email }),
    },
    places: {
      list: (params = {}) => req("GET", "/places?" + new URLSearchParams(params)),
      get: (id) => req("GET", "/places/" + id),
      create: (p) => req("POST", "/places", p),
      update: (id, p) => req("PATCH", "/places/" + id, p),
      remove: (id) => req("DELETE", "/places/" + id),
    },
    trips: {
      list: () => req("GET", "/trips"),
      get: (id) => req("GET", "/trips/" + id),
      create: (t) => req("POST", "/trips", t),
      replace: (id, t) => req("PUT", "/trips/" + id, t),
      remove: (id) => req("DELETE", "/trips/" + id),
      setDay: (id, date, placeIds) => req("PUT", `/trips/${id}/plan/${date}`, { placeIds }),
      addAlt: (id, placeId) => req("POST", `/trips/${id}/alternatives`, { placeId }),
      removeAlt: (id, placeId) => req("DELETE", `/trips/${id}/alternatives/${placeId}`),
    },
  };
})();
