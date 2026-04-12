import { useEffect, useState } from "react";

import homeData from "./data/home.json";
import { supabase } from "./lib/supabase";
import "./App.css";

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const supabaseReady = Boolean(supabase);
  const { user, stats, trips, loyaltyAccounts, passes, actions } = homeData;

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const resetAlerts = () => {
    setError("");
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetAlerts();

    if (!supabase) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) {
          setError(signInError.message);
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setMessage("Account created. If email confirmation is disabled, you can log in now.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    resetAlerts();
    if (!supabase) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const redirectTo = window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
  };

  const displayName = user?.name || session?.user?.email || "Traveler";
  const flightSegments = trips.flatMap((trip) =>
    trip.segments.map((segment) => ({
      ...segment,
      tripId: trip.id,
      tripTitle: trip.title,
      tripStatus: trip.status
    }))
  );
  const hotelStays = trips.map((trip) => ({
    ...trip.hotel,
    tripId: trip.id,
    tripTitle: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status
  }));
  const renderLoyaltySection = (title, accounts) => (
    <section className="section">
      <div className="panel card">
        <div className="section-header">
          <h3>{title}</h3>
          <span className="pill">Synced</span>
        </div>
        <div className="list">
          {accounts.map((account) => (
            <div className="list-item" key={account.memberId}>
              <div>
                <p className="segment-title">{account.provider}</p>
                <p className="muted">Member {account.memberId}</p>
              </div>
              <div className="list-metric">
                <span>{account.points} pts</span>
                <span className="muted">{account.lastUpdated}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const airlineLoyaltyAccounts = loyaltyAccounts.filter((account) =>
    ["delta", "american", "united", "aerolineas"].some((name) =>
      account.provider.toLowerCase().includes(name)
    )
  );
  const hotelLoyaltyAccounts = loyaltyAccounts.filter((account) =>
    ["marriott", "sheraton", "hyatt"].some((name) =>
      account.provider.toLowerCase().includes(name)
    )
  );

  return (
    <div className="page">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="orb orb-three" />
      <main className="auth">
        <section className="panel">
          <header className="panel-header">
            <p className="eyebrow">TravelWallet</p>
            <h1>One login for every trip.</h1>
            <p className="subtitle">
              Keep reservations, loyalty details, and boarding passes in a single place.
            </p>
          </header>

          {!supabaseReady ? (
            <div className="notice warning">
              Supabase is not configured. Add your keys in <code>.env</code> to continue.
            </div>
          ) : null}

          {session ? (
            <div className="home">
              <nav className="tabs">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "flights", label: "Flights" },
                  { key: "hotels", label: "Hotels" },
                  { key: "passes", label: "Passes" }
                ].map((tab) => (
                  <button
                    className={activeTab === tab.key ? "active" : ""}
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <header className="home-header">
                <div>
                  <p className="eyebrow">Dashboard</p>
                  <h2>Welcome back, {displayName}</h2>
                  <p className="subtitle">
                    Home base {user.homeAirport} • Status {user.membershipStatus}
                  </p>
                </div>
                <div className="home-actions">
                  <button className="secondary" type="button" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              </header>

              {activeTab === "overview" ? (
                <>
                  <section className="stats">
                    <div className="stat-card">
                      <p className="muted">Upcoming trips</p>
                      <h3>{stats.upcomingTrips}</h3>
                    </div>
                    <div className="stat-card">
                      <p className="muted">Loyalty accounts</p>
                      <h3>{stats.loyaltyAccounts}</h3>
                    </div>
                    <div className="stat-card">
                      <p className="muted">Passes stored</p>
                      <h3>{stats.passesStored}</h3>
                    </div>
                  </section>

                  <section className="section">
                    <div className="section-header">
                      <h3>Upcoming trips</h3>
                      <span className="pill">Next 60 days</span>
                    </div>
                    <div className="trip-grid">
                      {trips.map((trip) => (
                        <article className="trip-card" key={trip.id}>
                          <div className="trip-top">
                            <div>
                              <h4>{trip.title}</h4>
                              <p className="muted">
                                {trip.startDate} - {trip.endDate}
                              </p>
                            </div>
                            <span className={`status ${trip.status.toLowerCase()}`}>
                              {trip.status}
                            </span>
                          </div>
                          {trip.segments.map((segment) => (
                            <div className="segment" key={`${trip.id}-${segment.code}`}>
                              <div>
                                <p className="segment-title">
                                  {segment.provider} {segment.code}
                                </p>
                                <p className="muted">
                                  {segment.from} to {segment.to}
                                </p>
                              </div>
                              <div className="segment-time">
                                <span>{segment.depart}</span>
                                <span>{segment.arrive}</span>
                              </div>
                            </div>
                          ))}
                          <div className="hotel">
                            <p className="segment-title">
                              {trip.hotel.provider} • {trip.hotel.name}
                            </p>
                            <p className="muted">
                              {trip.hotel.checkIn} check-in • {trip.hotel.checkOut} check-out
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="section split">
                    <div className="panel card">
                      <div className="section-header">
                        <h3>Loyalty accounts</h3>
                        <span className="pill">Synced</span>
                      </div>
                      <div className="list">
                        {loyaltyAccounts.map((account) => (
                          <div className="list-item" key={account.memberId}>
                            <div>
                              <p className="segment-title">{account.provider}</p>
                              <p className="muted">Member {account.memberId}</p>
                            </div>
                            <div className="list-metric">
                              <span>{account.points} pts</span>
                              <span className="muted">{account.lastUpdated}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="panel card">
                      <div className="section-header">
                        <h3>Boarding passes</h3>
                        <span className="pill">Stored</span>
                      </div>
                      <div className="list">
                        {passes.map((pass) => {
                          const passStatus = pass.status.toLowerCase().replace(/\s+/g, "-");
                          return (
                            <div className="list-item" key={pass.id}>
                              <div>
                                <p className="segment-title">{pass.provider}</p>
                                <p className="muted">
                                  {pass.route} • {pass.date}
                                </p>
                              </div>
                              <span className={`status ${passStatus}`}>{pass.status}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  <section className="section quick-actions">
                    <div className="section-header">
                      <h3>Quick actions</h3>
                    </div>
                    <div className="action-row">
                      {actions.map((action) => (
                        <button className="ghost" key={action} type="button">
                          {action}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {activeTab === "flights" ? (
                <>
                  <section className="section">
                    <div className="section-header">
                      <h3>Flights</h3>
                      <span className="pill">{flightSegments.length} segments</span>
                    </div>
                    <div className="trip-grid">
                      {flightSegments.map((segment) => (
                        <article className="trip-card" key={`${segment.tripId}-${segment.code}`}>
                          <div className="trip-top">
                            <div>
                              <h4>
                                {segment.provider} {segment.code}
                              </h4>
                              <p className="muted">{segment.tripTitle}</p>
                            </div>
                            <span className={`status ${segment.tripStatus.toLowerCase()}`}>
                              {segment.tripStatus}
                            </span>
                          </div>
                          <div className="segment">
                            <div>
                              <p className="segment-title">
                                {segment.from} to {segment.to}
                              </p>
                              <p className="muted">Gate and seat info will appear here.</p>
                            </div>
                            <div className="segment-time">
                              <span>{segment.depart}</span>
                              <span>{segment.arrive}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  {renderLoyaltySection("Airline loyalty accounts", airlineLoyaltyAccounts)}
                </>
              ) : null}

              {activeTab === "hotels" ? (
                <>
                  <section className="section">
                    <div className="section-header">
                      <h3>Hotels</h3>
                      <span className="pill">{hotelStays.length} stays</span>
                    </div>
                    <div className="trip-grid">
                      {hotelStays.map((stay) => (
                        <article className="trip-card" key={`${stay.tripId}-${stay.name}`}>
                          <div className="trip-top">
                            <div>
                              <h4>{stay.name}</h4>
                              <p className="muted">{stay.provider}</p>
                            </div>
                            <span className={`status ${stay.status.toLowerCase()}`}>
                              {stay.status}
                            </span>
                          </div>
                          <div className="segment">
                            <div>
                              <p className="segment-title">{stay.tripTitle}</p>
                              <p className="muted">
                                {stay.checkIn} check-in • {stay.checkOut} check-out
                              </p>
                            </div>
                            <div className="segment-time">
                              <span>{stay.startDate}</span>
                              <span>{stay.endDate}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  {renderLoyaltySection("Hotel loyalty accounts", hotelLoyaltyAccounts)}
                </>
              ) : null}

              {activeTab === "passes" ? (
                <section className="section">
                  <div className="section-header">
                    <h3>Boarding passes</h3>
                    <span className="pill">{passes.length} saved</span>
                  </div>
                  <div className="list">
                    {passes.map((pass) => {
                      const passStatus = pass.status.toLowerCase().replace(/\s+/g, "-");
                      return (
                        <div className="list-item" key={pass.id}>
                          <div>
                            <p className="segment-title">{pass.provider}</p>
                            <p className="muted">
                              {pass.route} • {pass.date}
                            </p>
                          </div>
                          <span className={`status ${passStatus}`}>{pass.status}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              <div className="toggle">
                <button
                  className={mode === "login" ? "active" : ""}
                  type="button"
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
                <button
                  className={mode === "signup" ? "active" : ""}
                  type="button"
                  onClick={() => setMode("signup")}
                >
                  Create account
                </button>
              </div>

              <label>
                Email
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@domain.com"
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label>
                Password
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  required
                  type="password"
                  value={password}
                />
              </label>

              {error ? <div className="notice error">{error}</div> : null}
              {message ? <div className="notice success">{message}</div> : null}

              <button className="primary" disabled={loading} type="submit">
                {loading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
              </button>

              <div className="divider">
                <span>or</span>
              </div>

              <button className="google" onClick={handleGoogle} type="button">
                Continue with Google
              </button>
            </form>
          )}
        </section>

      </main>
    </div>
  );
}

export default App;
