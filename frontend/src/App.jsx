import { useEffect, useState } from "react";

import { apiBaseUrl } from "./lib/config";
import "./App.css";

function App() {
  const [health, setHealth] = useState("checking...");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiBaseUrl}/health`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data) => setHealth(data.status ?? "unknown"))
      .catch(() => setHealth("unreachable"));

    return () => controller.abort();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>TravelWallet</h1>
        <p>Prototype UI wired to FastAPI and Supabase.</p>
      </header>
      <section className="card">
        <h2>API Status</h2>
        <p>{health}</p>
        <p className="hint">Set VITE_API_BASE_URL if the API runs elsewhere.</p>
      </section>
    </div>
  );
}

export default App;
