import { useEffect, useRef, useState } from "react";

import homeData from "./data/home.json";
import { apiBaseUrl } from "./lib/config";
import { supabase } from "./lib/supabase";
import "./App.css";

const HOTEL_PROVIDERS = [
  { key: "hyatt", name: "World of Hyatt", shortName: "Hyatt" },
  { key: "marriott", name: "Marriott Bonvoy", shortName: "Marriott" }
];

const EMPTY_PROVIDER_SLICE = {
  account: null,
  status: "",
  error: "",
  prompt: "",
  loading: false,
  hasCredentials: false,
  hasSession: false
};

function createInitialProviderStates() {
  return Object.fromEntries(
    HOTEL_PROVIDERS.map((p) => [p.key, { ...EMPTY_PROVIDER_SLICE }])
  );
}

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [hyattUsername, setHyattUsername] = useState("");
  const [hyattLastName, setHyattLastName] = useState("");
  const [hyattPassword, setHyattPassword] = useState("");
  const [providerStates, setProviderStates] = useState(createInitialProviderStates);
  const [activeHotelProvider, setActiveHotelProvider] = useState("hyatt");
  const [credentialsSaveLoading, setCredentialsSaveLoading] = useState(false);
  const providerSyncLocks = useRef({});
  const activeSyncProviderRef = useRef(null);
  const hyattAutoSyncAttemptedRef = useRef("");
  const [savedHotelProviders, setSavedHotelProviders] = useState([]);
  const supabaseReady = Boolean(supabase);
  const { user, stats, trips, loyaltyAccounts, passes, actions } = homeData;
  const hotelProviders = HOTEL_PROVIDERS;
  const activeProviderMeta =
    hotelProviders.find((provider) => provider.key === activeHotelProvider) ?? hotelProviders[0];
  const activeProviderShortName = activeProviderMeta.shortName;
  const activeFormState = providerStates[activeHotelProvider] ?? EMPTY_PROVIDER_SLICE;

  const anySyncInFlight = Object.values(providerStates).some((p) => p?.loading);

  const updateProviderState = (providerKey, partial) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerKey]: { ...(prev[providerKey] ?? { ...EMPTY_PROVIDER_SLICE }), ...partial }
    }));
  };

  const getProviderShortName = (providerKey) =>
    hotelProviders.find((p) => p.key === providerKey)?.shortName ?? providerKey;

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

  useEffect(() => {
    if (!session) {
      setProviderStates(createInitialProviderStates());
      setSavedHotelProviders([]);
      hyattAutoSyncAttemptedRef.current = "";
      return;
    }

    if (activeTab !== "hotels") {
      hyattAutoSyncAttemptedRef.current = "";
      return;
    }

    const attemptKey = `${session.user?.id ?? "session"}:${activeHotelProvider}`;
    if (hyattAutoSyncAttemptedRef.current === attemptKey) {
      return;
    }
    hyattAutoSyncAttemptedRef.current = attemptKey;

    let cancelled = false;

    const initializeActiveProvider = async () => {
      try {
        const status = await fetchProviderStatus(activeHotelProvider);
        if (cancelled) {
          return;
        }
        applyProviderStatus(activeHotelProvider, status);
      } catch (_loadError) {
        if (!cancelled) {
          const shortName = getProviderShortName(activeHotelProvider);
          updateProviderState(activeHotelProvider, {
            account: null,
            hasSession: false,
            error: `Unable to load ${shortName} sync status.`,
            prompt: `Click Sync now to open ${shortName} sign-in.`
          });
        }
      }
    };

    void initializeActiveProvider();

    return () => {
      cancelled = true;
    };
  }, [session, activeHotelProvider, activeTab]);

  useEffect(() => {
    if (!session || activeTab !== "hotels") {
      return;
    }

    let cancelled = false;

    const loadSavedHotelProviders = async () => {
      const savedProviders = [];
      for (const provider of hotelProviders) {
        try {
          const status = await fetchProviderStatus(provider.key);
          if (status.has_credentials) {
            savedProviders.push(provider.key);
          }
        } catch (_error) {
          // Ignore provider status failures in this listing.
        }
      }

      if (!cancelled) {
        setSavedHotelProviders(savedProviders);
      }
    };

    void loadSavedHotelProviders();

    return () => {
      cancelled = true;
    };
  }, [session, activeTab]);

  useEffect(() => {
    if (!session || activeTab !== "hotels" || savedHotelProviders.length === 0) {
      return undefined;
    }

    let cancelled = false;

    const hydrateSavedProviders = async () => {
      for (const providerKey of savedHotelProviders) {
        try {
          const status = await fetchProviderStatus(providerKey);
          if (cancelled) {
            return;
          }
          applyProviderStatus(providerKey, status);
        } catch (_error) {
          // Ignore per-provider status failures when hydrating cards.
        }
      }
    };

    void hydrateSavedProviders();

    return () => {
      cancelled = true;
    };
  }, [session, activeTab, savedHotelProviders]);

  const resetAlerts = () => {
    setError("");
    setMessage("");
  };

  const readResponseMessage = async (response, fallbackMessage) => {
    try {
      const data = await response.json();
      if (typeof data?.detail === "string" && data.detail) {
        return data.detail;
      }
    } catch (_error) {
      return fallbackMessage;
    }
    return fallbackMessage;
  };

  const applyProviderStatus = (providerKey, status) => {
    const shortName = getProviderShortName(providerKey);
    let prompt = "";
    if (!status.has_session) {
      if (status.has_credentials) {
        prompt = `Click Sync now to open ${shortName} sign-in with your saved details prefilled.`;
      } else {
        prompt = `Click Sync now to open ${shortName} sign-in, or save your ${shortName} details first for prefill.`;
      }
    }
    updateProviderState(providerKey, {
      hasCredentials: status.has_credentials,
      hasSession: status.has_session,
      prompt
    });
  };

  const fetchProviderStatus = async (providerKey) => {
    const response = await fetch(`${apiBaseUrl}/providers/${providerKey}/status`);
    if (!response.ok) {
      const providerMeta =
        hotelProviders.find((provider) => provider.key === providerKey) ?? hotelProviders[0];
      throw new Error(`Unable to load ${providerMeta.shortName} sync status.`);
    }
    return response.json();
  };

  const beginProviderSync = (providerKey) => {
    if (activeSyncProviderRef.current !== null && activeSyncProviderRef.current !== providerKey) {
      return false;
    }
    if (providerSyncLocks.current[providerKey]) {
      return false;
    }
    providerSyncLocks.current[providerKey] = true;
    activeSyncProviderRef.current = providerKey;
    return true;
  };

  const endProviderSync = (providerKey) => {
    providerSyncLocks.current[providerKey] = false;
    if (activeSyncProviderRef.current === providerKey) {
      activeSyncProviderRef.current = null;
    }
  };

  const syncProvider = async (providerKey) => {
    if (!beginProviderSync(providerKey)) {
      return false;
    }

    const shortName = getProviderShortName(providerKey);
    updateProviderState(providerKey, {
      error: "",
      prompt: "",
      status: "",
      loading: true
    });

    try {
      const response = await fetch(`${apiBaseUrl}/providers/${providerKey}/sync`, {
        method: "POST"
      });
      if (response.status === 409) {
        updateProviderState(providerKey, {
          account: null,
          hasSession: false,
          prompt: `Click Sync now to open ${shortName} sign-in.`,
          error: await readResponseMessage(response, `${shortName} needs you to sign in again.`)
        });
        return false;
      }
      if (response.status === 404) {
        updateProviderState(providerKey, {
          account: null,
          hasCredentials: false,
          hasSession: false,
          prompt: `Click Sync now to open ${shortName} sign-in, or save your ${shortName} details first for prefill.`,
          error: `No ${shortName} connection is saved yet.`
        });
        return false;
      }
      if (!response.ok) {
        throw new Error(
          await readResponseMessage(response, `Unable to sync ${shortName} account yet.`)
        );
      }
      const data = await response.json();
      updateProviderState(providerKey, {
        account: data.account,
        status: `Last synced ${data.account.last_updated}`,
        prompt: "",
        hasCredentials: true,
        hasSession: true
      });
      return true;
    } catch (syncError) {
      updateProviderState(providerKey, {
        account: null,
        hasSession: false,
        error: syncError.message,
        prompt: `Click Sync now to open ${shortName} sign-in.`
      });
      return false;
    } finally {
      updateProviderState(providerKey, { loading: false });
      endProviderSync(providerKey);
    }
  };

  const connectProvider = async (providerKey) => {
    if (!beginProviderSync(providerKey)) {
      return;
    }

    const shortName = getProviderShortName(providerKey);
    updateProviderState(providerKey, {
      loading: true,
      error: "",
      status: `Browser opened. Finish ${shortName} sign-in there.`,
      prompt: "Your saved details will be prefilled when available."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/providers/${providerKey}/connect`, {
        method: "POST"
      });
      if (response.status === 409) {
        throw new Error(
          await readResponseMessage(response, `${shortName} sign-in was not completed.`)
        );
      }
      if (!response.ok) {
        throw new Error(await readResponseMessage(response, `Unable to open ${shortName} sign-in.`));
      }
      const data = await response.json();
      updateProviderState(providerKey, {
        account: data.account,
        hasSession: true,
        status: `Last synced ${data.account.last_updated}`,
        prompt: ""
      });
    } catch (connectError) {
      updateProviderState(providerKey, {
        account: null,
        hasSession: false,
        error: connectError.message,
        prompt: `Click Sync now to open ${shortName} sign-in again.`
      });
    } finally {
      updateProviderState(providerKey, { loading: false });
      endProviderSync(providerKey);
    }
  };

  const saveProviderCredentials = async (event) => {
    event.preventDefault();
    updateProviderState(activeHotelProvider, { error: "", status: "" });
    setCredentialsSaveLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/providers/${activeHotelProvider}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: hyattUsername,
          last_name: hyattLastName,
          password: hyattPassword
        })
      });
      if (!response.ok) {
        throw new Error(`Unable to save ${activeProviderShortName} credentials.`);
      }
      setHyattPassword("");
      setHyattLastName("");
      updateProviderState(activeHotelProvider, {
        account: null,
        hasCredentials: true,
        hasSession: false,
        status: `${activeProviderShortName} details saved.`,
        prompt: `Click Sync now to open ${activeProviderShortName} sign-in with your saved details prefilled.`
      });
      setSavedHotelProviders((current) =>
        current.includes(activeHotelProvider) ? current : [...current, activeHotelProvider]
      );
    } catch (saveError) {
      updateProviderState(activeHotelProvider, { error: saveError.message });
    } finally {
      setCredentialsSaveLoading(false);
    }
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

  const syncedHotelCards = savedHotelProviders.map((providerKey) => {
    const providerMeta = hotelProviders.find((provider) => provider.key === providerKey);
    if (!providerMeta) {
      return null;
    }
    const slice = providerStates[providerKey] ?? EMPTY_PROVIDER_SLICE;
    const shortName = providerMeta.shortName;
    const cardState = slice.loading ? "syncing" : slice.error ? "failed" : slice.account ? "success" : "idle";
    const statusLabel =
      cardState === "syncing"
        ? "Checking saved session"
        : cardState === "success"
          ? slice.status || `Last synced ${slice.account?.last_updated ?? ""}`.trim()
          : slice.hasSession
            ? "Saved session available"
            : "Needs sign-in";
    const cardMessage = slice.loading
      ? `Trying the saved ${shortName} session before opening a browser.`
      : slice.error
        ? `${slice.error} ${slice.prompt}`.trim()
        : slice.account
          ? `Synced from the saved ${shortName} session.`
          : slice.hasSession
            ? `A saved ${shortName} session exists. The app will try that first on this tab.`
            : `No saved ${shortName} session exists yet. Click the button to open sign-in.`;
    const buttonLabel = slice.loading
      ? "Syncing..."
      : slice.hasSession
        ? "Sync now"
        : slice.hasCredentials
          ? `Open prefilled ${shortName} sign-in`
          : `Open ${shortName} sign-in`;
    const onClick = slice.hasSession
      ? () => void syncProvider(providerKey)
      : () => void connectProvider(providerKey);
    const account = slice.account;
    return {
      key: providerKey,
      name: providerMeta.name,
      cardState,
      message: cardMessage,
      statusLabel,
      memberId: account?.member_id ?? account?.memberId ?? "Unavailable",
      tier: account?.tier ?? "Member",
      points: account?.points ?? 0,
      lastUpdated: account?.last_updated ?? account?.lastUpdated ?? "Not synced yet",
      loading: slice.loading,
      buttonLabel,
      onClick
    };
  });

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
                      <h3>Add hotel account</h3>
                      <span className="pill">Connector</span>
                    </div>
                    <div className="panel card">
                      <label className="select">
                        Provider
                        <select
                          onChange={(event) => setActiveHotelProvider(event.target.value)}
                          value={activeHotelProvider}
                        >
                          {hotelProviders.map((provider) => (
                            <option key={provider.key} value={provider.key}>
                              {provider.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <form className="provider-form" onSubmit={saveProviderCredentials}>
                        <label>
                          Member ID
                          <input
                            autoComplete="username"
                            onChange={(event) => setHyattUsername(event.target.value)}
                            placeholder={`Your ${activeProviderShortName} member ID`}
                            required
                            type="text"
                            value={hyattUsername}
                          />
                        </label>
                        <label>
                          Last name
                          <input
                            autoComplete="family-name"
                            onChange={(event) => setHyattLastName(event.target.value)}
                            placeholder="Last name on account (optional)"
                            required={activeHotelProvider === "hyatt"}
                            type="text"
                            value={hyattLastName}
                          />
                        </label>
                        <label>
                          Password
                          <input
                            autoComplete="current-password"
                            onChange={(event) => setHyattPassword(event.target.value)}
                            placeholder={`Your ${activeProviderShortName} password`}
                            required
                            type="password"
                            value={hyattPassword}
                          />
                        </label>
                        <div className="form-row">
                          <button
                            className="primary"
                            disabled={credentialsSaveLoading || anySyncInFlight}
                            type="submit"
                          >
                            {credentialsSaveLoading ? "Saving..." : "Save details"}
                          </button>
                        </div>
                        {activeFormState.error ? (
                          <div className="notice error">{activeFormState.error}</div>
                        ) : null}
                        {activeFormState.status ? (
                          <div className="notice success">{activeFormState.status}</div>
                        ) : null}
                      </form>
                    </div>
                  </section>
                  <section className="section">
                    <div className="section-header">
                      <h3>Synced loyalty accounts</h3>
                      <span className="pill">{savedHotelProviders.length} saved</span>
                    </div>
                    <div className="hotel-grid">
                      {syncedHotelCards.map((card) =>
                        card ? (
                          <div className={`sync-card ${card.cardState}`} key={card.key}>
                            <div className="sync-row">
                              <div>
                                <p className="segment-title">{card.name}</p>
                                <p className="muted">{card.message}</p>
                              </div>
                              <div className="sync-indicator">
                                {card.cardState === "syncing" ? (
                                  <span className="spinner" aria-hidden="true" />
                                ) : null}
                                <span>{card.statusLabel}</span>
                              </div>
                            </div>
                            <div className="account-card">
                              <div>
                                <p className="segment-title">Member {card.memberId}</p>
                                <p className="muted">{card.tier}</p>
                              </div>
                              <div className="list-metric">
                                <span>{card.points} pts</span>
                                <span className="muted">{card.lastUpdated}</span>
                              </div>
                            </div>
                            <div className="sync-actions">
                              <button
                                className="secondary sync-trigger"
                                disabled={card.loading || (anySyncInFlight && !card.loading)}
                                type="button"
                                onClick={card.onClick}
                              >
                                {card.buttonLabel}
                              </button>
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                    {savedHotelProviders.length === 0 ? (
                      <div className="notice warning">
                        No saved hotel accounts yet. Add one with the form above.
                      </div>
                    ) : null}
                  </section>
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
