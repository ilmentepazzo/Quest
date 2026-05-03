let currentStory = null;
let currentMaster = null;
let bookingCalendarOffsetDays = 0;
let bookingCalendarExpanded = false;
let selectedBookingSlot = null;
let profileReviewFilter = "all";
let visibleReviewsCount = 3;
let supabaseStoriesCache = [];
let supabaseStoriesLoaded = false;
let supabaseBookingsCache = [];
let supabaseBookingsLoaded = false;
let supabaseAvailabilityCache = [];
let supabaseAvailabilityLoaded = false;
let supabasePublicSessionsCache = [];
let supabasePublicSessionsLoaded = false;
let supabaseSessionParticipantsCache = [];
let supabaseSessionParticipantsLoaded = false;
let supabaseProfilesCache = {};
let editingStoryId = null;
let currentMasterAreaView = "availability";
let currentBookingMessagesBookingId = null;

const sections = [
  "home",
  "catalogo",
  "sessioni",
  "scheda",
  "crea-storia",
  "area-master",
  "profilo-master",
  "master",
  "dashboard",
  "mie-storie",
  "profilo",
  "notifiche",
  "contatti",
  "privacy",
  "cookie",
  "condizioni",
  "login"
];

function getPageFromHash() {
  const raw = decodeURIComponent(window.location.hash || "")
    .replace(/^#\/?/, "")
    .trim();

  return sections.includes(raw) ? raw : "";
}

function getStoredPage() {
  const stored = localStorage.getItem("questhubCurrentPage") || "";
  return sections.includes(stored) ? stored : "";
}

function getInitialPage() {
  return getPageFromHash() || getStoredPage() || "home";
}

function getActivePageId() {
  return document.querySelector(".page.active")?.id || "";
}

function updateRouteHash(page, options = {}) {
  if (!sections.includes(page)) return;

  const nextHash = `#${page}`;
  if (window.location.hash === nextHash) return;

  if (options.replaceHistory) {
    window.history.replaceState(null, "", nextHash);
  } else {
    window.history.pushState(null, "", nextHash);
  }
}

function setHomeAsNextRoute() {
  localStorage.setItem("questhubCurrentPage", "home");
  localStorage.removeItem("questhubCurrentStoryId");

  if (window.location.hash !== "#home") {
    window.history.replaceState(null, "", "#home");
  }
}

function handleRouteHashChange() {
  const page = getPageFromHash();
  if (!page || page === getActivePageId()) return;

  if (page === "scheda") {
    const savedStoryId = localStorage.getItem("questhubCurrentStoryId") || "";
    if (savedStoryId) {
      openStory(savedStoryId, { updateHash: false });
      return;
    }
  }

  go(page, { updateHash: false });
}

async function loadSections() {
  const app = document.getElementById("app");
  const initialPage = getInitialPage();

  for (const section of sections) {
    try {
      const response = await fetch(`sections/${section}.html?v=${Date.now()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        console.warn(`Sezione non caricata: ${section}.html (${response.status})`);
        app.insertAdjacentHTML("beforeend", `
          <section id="${section}" class="page">
            <div class="content-narrow card">
              <h1>Sezione non trovata</h1>
              <p>Il file <strong>sections/${section}.html</strong> non è stato trovato. Controlla che lo ZIP sia stato estratto mantenendo le cartelle.</p>
            </div>
          </section>
        `);
        continue;
      }

      const html = await response.text();
      app.insertAdjacentHTML("beforeend", html);

      const insertedSection = document.getElementById(section);
      if (insertedSection) {
        if (section === "home" && initialPage !== "home") {
          insertedSection.classList.remove("active");
        }

        if (section === initialPage && initialPage !== "scheda") {
          insertedSection.classList.add("active");
        }
      }
    } catch (error) {
      console.warn(`Errore caricamento sezione ${section}:`, error);
    }
  }

  await loadSupabaseStories();
  setupLanguageSwitcher();
  applyTranslations();
  updateNotificationBadge();
  const authUser = await checkAuthSession();
  await loadSupabaseMarketplaceState();
  renderHomeMarketplace();

  window.addEventListener("hashchange", handleRouteHashChange);

  const finalInitialPage = authUser && initialPage === "login" ? "home" : initialPage;

  if (finalInitialPage === "scheda") {
    const savedStoryId = localStorage.getItem("questhubCurrentStoryId") || "";
    if (savedStoryId) {
      openStory(savedStoryId, { replaceHistory: true });
      return;
    }
  }

  go(finalInitialPage, { replaceHistory: true });
}

function storyId(value) {
  return String(value ?? "");
}

function storyIdsMatch(a, b) {
  return storyId(a) === storyId(b);
}

function storyJsArg(id) {
  return JSON.stringify(storyId(id));
}

const STORY_LANGUAGE_KEYS = {
  it: "storyLanguageItalian",
  en: "storyLanguageEnglish",
  es: "storyLanguageSpanish",
  fr: "storyLanguageFrench"
};

function getStoryLanguageCode(storyOrCode) {
  const raw = typeof storyOrCode === "string"
    ? storyOrCode
    : (storyOrCode?.story_language || storyOrCode?.storyLanguage || storyOrCode?.language || "it");

  const normalized = String(raw || "it").toLowerCase().slice(0, 2);
  return STORY_LANGUAGE_KEYS[normalized] ? normalized : "it";
}

function getStoryLanguageLabel(storyOrCode) {
  const code = getStoryLanguageCode(storyOrCode);
  const fallbacks = {
    it: "Italiano",
    en: "English",
    es: "Español",
    fr: "Français"
  };

  return t(STORY_LANGUAGE_KEYS[code], fallbacks[code] || code.toUpperCase());
}

function getDefaultStoryLanguage() {
  const current = getCurrentLanguage();
  return STORY_LANGUAGE_KEYS[current] ? current : "it";
}

function normalizeSupabaseStory(row) {
  if (!row) return null;

  return {
    id: row.id,
    source: "supabase",
    author_id: row.author_id || row.owner_id || null,
    owner_id: row.owner_id || row.author_id || null,
    masterId: row.master_id || row.author_id || row.owner_id || row.id,
    title: row.title,
    genre: row.genre,
    type: row.type,
    story_language: getStoryLanguageCode(row.story_language || row.language || "it"),
    storyLanguage: getStoryLanguageCode(row.story_language || row.language || "it"),
    price: Number(row.price || 0),
    isFree: Boolean(row.is_free || Number(row.price || 0) === 0),
    duration: row.duration || "2 ore",
    duration_minutes: row.duration_minutes || null,
    players: row.players || "2–6",
    level: row.level || "Intermedio",
    mode: row.mode || "Online",
    master: row.master || "Master Lorecast",
    desc: row.description || "",
    long: row.long_description || row.description || "",
    cover: row.cover_url || "",
    trailer: row.trailer_url || "",
    materials: Array.isArray(row.materials) ? row.materials : [],
    status: row.status || "published",
    created_at: row.created_at || null
  };
}

async function loadSupabaseStories() {
  if (typeof supabaseClient === "undefined") {
    supabaseStoriesCache = [];
    supabaseStoriesLoaded = false;
    return [];
  }

  const { data, error } = await supabaseClient
    .from("stories")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Impossibile caricare le storie da Supabase:", error.message);
    supabaseStoriesLoaded = false;
    supabaseStoriesCache = [];
    return [];
  }

  supabaseStoriesCache = (data || [])
    .filter(row => !row.status || row.status === "published")
    .map(normalizeSupabaseStory)
    .filter(Boolean);

  supabaseStoriesLoaded = true;
  console.log("Storie Supabase caricate:", supabaseStoriesCache.length);
  return supabaseStoriesCache;
}

function getAllStories() {
  const primaryStories = supabaseStoriesLoaded && supabaseStoriesCache.length
    ? supabaseStoriesCache
    : storiesData;

  const seen = new Set();

  return primaryStories.filter(story => {
    const id = storyId(story?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getStoriesByAuthorId(authorId) {
  const normalizedAuthorId = storyId(authorId);
  if (!normalizedAuthorId) return [];

  return getAllStories().filter(story =>
    storyId(story.author_id || story.owner_id || story.masterId) === normalizedAuthorId
  );
}

function getUnlockedStories() {
  return readJsonStorage(getUserScopedKey("questhubUnlockedStories"), []);
}

function isStoryUnlocked(id) {
  return getUnlockedStories().map(String).includes(storyId(id));
}

function getUserProfile() {
  return JSON.parse(localStorage.getItem("questhubUserProfile") || "{}");
}

function getPublicDisplayName(profileOrName, fallback = "Utente Lorecast") {
  const raw = typeof profileOrName === "string"
    ? profileOrName
    : (profileOrName?.name || profileOrName?.email || fallback);

  if (!raw) return fallback;

  const clean = String(raw).trim();
  if (!clean) return fallback;

  if (clean.includes("@")) {
    const localPart = clean.split("@")[0] || fallback;
    return localPart.length > 18 ? `${localPart.slice(0, 18)}…` : localPart;
  }

  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

function isEmailLikeName(value) {
  return /@/.test(String(value || ""));
}

function getCurrentUserId() {
  const profile = getUserProfile();
  return profile.id || profile.user_id || "";
}

function getUserScopedKey(baseKey) {
  const userId = getCurrentUserId();
  return userId ? `${baseKey}:${userId}` : `${baseKey}:guest`;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function normalizeBooking(row) {
  if (!row) return null;

  return {
    id: row.id,
    storyId: row.story_id,
    masterId: row.master_id,
    story: row.story_title || "Storia Lorecast",
    master: row.master_name || "Master Lorecast",
    group: row.group_name || "",
    date: row.booking_date,
    time: normalizeTime(row.start_time),
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    durationMinutes: row.duration_minutes || 120,
    players: row.players || "",
    message: row.message || "",
    status: row.status || "In attesa",
    paymentStatus: normalizePaymentStatus(row.payment_status || row.paymentStatus || ""),
    paymentAmount: Number(row.payment_amount ?? row.paymentAmount ?? 0),
    paymentCurrency: row.payment_currency || row.paymentCurrency || "EUR",
    paymentProvider: row.payment_provider || row.paymentProvider || "",
    paymentReference: row.payment_reference || row.paymentReference || "",
    paidAt: row.paid_at || row.paidAt || null,
    user_id: row.user_id,
    created_at: row.created_at || null,
    source: "supabase"
  };
}

function normalizeAvailability(row) {
  if (!row) return null;

  return {
    id: row.id,
    storyId: storyId(row.story_id || ""),
    masterId: row.master_id,
    availabilityDate: row.availability_date || null,
    weekday: Number(row.weekday),
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    source: "supabase"
  };
}

function normalizePublicSession(row) {
  if (!row) return null;

  return {
    id: row.id,
    storyId: storyId(row.story_id),
    storyTitle: row.story_title || "",
    storyAuthorId: row.story_author_id || null,
    minPlayers: Number(row.min_players || 2),
    maxPlayers: Number(row.max_players || 6),
    joined: Number(row.current_players || 0),
    status: row.status || "open",
    createdBy: row.created_by || null,
    sessionDate: row.session_date || "",
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    durationMinutes: Number(row.duration_minutes || 0),
    createdGroupSize: Number(row.created_group_size || 1),
    source: "supabase"
  };
}

function normalizeSessionParticipant(row) {
  if (!row) return null;

  return {
    id: row.id,
    session_id: row.session_id,
    story_id: storyId(row.story_id || ""),
    user_id: row.user_id,
    status: row.status || "joined",
    seats: Number(row.seats || 1),
    created_at: row.created_at || null
  };
}

async function loadSupabaseMarketplaceState() {
  await Promise.all([
    loadSupabaseAvailability(),
    loadSupabaseBookings(),
    loadSupabasePublicSessions(),
    loadSupabaseNotifications()
  ]);

  const userIds = new Set();

  supabaseBookingsCache.forEach(booking => {
    if (booking.user_id) userIds.add(storyId(booking.user_id));
    if (booking.masterId) userIds.add(storyId(booking.masterId));
  });

  supabaseSessionParticipantsCache.forEach(participant => {
    if (participant.user_id) userIds.add(storyId(participant.user_id));
  });

  supabasePublicSessionsCache.forEach(session => {
    if (session.createdBy) userIds.add(storyId(session.createdBy));
    if (session.storyAuthorId) userIds.add(storyId(session.storyAuthorId));
  });

  getAllStories().forEach(story => {
    const authorId = story.author_id || story.owner_id || null;
    if (authorId) userIds.add(storyId(authorId));
  });

  await loadSupabaseProfilesForUserIds([...userIds]);
}

async function loadSupabaseProfilesForUserIds(userIds = []) {
  if (typeof supabaseClient === "undefined") return [];

  const ids = [...new Set(userIds.map(storyId).filter(Boolean))];
  if (!ids.length) return [];

  const missingIds = ids.filter(id => !supabaseProfilesCache[id]);
  if (!missingIds.length) return Object.values(supabaseProfilesCache);

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,name,avatar_url")
    .in("id", missingIds);

  if (error) {
    console.warn("Impossibile caricare i profili utente:", error.message);
    return [];
  }

  (data || []).forEach(profile => {
    if (profile.id) {
      supabaseProfilesCache[storyId(profile.id)] = {
        id: storyId(profile.id),
        name: profile.name || "Giocatore Lorecast",
        avatar_url: profile.avatar_url || ""
      };
    }
  });

  return data || [];
}

function getUserDisplayName(userId, fallback = "Giocatore Lorecast") {
  const id = storyId(userId);
  if (!id) return fallback;

  if (storyIdsMatch(id, getCurrentUserId())) {
    const profile = getUserProfile();
    return profile.name || fallback;
  }

  return supabaseProfilesCache[id]?.name || fallback;
}

async function loadSupabaseAvailability() {
  if (typeof supabaseClient === "undefined") return [];

  const { data, error } = await supabaseClient
    .from("master_availability")
    .select("*")
    .order("availability_date", { ascending: true, nullsFirst: false })
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.warn("Impossibile caricare disponibilità Master:", error.message);
    supabaseAvailabilityLoaded = false;
    return [];
  }

  supabaseAvailabilityCache = (data || []).map(normalizeAvailability).filter(Boolean);
  supabaseAvailabilityLoaded = true;
  return supabaseAvailabilityCache;
}

async function loadSupabaseBookings() {
  if (typeof supabaseClient === "undefined") return [];

  const { data: authData } = await supabaseClient.auth.getUser();
  if (!authData.user) {
    supabaseBookingsCache = [];
    supabaseBookingsLoaded = true;
    return [];
  }

  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Impossibile caricare prenotazioni:", error.message);
    supabaseBookingsLoaded = false;
    return [];
  }

  supabaseBookingsCache = (data || []).map(normalizeBooking).filter(Boolean);
  supabaseBookingsLoaded = true;
  return supabaseBookingsCache;
}

async function loadSupabasePublicSessions() {
  if (typeof supabaseClient === "undefined") return [];

  const [{ data: sessions, error: sessionsError }, { data: participants, error: participantsError }] = await Promise.all([
    supabaseClient.from("public_sessions").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("session_participants").select("*").eq("status", "joined")
  ]);

  if (sessionsError) {
    console.warn("Impossibile caricare sessioni aperte:", sessionsError.message);
    supabasePublicSessionsLoaded = false;
    return [];
  }

  if (participantsError) {
    console.warn("Impossibile caricare partecipanti sessioni:", participantsError.message);
  }

  supabasePublicSessionsCache = (sessions || []).map(normalizePublicSession).filter(Boolean);
  supabaseSessionParticipantsCache = (participants || []).map(normalizeSessionParticipant).filter(Boolean);
  supabasePublicSessionsLoaded = true;
  supabaseSessionParticipantsLoaded = !participantsError;
  return supabasePublicSessionsCache;
}

function getStoryAuthorId(story) {
  return story?.author_id || (story?.source === "supabase" ? story?.masterId : null) || null;
}

function getCurrentUserBookings() {
  const userId = getCurrentUserId();
  return getBookings().filter(booking => {
    if (!userId) return false;
    return booking.user_id && storyId(booking.user_id) === storyId(userId);
  });
}

function isCurrentUserStory(story) {
  if (!story) return false;
  const userId = getCurrentUserId();
  if (!userId) return false;

  return Boolean(
    story.source === "supabase" &&
    (
      (story.author_id && storyIdsMatch(story.author_id, userId)) ||
      (story.owner_id && storyIdsMatch(story.owner_id, userId)) ||
      (story.masterId && storyIdsMatch(story.masterId, userId))
    )
  );
}

function getOwnedMasterStories() {
  return getAllStories().filter(story =>
    story.type === "Con Master" && isCurrentUserStory(story)
  );
}

function getStoryTitleById(id) {
  const story = getAllStories().find(item => storyIdsMatch(item.id, id));
  return story?.title || "Disponibilità generale";
}

function setMasterAreaView(view) {
  currentMasterAreaView = view || "availability";

  document.querySelectorAll(".master-view").forEach(panel => {
    panel.classList.remove("is-active");
  });

  document.querySelectorAll(".master-section-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.masterView === currentMasterAreaView);
  });

  const target = document.getElementById(
    currentMasterAreaView === "requests"
      ? "masterViewRequests"
      : currentMasterAreaView === "sessions"
        ? "masterViewSessions"
        : "masterViewAvailability"
  );

  if (target) target.classList.add("is-active");
}

function go(page, options = {}) {
  const targetPage = sections.includes(page) ? page : "home";

  closeNotificationsDropdown();
  closeUserMenu();

  document.querySelectorAll(".page").forEach(pageEl => {
    pageEl.classList.remove("active");
  });

  const selected = document.getElementById(targetPage);
  if (selected) selected.classList.add("active");

  localStorage.setItem("questhubCurrentPage", targetPage);

  if (options.updateHash !== false) {
    updateRouteHash(targetPage, { replaceHistory: options.replaceHistory });
  }

  if (options.scroll !== false) {
    window.scrollTo(0, 0);
  }

  if (targetPage === "home") renderHomeMarketplace();
  if (targetPage === "catalogo") renderCatalog();
  if (targetPage === "sessioni") renderOpenSessions();

  if (targetPage === "crea-storia") {
    updateCreateStoryMode();
    togglePriceField();
  }

  if (targetPage === "area-master") {
    loadSupabaseMarketplaceState().then(() => {
      renderDashboardBookings();
      renderDashboardStats();
      renderMasterAvailability();
      renderMasterPublicSessions();
      setMasterAreaView(currentMasterAreaView || "availability");
    });
  }

  if (targetPage === "dashboard") {
    renderDashboardBookings();
    renderDashboardStats();
    togglePriceField();
  }

  if (targetPage === "mie-storie") renderMyStories();
  if (targetPage === "profilo") renderUserProfile();
  if (targetPage === "notifiche") renderNotifications();
  if (targetPage === "login") renderAuthState();
}

/* AUTH + SUPABASE PROFILE */


async function upsertSupabaseProfile(user) {
  if (!user) return null;

  const fallbackProfile = {
    id: user.id,
    name: user.user_metadata?.name || user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "Utente Lorecast"),
    email: user.email,
    avatar_url: user.user_metadata?.avatar_url || "",
    language: getCurrentLanguage()
  };

  const { data: existingProfile, error: selectError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    showToast("Errore lettura profilo: " + selectError.message, "error");
    return null;
  }

  let profile = existingProfile;

  if (!profile) {
    const { data: insertedProfile, error: insertError } = await supabaseClient
      .from("profiles")
      .insert(fallbackProfile)
      .select()
      .single();

    if (insertError) {
      showToast("Errore creazione profilo: " + insertError.message, "error");
      return null;
    }

    profile = insertedProfile;
  }

  const localProfile = {
    id: profile.id || fallbackProfile.id,
    name: profile.name || fallbackProfile.name,
    email: profile.email || fallbackProfile.email,
    avatar_url: profile.avatar_url || "",
    language: profile.language || getCurrentLanguage(),
    isMaster: profile.is_master || false
  };

  localStorage.setItem("questhubUserProfile", JSON.stringify(localProfile));
  localStorage.setItem("questhubLanguage", localProfile.language);

  updateHeaderUser();
  applyTranslations();

  return profile;
}

async function checkAuthSession() {
  const { data } = await supabaseClient.auth.getUser();

  if (data.user) {
    await upsertSupabaseProfile(data.user);
  } else {
    localStorage.removeItem("questhubUserProfile");
  }

  updateHeaderUser();
  renderAuthState();
  await loadSupabaseMarketplaceState();

  return data.user || null;
}

async function signUpWithEmail() {
  const name = document.getElementById("signupName")?.value.trim() || "";
  const email = document.getElementById("signupEmail")?.value.trim() || "";
  const password = document.getElementById("signupPassword")?.value || "";

  if (!name || !email || !password) {
    showToast("Inserisci nome, email e password.", "warning");
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  if (data.user) {
    await upsertSupabaseProfile(data.user);
  }

  showToast("Account creato. Controlla l’email se richiesta conferma.", "success");
  updateHeaderUser();
  renderAuthState();
}

async function loginWithEmail() {
  const email = document.getElementById("loginEmail")?.value.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";

  if (!email || !password) {
    showToast("Inserisci email e password.", "warning");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  await upsertSupabaseProfile(data.user);
  await loadSupabaseMarketplaceState();

  showToast("Accesso effettuato.", "success");
  updateHeaderUser();
  renderAuthState();
  go("home", { replaceHistory: true });
}

window.loginWithGoogle = async function () {
  showToast("Apro Google Login...", "success");

  const redirectTo = window.location.origin;

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true
    }
  });

  if (error) {
    showToast("Errore Google: " + error.message, "error");
    return;
  }

  if (!data || !data.url) {
    showToast("Nessun URL Google ricevuto da Supabase.", "warning");
    return;
  }

  window.location.href = data.url;
};

function clearAuthStorageForLogout(storage) {
  if (!storage) return;

  Object.keys(storage).forEach(key => {
    if (
      key.startsWith("sb-") ||
      key.includes("supabase") ||
      key === "questhubUserProfile" ||
      key === "questhubCurrentStoryId" ||
      key === "questhubCurrentPage"
    ) {
      storage.removeItem(key);
    }
  });
}

window.logoutUser = function () {
  clearAuthStorageForLogout(localStorage);
  clearAuthStorageForLogout(sessionStorage);

  setHomeAsNextRoute();
  closeNotificationsDropdown();
  closeUserMenu();
  updateHeaderUser();
  updateNotificationBadge();
  go("home", { replaceHistory: true });

  showToast(t("logoutSuccess", "Logout effettuato."), "success");

  // Esegui il logout Supabase in background: l'interfaccia non deve restare bloccata
  // se la rete è lenta o se il provider auth impiega qualche secondo a rispondere.
  supabaseClient.auth.signOut({ scope: "local" }).catch(error => {
    console.warn("Logout Supabase non completato immediatamente:", error.message);
  });
};

async function renderAuthState() {
  const status = document.getElementById("authStatus");
  if (!status) return;

  const { data } = await supabaseClient.auth.getUser();

  status.textContent = data.user
     ? t("loginStatusLoggedIn", "Accesso effettuato.")
    : t("loginStatusLoggedOut", "Non hai ancora effettuato l’accesso.");
}

/* HEADER / PROFILE */


function updateHeaderUser() {
  const profile = getUserProfile();

  const nameEl = document.getElementById("headerUserName");
  const avatarEl = document.getElementById("headerUserAvatar");
  const roleEl = document.getElementById("headerUserRole");

  const loginButton = document.getElementById("headerLoginButton");
  const userMenuWrapper = document.getElementById("userMenuWrapper");
  const userChip = document.getElementById("headerUserChip");
  const notificationButton = document.getElementById("notificationButton");
  const areaMasterLink = document.getElementById("headerAreaMasterLink");

  const isLoggedIn = Boolean(profile.email);
  document.body.classList.toggle("is-logged-in", isLoggedIn);

  if (!isLoggedIn) {
    closeNotificationsDropdown();
    closeUserMenu();
  }

  if (loginButton) loginButton.style.display = isLoggedIn ? "none" : "inline-flex";
  if (userMenuWrapper) userMenuWrapper.style.display = isLoggedIn ? "flex" : "none";
  if (userChip) userChip.style.display = isLoggedIn ? "flex" : "none";
  if (notificationButton) notificationButton.style.display = isLoggedIn ? "grid" : "none";
  if (areaMasterLink) areaMasterLink.style.display = isLoggedIn ? "inline-flex" : "none";

  if (!isLoggedIn) {
    if (avatarEl) avatarEl.textContent = "U";
    return;
  }

  const name = getPublicDisplayName(profile, "Utente");

  if (nameEl) {
    nameEl.textContent = name;
    nameEl.title = profile.name || profile.email || name;
  }

  if (avatarEl) {
    if (profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="${name}" />`;
    } else {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }
  }

  if (roleEl) roleEl.textContent = profile.isMaster ? "Player + Master" : "Player";
}


async function renderUserProfile() {
  const { data } = await supabaseClient.auth.getUser();

  const avatarLarge = document.getElementById("profileAvatarLarge");
  const profileName = document.getElementById("profileDisplayName");
  const profileMeta = document.getElementById("profileDisplayMeta") || document.getElementById("profileDisplayEmail");
  const profileMainName = document.getElementById("profileMainName");
  const roleBadge = document.getElementById("profileRoleBadge");
  const reviewLink = document.querySelector(".profile-review-link");

  if (!data.user) {
    localStorage.removeItem("questhubUserProfile");
    updateHeaderUser();

    if (avatarLarge) avatarLarge.textContent = "U";
    if (profileName) profileName.textContent = t("profileLoggedOutTitle", "Non hai effettuato l’accesso");
    if (profileMeta) profileMeta.textContent = t("profileLoggedOutIntro", "Accedi per personalizzare il profilo.");
    if (profileMainName) profileMainName.textContent = t("profileTitle", "Profilo utente");
    if (roleBadge) roleBadge.textContent = t("profileRoleGuest", "Guest");
    if (reviewLink) reviewLink.textContent = t("profileReviewsReceivedZero", "0 recensioni ricevute");
    renderProfileLibrary([], [], []);
    return;
  }

  await upsertSupabaseProfile(data.user);
  await loadSupabaseStories();

  const profile = getUserProfile();
  const userId = data.user.id;
  const createdStories = supabaseStoriesCache.filter(story => story.author_id && storyId(story.author_id) === storyId(userId));
  await loadSupabaseBookings();
  await loadSupabasePublicSessions();

  const userBookings = getBookings().filter(booking => booking.user_id && storyId(booking.user_id) === storyId(userId));
  const privateBookedStories = userBookings.filter(booking =>
    isBookingPending(booking.status) || isBookingAccepted(booking.status)
  );
  const completedPrivateStories = userBookings.filter(booking => isBookingCompleted(booking.status));
  const joinedPublicSessions = getJoinedPublicSessionProfileItems(userId);
  const activeJoinedPublicSessions = joinedPublicSessions.filter(item => !isBookingCompleted(item.status));
  const completedJoinedPublicSessions = joinedPublicSessions.filter(item => isBookingCompleted(item.status));
  const playedStories = [...completedPrivateStories, ...completedJoinedPublicSessions];
  const bookedStories = [...privateBookedStories, ...activeJoinedPublicSessions];
  const unlockedIds = getUnlockedStories();
  const reviews = getProfileReviews();

  const displayName = getPublicDisplayName(profile, "Utente Lorecast");

  const nameInput = document.getElementById("profileName");
  const languageInput = document.getElementById("profileLanguage");
  const status = document.getElementById("masterModeStatus");

  if (nameInput) nameInput.value = displayName;
  if (languageInput) languageInput.value = profile.language || getCurrentLanguage();
  if (status) status.style.display = profile.isMaster ? "block" : "none";

  if (avatarLarge) {
    if (profile.avatar_url) {
      avatarLarge.innerHTML = `<img src="${profile.avatar_url}" alt="${displayName}" />`;
    } else {
      avatarLarge.textContent = displayName.charAt(0).toUpperCase();
    }
  }

  if (profileName) profileName.textContent = displayName;
  if (profileMeta) profileMeta.textContent = t("profileMetaMember", "Membro Lorecast");
  if (profileMainName) profileMainName.textContent = displayName;
  if (roleBadge) roleBadge.textContent = profile.isMaster ? t("profileRoleMaster", "Player + Master") : t("profileRolePlayer", "Player");
  if (reviewLink) {
    reviewLink.textContent = reviews.length === 1
      ? t("profileReviewsReceivedOne", "1 recensione ricevuta")
      : tf("profileReviewsReceivedMany", { count: reviews.length }, `${reviews.length} recensioni ricevute`);
  }

  const storiesCreated = document.getElementById("profileStoriesCreated");
  const bookingsCount = document.getElementById("profileBookingsCount");
  const unlockedCount = document.getElementById("profileUnlockedCount");

  if (storiesCreated) storiesCreated.textContent = createdStories.length;
  if (bookingsCount) bookingsCount.textContent = playedStories.length;
  if (unlockedCount) unlockedCount.textContent = bookedStories.length;

  renderProfileLibrary(createdStories, playedStories, bookedStories);
  renderUserReviews();
}

function compactStoryCover(story) {
  if (story?.cover) {
    return `<div class="profile-mini-cover image-cover"><img src="${story.cover}" alt="${story.title}" /></div>`;
  }
  return `<div class="profile-mini-cover ${getGenreClass(story?.genre || "")}">${story?.genre || "Storia"}</div>`;
}

function getStoryReviewsStore() {
  return readJsonStorage("questhubStoryReviews", []);
}

function getStoryReviewSummary(storyIdValue) {
  const reviews = getStoryReviewsStore().filter(review => storyIdsMatch(review.storyId, storyIdValue));

  if (!reviews.length) {
    return { count: 0, average: null, label: t("profileNoReviews", "Nessuna recensione") };
  }

  const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  return {
    count: reviews.length,
    average,
    label: `${average.toFixed(1)} ★ · ${reviews.length} ${reviews.length === 1 ? t("profileReviewSingular", "recensione") : t("profileReviewPlural", "recensioni")}`
  };
}

function getStoryBookingSummary(storyIdValue) {
  const bookings = getBookings().filter(booking =>
    storyIdsMatch(booking.storyId, storyIdValue) &&
    !isBookingRejectedOrCancelled(booking.status)
  );

  return {
    count: bookings.length,
    label: bookings.length === 1
      ? t("profileBookingOne", "1 prenotazione")
      : tf("profileBookingMany", { count: bookings.length }, `${bookings.length} prenotazioni`)
  };
}

function setProfileTabLabel(tabName, label, count, unreadCount = 0) {
  const button = document.querySelector(`.profile-tab-button[data-profile-tab="${tabName}"]`);
  if (!button) return;

  const unread = Number(unreadCount || 0);
  const unreadBadge = unread > 0
    ? `<span class="profile-tab-unread" title="${escapeHtmlAttribute(tf("bookingUnreadMessages", { count: unread }, `${unread} nuovi messaggi`))}">${unread > 9 ? "9+" : unread}</span>`
    : "";

  button.innerHTML = `
    <span>${label}</span>
    <strong>${count}</strong>
    ${unreadBadge}
  `;
}

function updateProfileLibraryTabCounts(createdCount, playedCount, bookedCount, bookedUnreadCount = 0) {
  setProfileTabLabel("created", t("profileTabCreated", "Create"), createdCount);
  setProfileTabLabel("played", t("profileTabPlayed", "Giocate"), playedCount);
  setProfileTabLabel("booked", t("profileTabBooked", "Prenotate"), bookedCount, bookedUnreadCount);
}

function getJoinedPublicSessionProfileItems(userId = getCurrentUserId()) {
  if (!userId || !supabaseSessionParticipantsLoaded || !supabasePublicSessionsLoaded) return [];

  return supabaseSessionParticipantsCache
    .filter(participant =>
      storyIdsMatch(participant.user_id, userId) &&
      participant.status === "joined"
    )
    .map(participant => {
      const session = supabasePublicSessionsCache.find(item => storyIdsMatch(item.id, participant.session_id));
      if (!session || ["cancelled", "closed"].includes(session.status)) return null;

      const story = getAllStories().find(item => storyIdsMatch(item.id, session.storyId));

      return {
        id: participant.id,
        source: "public_session",
        storyId: session.storyId,
        story: story?.title || session.storyTitle || "Sessione pubblica",
        message: t("profileBookingPublicSession", "Sessione pubblica join-in"),
        date: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status === "complete" ? t("bookingStatusCompleted", "Completa") : t("bookingStatusJoined", "Iscritto"),
        user_id: participant.user_id,
        session_id: session.id,
        seats: participant.seats || 1
      };
    })
    .filter(Boolean);
}

function renderCompactStoryList(containerId, items, emptyText, type = "story") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<p>${emptyText}</p>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const story = type === "booking"
      ? getAllStories().find(s => storyIdsMatch(s.id, item.storyId)) || { id: item.storyId, title: item.story, desc: item.message || "", genre: item.status || "Sessione" }
      : item;

    const storyArg = storyJsArg(story.id || item.storyId);
    const reviewSummary = getStoryReviewSummary(story.id || item.storyId);
    const bookingSummary = getStoryBookingSummary(story.id || item.storyId);

    const meta = type === "booking"
      ? `${item.source === "public_session" ? t("profileBookingJoinIn", "Join-in") : t("profileBookingPrivate", "Prenotazione privata")} · ${formatBookingDateTime(item.date, item.startTime || item.time, item.endTime)}`
      : `${getTranslatedGenreLabel(story.genre)}${story.type ? ` · ${getTranslatedStoryTypeLabel(story.type)}` : ""}`;

    const statusChip = type === "booking"
      ? `<span class="profile-info-chip status-chip">${item.source === "public_session" ? t("profileBookingPublic", "Sessione pubblica") : getTranslatedBookingStatus(item.status)}</span>`
      : "";

    const paymentChip = type === "booking" && item.source !== "public_session"
      ? renderBookingPaymentChip(item, "profile-info-chip")
      : "";

    const bookingChip = type === "story"
      ? `<span class="profile-info-chip">${bookingSummary.label}</span>`
      : "";

    const unreadMessages = type === "booking" ? getUnreadBookingMessageCount(item.id) : 0;
    const unreadChip = unreadMessages > 0
      ? `<span class="profile-info-chip unread-chip">${tf("bookingUnreadMessages", { count: unreadMessages > 9 ? "9+" : unreadMessages }, `${unreadMessages > 9 ? "9+" : unreadMessages} nuovi messaggi`)}</span>`
      : "";

    const reviewChip = `<span class="profile-info-chip ${reviewSummary.count ? "rating-chip" : "muted-chip"}">${reviewSummary.label}</span>`;
    const messageAction = type === "booking" ? renderBookingMessageAction(item, "light compact-action") : "";

    return `
      <article class="profile-compact-item ${unreadMessages > 0 ? "has-unread-messages" : ""}">
        ${compactStoryCover(story)}
        <div class="profile-compact-body">
          <h3>${story.title || item.story || "Storia"}</h3>
          <p>${meta}</p>
        </div>
        <div class="profile-compact-meta">
          ${statusChip}
          ${paymentChip}
          ${bookingChip}
          ${unreadChip}
          ${reviewChip}
        </div>
        ${messageAction}
        <button class="light compact-action" onclick='openStory(${storyArg})'>${t("commonOpen", "Apri")}</button>
      </article>
    `;
  }).join("");
}

function renderProfileLibrary(createdStories, playedStories, bookedStories) {
  const bookedUnreadCount = getTotalUnreadBookingMessagesForBookings(bookedStories);
  updateProfileLibraryTabCounts(createdStories.length, playedStories.length, bookedStories.length, bookedUnreadCount);
  renderCompactStoryList("profileCreatedStories", createdStories, t("profileEmptyCreated", "Non hai ancora creato storie."));
  renderCompactStoryList("profilePlayedStories", playedStories, t("profileEmptyPlayed", "Non hai ancora storie giocate."), "booking");
  renderCompactStoryList("profileBookedStories", bookedStories, t("profileEmptyBooked", "Non hai ancora storie prenotate."), "booking");
}

function setProfileLibraryTab(tabName) {
  document.querySelectorAll(".profile-tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.profileTab === tabName);
  });

  document.querySelectorAll(".profile-tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.profilePanel === tabName);
  });
}

async function uploadProfileAvatar(userId) {
  const fileInput = document.getElementById("profileAvatarFile");
  const file = fileInput?.files?.[0];

  if (!file) return null;

  const allowedTypes = ["image/jpeg", "image/png"];
  if (!allowedTypes.includes(file.type)) {
    showToast("Carica solo immagini JPG o PNG.", "warning");
    return null;
  }

  const maxSizeMb = 3;
  if (file.size > maxSizeMb * 1024 * 1024) {
    showToast(`L'immagine deve pesare massimo ${maxSizeMb} MB.`, "warning");
    return null;
  }

  const extension = file.type === "image/png" ? "png" : "jpg";
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("avatars")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (uploadError) {
    showToast("Errore upload avatar: " + uploadError.message, "error");
    return null;
  }

  const { data } = supabaseClient.storage
    .from("avatars")
    .getPublicUrl(filePath);

  return data.publicUrl;
}


async function saveUserProfile() {
  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData.user) {
    showToast("Devi effettuare l’accesso.", "warning");
    return;
  }

  const name = document.getElementById("profileName")?.value.trim() || "";
  const language = document.getElementById("profileLanguage")?.value || "it";
  const email = authData.user.email;

  if (!name) {
    showToast("Inserisci il nome pubblico.", "warning");
    return;
  }

  if (isEmailLikeName(name)) {
    showToast("Il nome pubblico non può essere un indirizzo email.", "warning");
    return;
  }

  if (name.length > 28) {
    showToast("Il nome pubblico deve avere massimo 28 caratteri.", "warning");
    return;
  }

  if (isEmailLikeName(name)) {
    showToast("Il nome pubblico non può essere un indirizzo email.", "warning");
    return;
  }

  if (name.length > 28) {
    showToast("Il nome pubblico deve avere massimo 28 caratteri.", "warning");
    return;
  }

  const avatarUrl = await uploadProfileAvatar(authData.user.id);

  const updates = {
    name,
    email,
    language
  };

  if (avatarUrl) {
    updates.avatar_url = avatarUrl;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .update(updates)
    .eq("id", authData.user.id)
    .select()
    .single();

  if (error) {
    showToast("Errore salvataggio profilo: " + error.message, "error");
    return;
  }

  const localProfile = {
    id: data.id || authData.user.id,
    name: data.name,
    email: data.email,
    avatar_url: data.avatar_url || "",
    language: data.language || language,
    isMaster: data.is_master || false
  };

  localStorage.setItem("questhubUserProfile", JSON.stringify(localProfile));
  localStorage.setItem("questhubLanguage", localProfile.language);

  const avatarInput = document.getElementById("profileAvatarFile");
  if (avatarInput) avatarInput.value = "";

  showToast("Profilo salvato.", "success");
  closeProfileEdit();
  updateHeaderUser();
  applyTranslations();
  renderUserProfile();
}

async function activateMasterMode() {
  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData.user) {
    showToast("Devi effettuare l’accesso.", "warning");
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .update({ is_master: true })
    .eq("id", authData.user.id)
    .select()
    .single();

  if (error) {
    showToast("Errore attivazione Master: " + error.message, "error");
    return;
  }

  localStorage.setItem("questhubUserProfile", JSON.stringify({
    id: data.id || authData.user.id,
    name: data.name,
    email: data.email,
    avatar_url: data.avatar_url,
    language: data.language,
    isMaster: data.is_master
  }));

  showToast("Modalità Master attivata.", "success");
  addNotification("Modalità Master attivata sul tuo profilo.", "success");

  updateHeaderUser();
  renderUserProfile();
}

/* STORIES */

function getGenreClass(genre) {
  return "genre-" + genre
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("è", "e")
    .replaceAll("é", "e");
}

function card(story) {
  const storyArg = storyJsArg(story.id);
  const authorName = story.master || "Autore Lorecast";
  const priceLabel = story.isFree || Number(story.price) === 0
    ? `<span class="story-price-free">${t("priceFree", "Gratis")}</span>`
    : `<span class="story-price-paid">${formatMoney(story.price, { freeLabel: false })}</span>`;

  const genreClass = getGenreClass(story.genre);
  const languageLabel = getStoryLanguageLabel(story);
  const coverHtml = story.cover
    ? `<div class="story-card-cover image-cover" style="background-image: url('${story.cover}')">
         <div class="story-cover-title image-cover-title">
           <span>${story.genre}</span>
           <strong>${story.title}</strong>
         </div>
       </div>`
    : `<div class="story-card-cover ${genreClass}">
         <div class="story-cover-title">
           <span>${story.genre}</span>
           <strong>${story.title}</strong>
         </div>
       </div>`;

  return `
    <div class="story-card" onclick='openStory(${storyArg})'>
      ${coverHtml}

      <div class="story-card-body">
        <div>
          <span class="tag ${genreClass}">${escapeHtml(getTranslatedGenreLabel(story.genre))}</span>
          <span class="tag gold">${escapeHtml(getTranslatedStoryTypeLabel(story.type))}</span>
          <span class="tag story-language-badge">${escapeHtml(languageLabel)}</span>
        </div>

        <h2>${story.title}</h2>
        <p>${story.desc}</p>
        <button type="button" class="story-card-author" onclick='event.stopPropagation(); openStoryAuthorProfile(${storyArg})'>
          ${t("storyBy", "di")} ${escapeHtml(authorName)}
        </button>

        <div class="story-card-meta">
          <span>${story.players} ${t("storyPlayersShort", "giocatori")}</span>
          <strong>${priceLabel}</strong>
        </div>
      </div>
    </div>
  `;
}

function getStoryActivityStats(story) {
  const id = storyId(story?.id);
  if (!id) {
    return {
      acceptedBookings: 0,
      completedBookings: 0,
      activeBookings: 0,
      openSessions: 0,
      joinedPlayers: 0,
      recentBoost: 0,
      score: 0
    };
  }

  const bookings = getBookings().filter(booking => storyIdsMatch(booking.storyId, id));
  const acceptedBookings = bookings.filter(booking => isBookingAccepted(booking.status)).length;
  const completedBookings = bookings.filter(booking => isBookingCompleted(booking.status)).length;
  const activeBookings = bookings.filter(booking => !isBookingInactive(booking.status)).length;

  const sessions = supabasePublicSessionsLoaded
    ? supabasePublicSessionsCache.filter(session => storyIdsMatch(session.storyId, id))
    : [];

  const openSessions = sessions.filter(session => {
    const status = String(session.status || "").toLowerCase();
    return !["cancelled", "closed", "annullata", "chiusa"].includes(status);
  }).length;

  const joinedPlayers = sessions.reduce((sum, session) => sum + Number(session.joined || 0), 0);

  const createdAt = story?.created_at ? new Date(story.created_at) : null;
  const ageDays = createdAt && !Number.isNaN(createdAt.getTime())
    ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  const recentBoost = ageDays === null
    ? 1
    : ageDays <= 7
      ? 6
      : ageDays <= 30
        ? 3
        : 0;

  const score =
    completedBookings * 8 +
    acceptedBookings * 5 +
    activeBookings * 3 +
    joinedPlayers * 4 +
    openSessions * 3 +
    recentBoost;

  return {
    acceptedBookings,
    completedBookings,
    activeBookings,
    openSessions,
    joinedPlayers,
    recentBoost,
    score
  };
}

function getFeaturedStories(limit = 3) {
  return getAllStories()
    .map((story, index) => ({
      story,
      index,
      stats: getStoryActivityStats(story)
    }))
    .sort((a, b) => {
      if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;

      const dateA = a.story.created_at ? new Date(a.story.created_at).getTime() : 0;
      const dateB = b.story.created_at ? new Date(b.story.created_at).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;

      return a.index - b.index;
    })
    .slice(0, limit)
    .map(item => item.story);
}

function getTrendingMasterCards(limit = 3) {
  const groups = new Map();

  getAllStories().forEach(story => {
    const authorId = storyId(story.author_id || story.owner_id || story.masterId || story.master || story.id);
    if (!authorId) return;

    if (!groups.has(authorId)) {
      const profile = supabaseProfilesCache[authorId] || {};
      groups.set(authorId, {
        id: authorId,
        name: profile.name || story.master || t("trendingMasterFallback", "Master Lorecast"),
        avatarUrl: profile.avatar_url || "",
        stories: [],
        score: 0,
        acceptedBookings: 0,
        completedBookings: 0,
        joinedPlayers: 0,
        openSessions: 0
      });
    }

    const group = groups.get(authorId);
    const stats = getStoryActivityStats(story);

    group.name = supabaseProfilesCache[authorId]?.name || story.master || group.name;
    group.avatarUrl = supabaseProfilesCache[authorId]?.avatar_url || group.avatarUrl;
    group.stories.push(story);
    group.acceptedBookings += stats.acceptedBookings;
    group.completedBookings += stats.completedBookings;
    group.joinedPlayers += stats.joinedPlayers;
    group.openSessions += stats.openSessions;
    group.score += stats.score + 3;
  });

  return [...groups.values()]
    .filter(master => master.stories.length)
    .sort((a, b) => {
      const reviewA = getMasterReviewSummary(a);
      const reviewB = getMasterReviewSummary(b);
      const scoreA = a.score + reviewA.count * 2 + reviewA.average * 4;
      const scoreB = b.score + reviewB.count * 2 + reviewB.average * 4;

      if (scoreB !== scoreA) return scoreB - scoreA;
      if (reviewB.count !== reviewA.count) return reviewB.count - reviewA.count;
      if (b.stories.length !== a.stories.length) return b.stories.length - a.stories.length;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

function getMasterReviewSummary(master) {
  const ratings = [];
  const storyIds = new Set((master?.stories || []).map(story => storyId(story.id)));

  getStoryReviewsStore().forEach(review => {
    if (!storyIds.has(storyId(review.storyId))) return;

    const rating = Number(review.rating || 0);
    if (rating > 0) ratings.push(rating);
  });

  if (!ratings.length && typeof reviewsData !== "undefined") {
    const seenDemoReviewIds = new Set();

    (master?.stories || []).forEach(story => {
      reviewsData
        .filter(review => story.masterId && storyIdsMatch(review.masterId, story.masterId))
        .forEach(review => {
          const reviewId = storyId(review.id || `${story.masterId}-${review.author}-${review.date}`);
          if (seenDemoReviewIds.has(reviewId)) return;

          seenDemoReviewIds.add(reviewId);
          const rating = Number(review.rating || 0);
          if (rating > 0) ratings.push(rating);
        });
    });
  }

  const count = ratings.length;
  const average = count
    ? ratings.reduce((sum, rating) => sum + rating, 0) / count
    : 0;

  return {
    count,
    average,
    averageLabel: average.toFixed(1)
  };
}

function renderTrendingMasters() {
  const container = document.getElementById("trendingMasters");
  if (!container) return;

  const masters = getTrendingMasterCards(3);

  if (!masters.length) {
    container.innerHTML = `<p>${t("homeNoTrendingMasters", "Nessun Master in evidenza al momento.")}</p>`;
    return;
  }

  container.innerHTML = masters.map(master => {
    const firstStory = master.stories[0];
    const firstStoryArg = storyJsArg(firstStory.id);
    const displayName = getPublicDisplayName(master.name, t("trendingMasterFallback", "Master Lorecast"));
    const initials = displayName.slice(0, 1).toUpperCase();
    const reviewSummary = getMasterReviewSummary(master);
    const storyLabel = master.stories.length === 1
      ? t("homeMasterStoriesShortSingular", "storia")
      : t("homeMasterStoriesShort", "storie");
    const reviewLabel = reviewSummary.count === 1
      ? t("homeMasterReviewShortSingular", "recensione")
      : t("homeMasterReviewsShort", "recensioni");

    const avatarContent = master.avatarUrl
      ? `<img src="${escapeHtmlAttribute(master.avatarUrl)}" alt="${escapeHtmlAttribute(displayName)}" />`
      : `<span>${escapeHtml(initials)}</span>`;

    return `
      <article class="trending-master-card" role="button" tabindex="0" onclick='openStoryAuthorProfile(${firstStoryArg})' onkeydown='if(event.key === "Enter" || event.key === " "){ event.preventDefault(); openStoryAuthorProfile(${firstStoryArg}); }'>
        <div class="trending-master-backdrop" aria-hidden="true">
          ${avatarContent}
        </div>

        <div class="trending-master-top">
          <div class="trending-master-avatar">
            ${avatarContent}
          </div>
          <div class="trending-master-title">
            <h3>${escapeHtml(displayName)}</h3>
            <span class="trending-master-profile-cue">${escapeHtml(t("homeOpenMasterProfile", "Vedi profilo"))}</span>
          </div>
        </div>

        <div class="trending-master-stats" aria-label="${escapeHtmlAttribute(t("homeMasterStatsAria", "Statistiche Master"))}">
          <span><strong>${master.stories.length}</strong><small>${escapeHtml(storyLabel)}</small></span>
          <span><strong>${reviewSummary.count}</strong><small>${escapeHtml(reviewLabel)}</small></span>
          <span><strong>${reviewSummary.averageLabel}</strong><small>${escapeHtml(t("homeMasterRatingShort", "rating"))}</small></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderFeatured() {
  const container = document.getElementById("featured");
  if (!container) return;

  const featuredStories = getFeaturedStories(3);
  container.innerHTML = featuredStories.length
    ? featuredStories.map(card).join("")
    : `<p>${t("catalogNoResults", "Nessuna storia trovata.")}</p>`;
}

function renderHomeMarketplace() {
  renderFeatured();
  renderTrendingMasters();
}

async function renderCatalog() {
  const container = document.getElementById("stories");
  const count = document.getElementById("count");
  if (!container || !count) return;

  await loadSupabaseStories();

  const q = document.getElementById("q")?.value.toLowerCase() || "";
  const genre = document.getElementById("genre")?.value || "";
  const type = document.getElementById("type")?.value || "";
  const price = document.getElementById("price")?.value || "";
  const storyLanguage = document.getElementById("storyLanguageFilter")?.value || "";

  const results = getAllStories().filter(story => {
    const matchesSearch =
      !q ||
      story.title.toLowerCase().includes(q) ||
      story.desc.toLowerCase().includes(q) ||
      story.genre.toLowerCase().includes(q);

    const matchesGenre = !genre || story.genre === genre;
    const matchesType = !type || story.type === type;
    const matchesLanguage = !storyLanguage || getStoryLanguageCode(story) === storyLanguage;
    const matchesPrice = !price
      ? true
      : price === "free"
        ? story.isFree || Number(story.price) === 0
        : Number(story.price) <= Number(price);

    return matchesSearch && matchesGenre && matchesType && matchesLanguage && matchesPrice;
  });

  count.textContent = results.length === 1
    ? t("catalogCountOne", "1 storia trovata")
    : t("catalogCountMany", "{count} storie trovate").replace("{count}", results.length);

  container.innerHTML = results.length
    ? results.map(card).join("")
    : `<p>${t("catalogNoResults", "Nessuna storia trovata.")}</p>`;
}

function openStory(id, options = {}) {
  const story = getAllStories().find(s => storyIdsMatch(s.id, id));

  if (!story) {
    showToast("Storia non trovata.", "warning");
    return;
  }

  currentStory = story;
  localStorage.setItem("questhubCurrentStoryId", storyId(story.id));
  currentMaster = mastersData.find(m => Number(m.id) === Number(story.masterId)) || null;

  const setText = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value ?? "";
  };

  const setHtml = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.innerHTML = value ?? "";
  };

  setHtml("detailTags", `
    <span class="tag ${getGenreClass(story.genre)}">${escapeHtml(getTranslatedGenreLabel(story.genre))}</span>
    <span class="tag gold">${escapeHtml(getTranslatedStoryTypeLabel(story.type))}</span>
    <span class="tag story-language-badge">${escapeHtml(getStoryLanguageLabel(story))}</span>
  `);

  setText("detailTitle", story.title);
  setText("detailDesc", story.desc);
  setText("detailLong", story.long);
  setText("detailDuration", story.duration);
  setText("detailPlayers", story.players);
  setText("detailLevel", story.level);
  setText("detailMode", story.mode);
  setText("detailLanguage", getStoryLanguageLabel(story));
  setHtml("detailMaster", `
    <button type="button" class="inline-author-link" onclick='openStoryAuthorProfile(${storyJsArg(story.id)})'>
      ${escapeHtml(story.master || currentMaster?.name || "Master non indicato")}
    </button>
  `);

  // Compatibilità con vecchi template: se detailPrice non esiste, non blocca più l'apertura della scheda.
  setText("detailPrice", formatMoney(story.price));

  renderStoryPaymentPanel(story);

  setText(
    "detailAction",
    story.type === "Con Master"
      ? t("detailActionWithMaster", "Prenota una sessione guidata con il Master oppure sblocca i materiali della storia.")
      : t("detailActionSelfPlay", "Acquista o sblocca la storia e giocala in autonomia, quando vuoi e con chi vuoi.")
  );

  renderStoryMedia(story);
  renderStoryMaterials(story);
  renderJoinSession(story);
  renderStoryBookingMode(story);

  go("scheda", options);
}

function renderStoryPaymentPanel(story) {
  const priceEl = document.getElementById("paymentTotalPrice");
  const titleEl = document.getElementById("paymentStoryTitle");
  const hintEl = document.getElementById("paymentHint");
  const payButton = document.getElementById("paymentButton");
  const panelLabel = document.getElementById("paymentPanelLabel");
  const paymentMethods = document.getElementById("paymentMethods");
  const paymentNote = document.getElementById("paymentNote");
  const ownerActions = document.getElementById("ownerStoryActions");
  const masterButton = document.getElementById("summaryMasterButton");

  if (!story) return;

  const isOwner = isCurrentUserStory(story);

  const paymentState = getInitialPaymentStateForStory(story);
  const paymentRequired = paymentState.status !== "not_required";

  if (ownerActions) ownerActions.hidden = !isOwner;
  if (paymentMethods) paymentMethods.hidden = true;
  if (paymentNote) paymentNote.hidden = isOwner;
  if (payButton) payButton.hidden = isOwner;

  if (masterButton) {
    masterButton.style.display = story.type === "Con Master" && !isOwner ? "inline-flex" : "none";
  }

  if (panelLabel) panelLabel.textContent = isOwner ? t("ownerStoryManageLabel", "Gestione storia") : t("paymentLabel", "Pagamento");

  if (isOwner) {
    if (priceEl) priceEl.textContent = t("commonManage", "Gestisci");
    if (titleEl) titleEl.textContent = story.title;
    if (hintEl) {
      hintEl.textContent = t("storyOwnerPaymentHint", "Questa storia è tua: modifica informazioni, disponibilità e materiali senza passare dal pagamento.");
    }
    return;
  }

  const priceLabel = formatMoney(story.price);

  if (priceEl) priceEl.textContent = priceLabel;
  if (titleEl) titleEl.textContent = story.title;

  if (hintEl) {
    hintEl.innerHTML = `
      <span>${escapeHtml(paymentRequired
        ? t("paymentPrepStoryHint", "I pagamenti reali non sono ancora attivi. Puoi continuare a usare prenotazioni, materiali e gestione storia senza checkout reale.")
        : t("paymentFreeStoryHint", "Questa storia è gratuita: puoi sbloccare i materiali senza pagamento."))}</span>
      ${renderPaymentStatusChipFromState(paymentState, "payment-panel-chip")}
    `;
  }

  if (paymentNote) {
    paymentNote.textContent = paymentRequired
      ? t("paymentPrepNote", "Checkout reale non ancora collegato. Questa sezione prepara lo stato pagamento per una futura integrazione sicura.")
      : t("paymentFreeNote", "Nessun pagamento richiesto per questa storia.");
  }

  if (payButton) {
    payButton.disabled = paymentRequired;
    payButton.classList.toggle("is-disabled", paymentRequired);
    payButton.textContent = paymentRequired
      ? t("paymentComingSoonButton", "Pagamenti in preparazione")
      : t("paymentUnlockFree", "Sblocca gratis");
  }
}

function payForCurrentStory() {
  if (!currentStory) return;

  const profile = getUserProfile();
  if (!profile.email) {
    showToast(t("paymentLoginRequired", "Accedi per sbloccare questa storia."), "warning");
    go("login");
    return;
  }

  if (isStoryPaymentRequired(currentStory)) {
    showPaymentsNotActiveNotice();
    return;
  }

  unlockCurrentStory();

  showToast(t("paymentFreeUnlockedToast", "Storia sbloccata gratuitamente."), "success");
}

function renderStoryBookingMode(story) {
  const masterPanel = document.getElementById("storyMasterBookingPanel");
  const selfPlayPanel = document.getElementById("storySelfPlayPanel");
  const unlockButton = document.getElementById("unlockStoryButton");

  const isWithMaster = story?.type === "Con Master";

  if (masterPanel) masterPanel.style.display = isWithMaster ? "block" : "none";
  if (selfPlayPanel) selfPlayPanel.style.display = isWithMaster ? "none" : "block";
  if (unlockButton) unlockButton.textContent = isWithMaster ? "Sblocca / Acquista materiali" : "Sblocca materiali self-play";

  selectedBookingSlot = null;
  bookingCalendarOffsetDays = 0;
  bookingCalendarExpanded = false;

  if (isWithMaster) {
    renderBookingCalendar(story);
    updateSelectedSlotLabel();
  }
}

function renderStoryMedia(story) {
  const media = document.getElementById("detailMedia");
  if (!media) return;

  let html = "";

  if (story.cover) {
    html += `
      <div class="story-cover">
        <img src="${story.cover}" alt="Copertina ${story.title}" />
      </div>
    `;
  }

  if (story.trailer) {
    html += `
      <div class="trailer-box">
        <p><strong>Video trailer:</strong></p>
        <a href="${story.trailer}" target="_blank">Guarda presentazione</a>
      </div>
    `;
  }

  media.innerHTML = html;
}

function renderStoryMaterials(story) {
  const container = document.getElementById("storyMaterials");
  if (!container) return;

  const materials = story.materials || [];
  const unlocked = isStoryUnlocked(story.id) || isCurrentUserStory(story);

  if (!materials.length || !materials.some(material => material.name)) {
    container.innerHTML = `<div class="locked-box">🔒 Questa storia non ha ancora materiali caricati.</div>`;
    return;
  }

  const visibleNowMaterials = materials.filter(material => material.visibility === "Visibile subito");
  const lockedMaterials = materials.filter(material => material.visibility !== "Visibile subito");

  let html = "";

  if (visibleNowMaterials.length) {
    html += `<h3>Materiali visibili subito</h3>`;
    html += visibleNowMaterials.map(material => `
      <div class="card unlocked-material">
        <h3>📂 ${material.name}</h3>
        <p><strong>Tipo:</strong> ${material.type || "Materiale"}</p>
        <p><strong>Visibilità:</strong> ${material.visibility}</p>
        <p>${material.notes || "Materiale disponibile subito."}</p>
        ${material.url ? `<a class="material-download" href="${material.url}" target="_blank" rel="noopener">Apri materiale</a>` : ""}
      </div>
    `).join("");
  }

  if (lockedMaterials.length && !unlocked) {
    html += `
      <div class="locked-box">
        🔒 Ci sono ${lockedMaterials.length} materiali riservati bloccati.<br>
        Disponibili dopo acquisto, prenotazione confermata o rilascio del Master.
      </div>
    `;
  }

  if (lockedMaterials.length && unlocked) {
    html += `<h3>Materiali sbloccati</h3>`;
    html += lockedMaterials.map(material => `
      <div class="card unlocked-material">
        <h3>📂 ${material.name}</h3>
        <p><strong>Tipo:</strong> ${material.type || "Materiale"}</p>
        <p><strong>Visibilità:</strong> ${material.visibility || "Dopo acquisto"}</p>
        <p>${material.notes || "Materiale riservato per la sessione."}</p>
        ${material.url ? `<a class="material-download" href="${material.url}" target="_blank" rel="noopener">Apri materiale</a>` : ""}
      </div>
    `).join("");
  }

  container.innerHTML = html;
}

function unlockCurrentStory() {
  if (!currentStory) return;

  const unlockedStories = getUnlockedStories();

  if (!unlockedStories.includes(currentStory.id)) {
    unlockedStories.push(currentStory.id);
  }

  writeJsonStorage(getUserScopedKey("questhubUnlockedStories"), unlockedStories);

  renderStoryMaterials(currentStory);
  showToast("Storia sbloccata. Ora puoi vedere i materiali riservati.", "success");
  addNotification(`Materiali sbloccati per "${currentStory.title}".`, "success", { storyId: currentStory.id });
}

function getPublicMasterReviews(stories = []) {
  const storyIds = new Set(stories.map(story => storyId(story.id)).filter(Boolean));
  const reviews = [];
  const seen = new Set();

  getStoryReviewsStore().forEach(review => {
    if (!storyIds.has(storyId(review.storyId))) return;

    const reviewKey = storyId(review.id || `${review.storyId}-${review.author || "user"}-${review.text || ""}`);
    if (seen.has(reviewKey)) return;
    seen.add(reviewKey);

    reviews.push({
      author: review.author || t("publicMasterGenericPlayer", "Giocatore Lorecast"),
      rating: Number(review.rating || 0),
      text: review.text || "",
      date: review.date || ""
    });
  });

  if (typeof reviewsData !== "undefined") {
    stories.forEach(story => {
      reviewsData
        .filter(review => story.masterId && storyIdsMatch(review.masterId, story.masterId))
        .forEach(review => {
          const reviewKey = storyId(review.id || `${story.masterId}-${review.author}-${review.date}`);
          if (seen.has(reviewKey)) return;
          seen.add(reviewKey);

          reviews.push({
            author: review.author || t("publicMasterGenericPlayer", "Giocatore Lorecast"),
            rating: Number(review.rating || 0),
            text: review.text || "",
            date: review.date || ""
          });
        });
    });
  }

  return reviews.filter(review => review.rating > 0);
}

function getPublicMasterReviewSummary(stories = []) {
  const reviews = getPublicMasterReviews(stories);
  const count = reviews.length;
  const average = count
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count
    : 0;

  return {
    count,
    average,
    averageLabel: average ? average.toFixed(1) : "0.0",
    reviews
  };
}

function getPublicMasterPriceLabel(stories = []) {
  const prices = stories
    .map(story => Number(story.price || 0))
    .filter(price => price > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return t("priceFree", "Gratis");
  return prices.length === 1
    ? formatMoney(prices[0], { freeLabel: false })
    : formatMoney(prices[0], { freeLabel: false, from: true });
}

function getPublicMasterModeLabel(stories = []) {
  const modes = [...new Set(stories.map(story => story.mode).filter(Boolean))];
  return modes.length ? modes.slice(0, 2).join(" / ") : "Online";
}

function getPublicMasterLanguageLabel(stories = []) {
  const languages = [...new Set(stories.map(story => getStoryLanguageCode(story)).filter(Boolean))];
  return languages.length
    ? languages.slice(0, 3).map(code => getStoryLanguageLabel(code)).join(" / ")
    : getStoryLanguageLabel("it");
}

function getPublicMasterSpecialties(stories = [], fallback = []) {
  const genres = [...new Set(stories.map(story => story.genre).filter(Boolean))];
  return genres.length ? genres.slice(0, 4) : fallback.slice(0, 4);
}

function renderPublicMasterAvatar(name, avatarUrl = "") {
  const avatarEl = document.getElementById("masterProfileAvatar");
  const bgEl = document.getElementById("masterProfileHeroBg");
  const displayName = getPublicDisplayName(name, t("trendingMasterFallback", "Master Lorecast"));
  const initial = displayName.slice(0, 1).toUpperCase() || "M";

  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtmlAttribute(avatarUrl)}" alt="${escapeHtmlAttribute(displayName)}" />`
    : `<span>${escapeHtml(initial)}</span>`;

  if (avatarEl) avatarEl.innerHTML = avatarHtml;

  if (bgEl) {
    bgEl.innerHTML = avatarUrl
      ? `<img src="${escapeHtmlAttribute(avatarUrl)}" alt="" />`
      : `<span>${escapeHtml(initial)}</span>`;
    bgEl.classList.toggle("has-image", Boolean(avatarUrl));
  }
}

function renderPublicMasterStories(stories = []) {
  const container = document.getElementById("masterPublishedStories");
  if (!container) return;

  if (!stories.length) {
    container.innerHTML = `<p>${t("publicMasterNoStories", "Nessuna storia pubblicata al momento.")}</p>`;
    return;
  }

  container.innerHTML = stories.map(story => {
    const storyArg = storyJsArg(story.id);
    const genreClass = getGenreClass(story.genre || "");
    const coverHtml = story.cover
      ? `<div class="public-master-story-cover image-cover" style="background-image: url('${escapeHtmlAttribute(story.cover)}')"></div>`
      : `<div class="public-master-story-cover ${genreClass}"><span>${escapeHtml(story.genre || "Storia")}</span></div>`;

    return `
      <article class="public-master-story-card" onclick='openStory(${storyArg})'>
        ${coverHtml}
        <div class="public-master-story-body">
          <h3>${escapeHtml(story.title || "Storia")}</h3>
          <p>${escapeHtml(story.genre || "")} · ${escapeHtml(story.type || "")} · ${escapeHtml(getStoryLanguageLabel(story))}</p>
          <small>${escapeHtml(story.players || "")} · ${escapeHtml(story.duration || "")}</small>
        </div>
        <button class="light" type="button" onclick='event.stopPropagation(); openStory(${storyArg})'>${escapeHtml(t("commonOpen", "Apri"))}</button>
      </article>
    `;
  }).join("");
}

function renderPublicMasterReviews(stories = []) {
  const summaryEl = document.getElementById("masterReviewsSummary");
  const container = document.getElementById("masterReviews");
  if (!container) return;

  const summary = getPublicMasterReviewSummary(stories);

  if (summaryEl) {
    summaryEl.textContent = summary.count
      ? `${summary.averageLabel} ★ · ${summary.count} ${summary.count === 1 ? t("homeMasterReviewShortSingular", "recensione") : t("homeMasterReviewsShort", "recensioni")}`
      : t("profileNoReviews", "Nessuna recensione");
  }

  if (!summary.reviews.length) {
    container.innerHTML = `<div class="public-master-empty-review">${escapeHtml(t("profileNoReviews", "Nessuna recensione"))}</div>`;
    return;
  }

  container.innerHTML = summary.reviews.slice(0, 3).map(review => `
    <article class="public-master-review-card">
      <div>
        <strong>${"★".repeat(Math.round(review.rating))}${"☆".repeat(Math.max(0, 5 - Math.round(review.rating)))}</strong>
        <span>${escapeHtml(review.author || t("publicMasterGenericPlayer", "Giocatore Lorecast"))}</span>
      </div>
      <p>${escapeHtml(review.text || "")}</p>
    </article>
  `).join("");
}

function renderPublicMasterProfile(options = {}) {
  const stories = options.stories || [];
  const displayName = getPublicDisplayName(options.name, t("trendingMasterFallback", "Master Lorecast"));
  const summary = getPublicMasterReviewSummary(stories);
  const specialties = getPublicMasterSpecialties(stories, options.specialties || []);

  const setText = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value ?? "";
  };

  const setHtml = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.innerHTML = value ?? "";
  };

  renderPublicMasterAvatar(displayName, options.avatarUrl || "");

  setText("masterProfileName", displayName);
  setText("masterProfileBio", options.bio || t("publicMasterDefaultBio", "Profilo pubblico Master con storie pubblicate e attività disponibili su Lorecast."));
  setText("masterProfileStoriesCount", stories.length);
  setText("masterProfileReviewsCount", summary.count);
  setText("masterProfileRating", summary.averageLabel);
  setText("masterProfileStats", stories.length === 1
    ? t("homeMasterStoriesOne", "1 storia")
    : tf("homeMasterStoriesMany", { count: stories.length }, `${stories.length} storie`)
  );

  setText("masterProfilePrice", options.price || getPublicMasterPriceLabel(stories));
  setText("masterProfileMode", options.mode || getPublicMasterModeLabel(stories));
  setText("masterProfileLanguage", options.language || getPublicMasterLanguageLabel(stories));
  setText("masterProfileAvailability", options.availability || t("publicMasterAvailabilityManaged", "Disponibilità gestita dal calendario"));

  setHtml("masterProfileSpecialties", specialties.length
    ? specialties.map(item => `<span class="tag ${getGenreClass(item)}">${escapeHtml(item)}</span>`).join("")
    : `<span class="tag">${escapeHtml(t("trendingMasterFallback", "Master Lorecast"))}</span>`
  );

  renderPublicMasterStories(stories);
  renderPublicMasterReviews(stories);
  applyTranslations();
  go("profilo-master");
}

async function openStoryAuthorProfile(storyIdValue) {
  const story = getAllStories().find(item => storyIdsMatch(item.id, storyIdValue)) || currentStory;

  if (!story) {
    showToast("Profilo autore non disponibile.", "warning");
    return;
  }

  if (isCurrentUserStory(story)) {
    go("profilo");
    return;
  }

  const demoMaster = mastersData.find(master => Number(master.id) === Number(story.masterId));
  if (demoMaster) {
    currentMaster = demoMaster;
    openMasterProfile();
    return;
  }

  await renderBasicAuthorProfile(story);
}

async function renderBasicAuthorProfile(story) {
  const authorId = story.author_id || story.owner_id || story.masterId || null;

  if (authorId) {
    await loadSupabaseProfilesForUserIds([authorId]);
  }

  const profile = supabaseProfilesCache[storyId(authorId)] || {};
  const authorName = profile.name || story.master || t("trendingMasterFallback", "Master Lorecast");
  const authorStories = getStoriesByAuthorId(authorId);
  const stories = authorStories.length ? authorStories : [story];

  renderPublicMasterProfile({
    name: authorName,
    avatarUrl: profile.avatar_url || "",
    bio: tf("publicMasterCreatedStory", { title: story.title }, `Creatore della storia "${story.title}".`),
    stories
  });
}

function openMasterProfile() {
  if (!currentMaster) return;

  const masterStories = getAllStories().filter(story => story.masterId && storyIdsMatch(story.masterId, currentMaster.id));

  renderPublicMasterProfile({
    name: currentMaster.name,
    bio: currentMaster.bio,
    stories: masterStories,
    specialties: currentMaster.specialties || [],
    price: currentMaster.price,
    mode: currentMaster.mode,
    language: currentMaster.language,
    availability: currentMaster.availability
  });
}

function scrollToPublicMasterStories() {
  const section = document.getElementById("publicMasterStoriesSection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* SEARCH */

function searchHome() {
  go("catalogo");

  setTimeout(() => {
    const q = document.getElementById("q");
    const type = document.getElementById("type");
    const homeSearch = document.getElementById("homeSearch");
    const homeType = document.getElementById("homeType");

    if (q && homeSearch) q.value = homeSearch.value;
    if (type && homeType) type.value = homeType.value;

    renderCatalog();
  }, 0);
}

function resetFilters() {
  const q = document.getElementById("q");
  const genre = document.getElementById("genre");
  const type = document.getElementById("type");
  const price = document.getElementById("price");
  const storyLanguage = document.getElementById("storyLanguageFilter");

  if (q) q.value = "";
  if (genre) genre.value = "";
  if (type) type.value = "";
  if (price) price.value = "";
  if (storyLanguage) storyLanguage.value = "";

  renderCatalog();
}

/* BOOKINGS */

function parseStoryPlayersRange(story) {
  const raw = String(story?.players || "2–6");
  const numbers = raw.match(/\d+/g)?.map(Number) || [1, 6];
  const minPlayers = numbers[0] || 1;
  const maxPlayers = numbers.length > 1 ? numbers[numbers.length - 1] : minPlayers;
  return { minPlayers, maxPlayers };
}

function parsePlayersValue(value, fallback = 1) {
  const parsed = Number(String(value || "").match(/\d+/)?.[0] || fallback);
  return Math.max(1, parsed);
}

function getCurrentStoryMasterId(story) {
  return story?.source === "supabase" ? story?.author_id : story?.masterId;
}

function getStoryDurationMinutes(story) {
  const raw = String(story?.duration || "2 ore").toLowerCase();
  const number = Number((raw.match(/\d+/) || [2])[0]);

  if (raw.includes("min")) return number;
  if (raw.includes("90")) return 90;
  return number * 60;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatItalianDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(getLocaleForLanguage(), {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function formatLongItalianDate(dateString) {
  if (!dateString) return t("bookingDateTbd", "Data da definire");

  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString(getLocaleForLanguage(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatCompactDate(dateString) {
  if (!dateString) return t("bookingDateTbd", "Data da definire");

  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString(getLocaleForLanguage(), {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatLocalizedDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString(getLocaleForLanguage(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBookingDateTime(dateString, startTime = "", endTime = "") {
  if (!dateString) return t("bookingDateTbd", "Data da definire");

  const timePart = startTime
    ? ` · ${startTime}${endTime ? `–${endTime}` : ""}`
    : "";

  return `${formatLongItalianDate(dateString)}${timePart}`;
}

function formatMoney(value, options = {}) {
  const amount = Number(value || 0);
  const { freeLabel = true, from = false } = options;

  if (freeLabel && amount <= 0) return t("priceFree", "Gratis");

  const formatted = new Intl.NumberFormat(getLocaleForLanguage(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);

  return from ? `${t("publicMasterFrom", "da")} ${formatted}` : formatted;
}


function normalizePaymentStatus(status, fallback = "not_active") {
  const key = String(status || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");

  if (["not_required", "free", "gratuito", "gratis", "non_necessario"].includes(key)) return "not_required";
  if (["not_active", "disabled", "preparation", "preparazione", "not_enabled"].includes(key)) return "not_active";
  if (["unpaid", "da_pagare", "non_pagato"].includes(key)) return "unpaid";
  if (["pending", "in_attesa", "processing", "in_elaborazione"].includes(key)) return "pending";
  if (["paid", "pagato", "completed", "succeeded"].includes(key)) return "paid";
  if (["refunded", "rimborsato"].includes(key)) return "refunded";
  if (["failed", "fallito", "errore"].includes(key)) return "failed";

  return fallback;
}

function getTranslatedPaymentStatus(status) {
  const normalized = normalizePaymentStatus(status);

  if (normalized === "not_required") return t("paymentStatusNotRequired", "Non richiesto");
  if (normalized === "not_active") return t("paymentStatusNotActive", "Pagamento non ancora attivo");
  if (normalized === "unpaid") return t("paymentStatusUnpaid", "Da pagare");
  if (normalized === "pending") return t("paymentStatusPending", "Pagamento in attesa");
  if (normalized === "paid") return t("paymentStatusPaid", "Pagato");
  if (normalized === "refunded") return t("paymentStatusRefunded", "Rimborsato");
  if (normalized === "failed") return t("paymentStatusFailed", "Pagamento non riuscito");

  return t("paymentStatusNotActive", "Pagamento non ancora attivo");
}

function getStoryPaymentAmount(story) {
  return Number(story?.price || 0);
}

function isStoryPaymentRequired(story) {
  return getStoryPaymentAmount(story) > 0 && !(story?.isFree);
}

function getInitialPaymentStateForStory(story) {
  const amount = getStoryPaymentAmount(story);
  const required = amount > 0 && !(story?.isFree);

  return {
    status: required ? "not_active" : "not_required",
    amount: required ? amount : 0,
    currency: "EUR"
  };
}

function getBookingPaymentState(booking) {
  const story = getAllStories().find(item => storyIdsMatch(item.id, booking?.storyId));
  const storyAmount = story ? getStoryPaymentAmount(story) : 0;
  const rawAmount = Number(booking?.paymentAmount ?? booking?.payment_amount ?? 0);
  const amount = rawAmount > 0 ? rawAmount : storyAmount;
  const required = amount > 0;
  let status = normalizePaymentStatus(
    booking?.paymentStatus || booking?.payment_status || "",
    required ? "not_active" : "not_required"
  );

  if (!required && status === "not_active") {
    status = "not_required";
  }

  return {
    status,
    amount: required ? amount : 0,
    currency: booking?.paymentCurrency || booking?.payment_currency || "EUR",
    label: getTranslatedPaymentStatus(status)
  };
}

function renderPaymentStatusChipFromState(state, extraClass = "") {
  const normalized = normalizePaymentStatus(state?.status);
  const label = state?.label || getTranslatedPaymentStatus(normalized);
  const amount = Number(state?.amount || 0);
  const amountLabel = amount > 0 ? ` · ${formatMoney(amount, { freeLabel: false })}` : "";

  return `<span class="payment-status-chip payment-status-${normalized} ${extraClass}">${escapeHtml(label)}${amountLabel}</span>`;
}

function renderBookingPaymentChip(booking, extraClass = "") {
  return renderPaymentStatusChipFromState(getBookingPaymentState(booking), extraClass);
}

function showPaymentsNotActiveNotice() {
  showToast(t("paymentNotActiveToast", "I pagamenti reali non sono ancora attivi su Lorecast."), "warning");
}

function getTranslatedGenreLabel(genre) {
  const normalized = String(genre || "").toLowerCase();

  if (normalized.includes("fantasy")) return t("genreFantasy", genre || "Fantasy");
  if (normalized.includes("horror")) return t("genreHorror", genre || "Horror");
  if (normalized.includes("investigativo")) return t("genreInvestigative", genre || "Investigativo");
  if (normalized.includes("cena")) return t("genreMurderDinner", genre || "Cena con delitto");
  if (normalized.includes("sci")) return t("genreSciFi", genre || "Sci-fi");

  return genre || "";
}

function getTranslatedStoryTypeLabel(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized.includes("master")) return t("typeWithMaster", type || "Con Master");
  if (normalized.includes("self")) return t("typeSelfPlay", type || "Self-play");

  return type || "";
}

function getDefaultMasterAvailability() {
  return [
    { id: 1, storyId: "", masterId: 1, weekday: 6, startTime: "13:00", endTime: "17:30" },
    { id: 2, storyId: "", masterId: 1, weekday: 2, startTime: "19:00", endTime: "22:30" },
    { id: 3, storyId: "", masterId: 2, weekday: 0, startTime: "16:00", endTime: "21:00" },
    { id: 4, storyId: "", masterId: 3, weekday: 5, startTime: "20:00", endTime: "23:30" },
    { id: 5, storyId: "", masterId: 3, weekday: 6, startTime: "18:00", endTime: "23:30" }
  ];
}

function getMasterAvailabilityRules() {
  if (supabaseAvailabilityLoaded) {
    return [...getDefaultMasterAvailability(), ...supabaseAvailabilityCache];
  }

  const saved = JSON.parse(localStorage.getItem("questhubMasterAvailability") || "null");
  if (Array.isArray(saved) && saved.length) return saved;

  const defaults = getDefaultMasterAvailability();
  localStorage.setItem("questhubMasterAvailability", JSON.stringify(defaults));
  return defaults;
}

function getAvailabilityForMaster(masterId) {
  return getMasterAvailabilityRules().filter(rule => storyIdsMatch(rule.masterId, masterId));
}

function getAvailabilityForStory(story) {
  if (!story) return [];

  const id = storyId(story.id);
  const masterId = story.masterId;
  const rules = getMasterAvailabilityRules();

  const storySpecificRules = rules.filter(rule =>
    rule.storyId && storyIdsMatch(rule.storyId, id)
  );

  if (storySpecificRules.length) return storySpecificRules;

  return rules.filter(rule =>
    !rule.storyId && storyIdsMatch(rule.masterId, masterId)
  );
}

function getBookings() {
  if (supabaseBookingsLoaded) return supabaseBookingsCache;
  return JSON.parse(localStorage.getItem("questhubBookings") || "[]");
}

function hasBookingOverlap(masterId, date, startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  return getBookings().some(booking => {
    if (!storyIdsMatch(booking.masterId, masterId)) return false;
    if (booking.date !== date) return false;
    if (isBookingInactive(booking.status)) return false;

    const bookingStart = timeToMinutes(booking.startTime || booking.time);
    const bookingEnd = timeToMinutes(booking.endTime || minutesToTime(bookingStart + (booking.durationMinutes || 120)));

    return start < bookingEnd && end > bookingStart;
  });
}

function hasPublicSessionOverlap(story, date, startTime, endTime) {
  if (!story || !supabasePublicSessionsLoaded) return false;

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const masterId = getCurrentStoryMasterId(story);

  return supabasePublicSessionsCache.some(session => {
    if (!["open", "complete"].includes(session.status)) return false;
    if (!session.sessionDate || session.sessionDate !== date) return false;

    const sessionStory = getAllStories().find(item => storyIdsMatch(item.id, session.storyId));
    if (!sessionStory || !storyIdsMatch(getCurrentStoryMasterId(sessionStory), masterId)) return false;

    const sessionStart = timeToMinutes(session.startTime);
    const sessionEnd = timeToMinutes(session.endTime);
    return start < sessionEnd && end > sessionStart;
  });
}

function getDaySlots(story, date) {
  const dateIso = formatISODate(date);
  const rules = getAvailabilityForStory(story).filter(rule => {
    if (rule.availabilityDate) return rule.availabilityDate === dateIso;
    return Number(rule.weekday) === date.getDay();
  });

  const slots = [];
  const seen = new Set();

  rules.forEach(rule => {
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

    const startTime = minutesToTime(start);
    const endTime = minutesToTime(end);
    const key = `${dateIso}-${startTime}-${endTime}`;

    if (seen.has(key)) return;
    seen.add(key);

    const occupied = hasBookingOverlap(getCurrentStoryMasterId(story), dateIso, startTime, endTime) || hasPublicSessionOverlap(story, dateIso, startTime, endTime);

    slots.push({
      date: dateIso,
      startTime,
      endTime,
      durationMinutes: end - start,
      occupied
    });
  });

  return slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function hasSlotsInCalendarWindow(story, offsetDays) {
  if (!story) return false;
  const baseDate = addDays(new Date(), Math.max(0, offsetDays));
  return Array.from({ length: 4 }, (_, index) => addDays(baseDate, index))
    .some(day => getDaySlots(story, day).length > 0);
}

function findNextCalendarWindowWithSlots(story, fromOffsetDays = 0) {
  for (let offset = Math.max(0, fromOffsetDays); offset <= 60; offset += 4) {
    if (hasSlotsInCalendarWindow(story, offset)) return offset;
  }

  return null;
}

function renderBookingCalendar(story = currentStory) {
  const container = document.getElementById("bookingCalendar");
  if (!container || !story) return;

  if (!hasSlotsInCalendarWindow(story, bookingCalendarOffsetDays)) {
    const nextOffset = findNextCalendarWindowWithSlots(story, bookingCalendarOffsetDays + 1);
    if (nextOffset !== null) bookingCalendarOffsetDays = nextOffset;
  }

  const baseDate = addDays(new Date(), bookingCalendarOffsetDays);
  const days = Array.from({ length: 3 }, (_, index) => addDays(baseDate, index));
  const slotsByDay = days.map(day => ({ day, slots: getDaySlots(story, day) }));
  const allTimes = Array.from(new Set(slotsByDay.flatMap(item => item.slots.map(slot => slot.startTime)))).sort();
  const visibleTimes = bookingCalendarExpanded ? allTimes : allTimes.slice(0, 5);

  if (!allTimes.length) {
    const owner = isCurrentUserStory(story);
    container.innerHTML = `
      <div class="booking-calendar-empty">
        <p>${owner
          ? "Non hai ancora impostato disponibilità per questa storia."
          : "Il creatore imposterà la disponibilità a breve."}</p>
        ${owner ? `<button class="light" onclick="go('area-master')">Imposta disponibilità</button>` : ""}
      </div>
    `;
    return;
  }

  const head = days.map(day => `
    <div class="booking-calendar-day">
      <strong>${formatItalianDate(day).split(" ")[0]}</strong>
      <span>${formatItalianDate(day).replace(formatItalianDate(day).split(" ")[0], "").trim()}</span>
    </div>
  `).join("");

  const rows = visibleTimes.map(time => {
    const cells = slotsByDay.map(({ day, slots }) => {
      const slot = slots.find(item => item.startTime === time);

      if (!slot) return `<div class="booking-slot-cell empty">-</div>`;

      if (slot.occupied) {
        return `
          <div class="booking-slot-cell occupied">
            <span>${slot.startTime}</span>
            <small>${slot.endTime}</small>
          </div>
        `;
      }

      const selected = selectedBookingSlot
        && selectedBookingSlot.date === slot.date
        && selectedBookingSlot.startTime === slot.startTime;

      return `
        <button
          type="button"
          class="booking-slot-cell available ${selected ? "selected" : ""}"
          onclick="selectBookingSlot('${slot.date}', '${slot.startTime}', '${slot.endTime}')"
          aria-label="Prenota dalle ${slot.startTime} alle ${slot.endTime}"
        >
          <span>${slot.startTime}</span>
          <small>${slot.endTime}</small>
        </button>
      `;
    }).join("");

    return `<div class="booking-calendar-row">${cells}</div>`;
  }).join("");

  container.innerHTML = `
    <div class="booking-calendar-toolbar">
      <button class="calendar-nav-button" type="button" onclick="shiftBookingCalendar(-4)">‹</button>
      <div class="booking-calendar-head">${head}</div>
      <button class="calendar-nav-button" type="button" onclick="shiftBookingCalendar(4)">›</button>
    </div>
    <div class="booking-calendar-body">${rows}</div>
    ${allTimes.length > 5 ? `<button class="calendar-more-button" type="button" onclick="toggleMoreBookingTimes()">${bookingCalendarExpanded ? "Mostra meno orari" : "Mostra più orari"}⌄</button>` : ""}
  `;
}

function shiftBookingCalendar(days) {
  bookingCalendarOffsetDays = Math.max(0, bookingCalendarOffsetDays + days);

  if (days > 0) {
    const nextOffset = findNextCalendarWindowWithSlots(currentStory, bookingCalendarOffsetDays);
    if (nextOffset !== null) bookingCalendarOffsetDays = nextOffset;
  }

  selectedBookingSlot = null;
  renderBookingCalendar(currentStory);
  updateSelectedSlotLabel();
}

function toggleMoreBookingTimes() {
  bookingCalendarExpanded = !bookingCalendarExpanded;
  renderBookingCalendar(currentStory);
}

function selectBookingSlot(date, startTime, endTime) {
  selectedBookingSlot = { date, startTime, endTime };
  renderBookingCalendar(currentStory);
  updateSelectedSlotLabel();
  if (currentStory) renderJoinSession(currentStory);
}

function updateSelectedSlotLabel() {
  const label = document.getElementById("bookingSelectedSlotLabel");
  if (!label) return;

  if (!selectedBookingSlot) {
    label.textContent = t("bookingNoSlotSelected", "Nessuno slot selezionato.");
    return;
  }

  label.textContent = tf("bookingSelectedSlot", {
    date: formatLongItalianDate(selectedBookingSlot.date),
    start: selectedBookingSlot.startTime,
    end: selectedBookingSlot.endTime
  }, `Slot selezionato: ${formatLongItalianDate(selectedBookingSlot.date)}, ${selectedBookingSlot.startTime}–${selectedBookingSlot.endTime}`);
}

async function notifyMasterBookingEmail(booking) {
  if (typeof supabaseClient === "undefined" || !supabaseClient.functions?.invoke) return;

  try {
    const { error } = await supabaseClient.functions.invoke("send-booking-email", {
      body: { booking }
    });

    if (error) {
      console.warn("Email prenotazione non inviata. Configura la Edge Function send-booking-email.", error);
    }
  } catch (error) {
    console.warn("Email prenotazione non inviata. Configura la Edge Function send-booking-email.", error);
  }
}

async function createBooking() {
  if (!currentStory) return;

  const profile = getUserProfile();
  if (!profile.email) {
    showToast("Devi accedere per prenotare una sessione.", "warning");
    go("login");
    return;
  }

  const group = document.getElementById("bookingGroup")?.value.trim() || "";
  const players = document.getElementById("bookingPlayers")?.value || "";
  const message = document.getElementById("bookingMessage")?.value.trim() || "";

  if (!selectedBookingSlot) {
    showToast("Seleziona uno slot libero dal calendario.", "warning");
    return;
  }

  if (!group || !players) {
    showToast("Inserisci nome gruppo/referente e numero giocatori.", "warning");
    return;
  }

  const bookedSlot = { ...selectedBookingSlot };

  await loadSupabaseBookings();

  if (hasBookingOverlap(getCurrentStoryMasterId(currentStory), bookedSlot.date, bookedSlot.startTime, bookedSlot.endTime) || hasPublicSessionOverlap(currentStory, bookedSlot.date, bookedSlot.startTime, bookedSlot.endTime)) {
    showToast("Questo slot è appena stato occupato. Scegli un altro orario.", "warning");
    renderBookingCalendar(currentStory);
    return;
  }

  const paymentState = getInitialPaymentStateForStory(currentStory);

  const bookingPayload = {
    story_id: storyId(currentStory.id),
    story_title: currentStory.title,
    master_id: getCurrentStoryMasterId(currentStory) || null,
    user_id: getCurrentUserId(),
    group_name: group,
    booking_date: bookedSlot.date,
    start_time: bookedSlot.startTime,
    end_time: bookedSlot.endTime,
    duration_minutes: getStoryDurationMinutes(currentStory),
    players,
    message,
    status: "In attesa",
    payment_status: paymentState.status,
    payment_amount: paymentState.amount,
    payment_currency: paymentState.currency
  };

  let booking = null;

  if ((typeof supabaseClient !== "undefined") && getCurrentUserId()) {
    const { data, error } = await supabaseClient
      .from("bookings")
      .insert(bookingPayload)
      .select()
      .single();

    if (error) {
      showToast("Errore prenotazione: " + error.message, "error");
      return;
    }

    booking = normalizeBooking(data);
    supabaseBookingsCache = [booking, ...supabaseBookingsCache.filter(item => !storyIdsMatch(item.id, booking.id))];
    supabaseBookingsLoaded = true;
    await loadSupabaseProfilesForUserIds([booking.user_id, booking.masterId]);
  } else {
    const bookings = getBookings();
    booking = {
      id: Date.now(),
      storyId: currentStory.id,
      masterId: currentStory.masterId,
      story: currentStory.title,
      master: currentStory.master || currentMaster?.name || "Master Lorecast",
      group,
      date: bookedSlot.date,
      time: bookedSlot.startTime,
      startTime: bookedSlot.startTime,
      endTime: bookedSlot.endTime,
      durationMinutes: getStoryDurationMinutes(currentStory),
      players,
      message,
      status: "In attesa",
      paymentStatus: paymentState.status,
      paymentAmount: paymentState.amount,
      paymentCurrency: paymentState.currency,
      user_id: getCurrentUserId()
    };
    bookings.push(booking);
    localStorage.setItem("questhubBookings", JSON.stringify(bookings));
  }

  const notice = document.getElementById("bookNotice");
  if (notice) notice.style.display = "block";

  document.getElementById("bookingGroup").value = "";
  document.getElementById("bookingPlayers").value = "";
  document.getElementById("bookingMessage").value = "";
  selectedBookingSlot = null;

  renderBookingCalendar(currentStory);
  updateSelectedSlotLabel();

  showToast("Richiesta di prenotazione inviata al Master.", "success");
  addNotification(`Richiesta di prenotazione inviata per "${currentStory.title}".`, "success", { storyId: currentStory.id, page: "profilo" });

  // La notifica al Master viene creata anche lato database con trigger,
  // così arriva anche se il frontend viene chiuso subito dopo la prenotazione.
  await notifyMasterBookingEmail(booking);
  await loadSupabaseNotifications();
  renderUserProfile();
}

function getBookingStatusKey(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function isBookingPending(status) {
  return ["in attesa", "pending"].includes(getBookingStatusKey(status));
}

function isBookingAccepted(status) {
  return ["accettata", "accepted"].includes(getBookingStatusKey(status));
}

function isBookingCompleted(status) {
  return ["completata", "completa", "completed", "complete"].includes(getBookingStatusKey(status));
}

function isBookingRejectedOrCancelled(status) {
  return [
    "annullata",
    "cancelled",
    "canceled",
    "rifiutata",
    "rejected"
  ].includes(getBookingStatusKey(status));
}

function isBookingInactive(status) {
  return isBookingRejectedOrCancelled(status) || isBookingCompleted(status);
}

function getTranslatedBookingStatus(status) {
  const key = getBookingStatusKey(status);

  if (isBookingPending(status)) return t("bookingStatusPending", "In attesa");
  if (isBookingAccepted(status)) return t("bookingStatusAccepted", "Accettata");
  if (isBookingCompleted(status)) return t("bookingStatusCompleted", "Completata");
  if (["rifiutata", "rejected"].includes(key)) return t("bookingStatusRejected", "Rifiutata");
  if (["annullata", "cancelled", "canceled"].includes(key)) return t("bookingStatusCancelled", "Annullata");
  if (["iscritto", "joined"].includes(key)) return t("bookingStatusJoined", "Iscritto");
  if (["open"].includes(key)) return t("bookingStatusOpen", "Aperta");

  return status || t("bookingStatusPending", "In attesa");
}

function getBookingStatusPriority(status) {
  if (isBookingPending(status)) return 0;
  if (isBookingAccepted(status)) return 1;
  if (isBookingCompleted(status)) return 2;
  if (isBookingRejectedOrCancelled(status)) return 3;
  return 9;
}

function getBookingMasterNotificationUserId(booking) {
  if (!booking) return "";
  if (booking.masterId) return storyId(booking.masterId);

  const story = getAllStories().find(item => storyIdsMatch(item.id, booking.storyId));
  return storyId(story?.author_id || story?.owner_id || story?.masterId || "");
}

function getBookingParticipantIds(booking) {
  if (!booking) return { playerId: "", masterId: "" };

  const story = getAllStories().find(item => storyIdsMatch(item.id, booking.storyId));

  return {
    playerId: storyId(booking.user_id || ""),
    masterId: storyId(
      booking.masterId ||
      story?.author_id ||
      story?.owner_id ||
      story?.masterId ||
      ""
    )
  };
}

function isBookingMessagingParticipant(booking, userId = getCurrentUserId()) {
  const ids = getBookingParticipantIds(booking);
  return Boolean(userId && (storyIdsMatch(ids.playerId, userId) || storyIdsMatch(ids.masterId, userId)));
}

function getBookingMessageRecipientId(booking, userId = getCurrentUserId()) {
  const ids = getBookingParticipantIds(booking);

  if (storyIdsMatch(ids.playerId, userId)) return ids.masterId;
  if (storyIdsMatch(ids.masterId, userId)) return ids.playerId;
  return "";
}

function getBookingDateObject(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  const cleanTime = normalizeTime(timeValue);
  const date = new Date(`${dateValue}T${cleanTime}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBookingMessageDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(getLocaleForLanguage(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getBookingMessagingWindow(booking) {
  const start = getBookingDateObject(booking?.date, booking?.startTime || booking?.time);
  const end = getBookingDateObject(booking?.date, booking?.endTime || booking?.startTime || booking?.time);

  if (!start || !end) {
    return {
      isOpen: false,
      state: "missing-date",
      label: t("bookingMessagesMissingDate", "Messaggi disponibili quando la data della sessione è definita."),
      shortLabel: t("profileBookingDateTbd", "Data da definire")
    };
  }

  const openAt = new Date(start.getTime() - 48 * 60 * 60 * 1000);
  const closeAt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();

  if (now < openAt) {
    const dateLabel = formatBookingMessageDateTime(openAt);
    return {
      isOpen: false,
      state: "future",
      openAt,
      closeAt,
      label: tf("bookingMessagesAvailableFrom", { date: dateLabel }, `Messaggi disponibili da ${dateLabel}.`),
      shortLabel: tf("bookingMessagesFromShort", { date: dateLabel }, `Dal ${dateLabel}`)
    };
  }

  if (now > closeAt) {
    return {
      isOpen: false,
      state: "closed",
      openAt,
      closeAt,
      label: t("bookingMessagesClosedWindow", "Messaggi chiusi: finestra sessione terminata."),
      shortLabel: t("bookingMessagesClosedShort", "Chat chiusa")
    };
  }

  const closeLabel = formatBookingMessageDateTime(closeAt);
  return {
    isOpen: true,
    state: "open",
    openAt,
    closeAt,
    label: tf("bookingMessagesOpenUntil", { date: closeLabel }, `Messaggi aperti fino a ${closeLabel}.`),
    shortLabel: tf("bookingMessagesOpenUntilShort", { date: closeLabel }, `Aperta fino al ${closeLabel}`)
  };
}

function canUseBookingMessages(booking) {
  if (!booking || booking.source === "public_session") return false;
  if (!isBookingAccepted(booking.status)) return false;
  if (!isBookingMessagingParticipant(booking)) return false;
  return getBookingMessagingWindow(booking).isOpen;
}

function getUnreadBookingMessageNotifications(bookingId) {
  const normalizedBookingId = storyId(bookingId);
  if (!normalizedBookingId) return [];

  return getNotifications().filter(notification =>
    !notification.read &&
    notification.type === "booking_message" &&
    notification.bookingId &&
    storyIdsMatch(notification.bookingId, normalizedBookingId)
  );
}

function getUnreadBookingMessageCount(bookingId) {
  return getUnreadBookingMessageNotifications(bookingId).length;
}

function getTotalUnreadBookingMessagesForBookings(bookings = []) {
  const bookingIds = new Set(
    bookings
      .filter(booking => booking && booking.source !== "public_session")
      .map(booking => storyId(booking.id))
      .filter(Boolean)
  );

  if (!bookingIds.size) return 0;

  return getNotifications().filter(notification =>
    !notification.read &&
    notification.type === "booking_message" &&
    notification.bookingId &&
    bookingIds.has(storyId(notification.bookingId))
  ).length;
}

function renderBookingMessageUnreadBadge(bookingId) {
  const unread = getUnreadBookingMessageCount(bookingId);
  if (!unread) return "";

  return `<span class="booking-message-count" aria-label="${escapeHtmlAttribute(tf("bookingUnreadMessages", { count: unread }, `${unread} nuovi messaggi`))}">${unread > 9 ? "9+" : unread}</span>`;
}

function markBookingMessageNotificationsRead(bookingId) {
  const normalizedBookingId = storyId(bookingId);
  if (!normalizedBookingId) return;

  const notifications = getNotifications();
  const matchingIds = [];
  let changed = false;

  const updated = notifications.map(notification => {
    const matches =
      !notification.read &&
      notification.type === "booking_message" &&
      notification.bookingId &&
      storyIdsMatch(notification.bookingId, normalizedBookingId);

    if (!matches) return notification;

    changed = true;
    if (notification.source === "supabase" && notification.id) matchingIds.push(notification.id);
    return { ...notification, read: true };
  });

  if (!changed) return;

  saveNotifications(updated);
  updateNotificationBadge();
  renderNotifications();
  renderNotificationsPreview();

  if (matchingIds.length && typeof supabaseClient !== "undefined") {
    supabaseClient
      .from("notifications")
      .update({ read: true })
      .in("id", matchingIds)
      .then(({ error }) => {
        if (error) console.warn("Errore aggiornamento notifiche messaggi lette:", error.message);
      });
  }
}

function renderBookingMessageAction(booking, className = "light compact-action") {
  if (!booking || booking.source === "public_session" || !isBookingAccepted(booking.status)) return "";

  const bookingId = storyId(booking.id);
  const bookingArg = JSON.stringify(bookingId);
  const windowInfo = getBookingMessagingWindow(booking);
  const unreadBadge = renderBookingMessageUnreadBadge(bookingId);
  const unreadClass = unreadBadge ? " has-unread" : "";

  if (!isBookingMessagingParticipant(booking)) return "";

  if (!windowInfo.isOpen) {
    const disabledLabel = windowInfo.state === "future"
      ? t("bookingMessagesNotOpenYet", "Messaggi non ancora aperti")
      : windowInfo.state === "closed"
        ? t("bookingMessagesClosedButton", "Messaggi chiusi")
        : t("bookingMessagesButton", "Messaggi");

    return `
      <button class="${className} booking-message-button is-disabled${unreadClass}" type="button" disabled title="${escapeHtmlAttribute(windowInfo.label)}">
        <span>${disabledLabel}</span>
        ${unreadBadge}
      </button>
    `;
  }

  return `
    <button class="${className} booking-message-button${unreadClass}" type="button" onclick='openBookingMessages(${bookingArg})' title="${escapeHtmlAttribute(windowInfo.label)}">
      <span>${t("bookingMessagesButton", "Messaggi")}</span>
      ${unreadBadge}
    </button>
  `;
}

function normalizeBookingMessage(row) {
  if (!row) return null;

  return {
    id: row.id,
    bookingId: storyId(row.booking_id || row.bookingId || ""),
    senderId: storyId(row.sender_id || row.senderId || ""),
    recipientId: storyId(row.recipient_id || row.recipientId || ""),
    message: row.message || row.body || "",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    source: row.source || "supabase"
  };
}

function getLocalBookingMessages(bookingId) {
  return readJsonStorage(getUserScopedKey("questhubBookingMessages"), [])
    .map(normalizeBookingMessage)
    .filter(message => message && storyIdsMatch(message.bookingId, bookingId));
}

function saveLocalBookingMessage(message) {
  const messages = readJsonStorage(getUserScopedKey("questhubBookingMessages"), []);
  messages.push(message);
  writeJsonStorage(getUserScopedKey("questhubBookingMessages"), messages.slice(-100));
}

async function loadBookingMessages(bookingId) {
  const normalizedBookingId = storyId(bookingId);
  if (!normalizedBookingId) return [];

  if (typeof supabaseClient === "undefined") {
    return getLocalBookingMessages(normalizedBookingId);
  }

  const { data, error } = await supabaseClient
    .from("booking_messages")
    .select("*")
    .eq("booking_id", normalizedBookingId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Impossibile caricare i messaggi prenotazione:", error.message);
    showToast("Messaggi non disponibili. Verifica di aver eseguito lo SQL Update 49.", "warning");
    return [];
  }

  return (data || []).map(normalizeBookingMessage).filter(Boolean);
}

function ensureBookingMessagesModal() {
  let modal = document.getElementById("bookingMessagesModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "bookingMessagesModal";
  modal.className = "booking-messages-modal";
  modal.innerHTML = `
    <div class="booking-messages-box" role="dialog" aria-modal="true" aria-labelledby="bookingMessagesTitle">
      <div class="booking-messages-header">
        <div>
          <h2 id="bookingMessagesTitle">${t("bookingMessagesTitle", "Messaggi sessione")}</h2>
          <p id="bookingMessagesSubtitle"></p>
        </div>
        <button class="light icon-button" type="button" onclick="closeBookingMessages()" aria-label="${escapeHtmlAttribute(t("bookingMessagesClose", "Chiudi messaggi"))}">×</button>
      </div>

      <div id="bookingMessagesList" class="booking-messages-list"></div>

      <form id="bookingMessagesForm" class="booking-messages-form" onsubmit="sendBookingMessage(event)">
        <textarea id="bookingMessageText" maxlength="1000" placeholder="${escapeHtmlAttribute(t("bookingMessagePlaceholder", "Scrivi un messaggio al Master o al giocatore..."))}"></textarea>
        <div class="booking-messages-form-footer">
          <small>${t("bookingMessagesWindowHint", "Disponibile da 48 ore prima fino a 24 ore dopo la sessione.")}</small>
          <button class="primary" type="submit">${t("bookingMessagesSend", "Invia")}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function renderBookingMessagesModal(booking, messages = []) {
  const modal = ensureBookingMessagesModal();
  const title = document.getElementById("bookingMessagesTitle");
  const subtitle = document.getElementById("bookingMessagesSubtitle");
  const list = document.getElementById("bookingMessagesList");
  const textarea = document.getElementById("bookingMessageText");
  const form = document.getElementById("bookingMessagesForm");
  const windowInfo = getBookingMessagingWindow(booking);
  const currentUserId = getCurrentUserId();

  if (title) title.textContent = booking?.story || t("bookingMessagesTitle", "Messaggi sessione");
  if (subtitle) {
    const counterpartId = getBookingMessageRecipientId(booking, currentUserId);
    const counterpartName = getUserDisplayName(counterpartId, t("bookingParticipant", "partecipante"));
    subtitle.textContent = `${formatBookingDateTime(booking.date, booking.startTime || booking.time, booking.endTime)} · ${t("bookingWith", "con")} ${counterpartName}. ${windowInfo.label}`;
  }

  if (list) {
    list.innerHTML = messages.length
      ? messages.map(message => {
          const isMine = storyIdsMatch(message.senderId, currentUserId);
          const senderName = isMine ? t("bookingMessageYou", "Tu") : getUserDisplayName(message.senderId, "Utente Lorecast");
          const sentAt = message.createdAt ? formatLocalizedDateTime(message.createdAt) : "";

          return `
            <article class="booking-message-item ${isMine ? "is-mine" : ""}">
              <div>
                <strong>${escapeHtml(senderName)}</strong>
                <span>${escapeHtml(sentAt)}</span>
              </div>
              <p>${escapeHtml(message.message)}</p>
            </article>
          `;
        }).join("")
      : `<div class="booking-messages-empty">${t("bookingMessagesEmpty", "Nessun messaggio ancora. Usa questo spazio solo per dettagli pratici della sessione.")}</div>`;

    list.scrollTop = list.scrollHeight;
  }

  if (form) form.hidden = !windowInfo.isOpen;
  if (textarea) textarea.value = "";

  modal.classList.add("open");
}

async function openBookingMessages(bookingId) {
  const normalizedBookingId = storyId(bookingId);
  const booking = getBookings().find(item => storyIdsMatch(item.id, normalizedBookingId));

  if (!booking) {
    showToast("Prenotazione non trovata.", "warning");
    return;
  }

  if (!isBookingAccepted(booking.status)) {
    showToast("I messaggi si aprono solo per prenotazioni accettate.", "warning");
    return;
  }

  if (!isBookingMessagingParticipant(booking)) {
    showToast("Non puoi aprire i messaggi di questa prenotazione.", "warning");
    return;
  }

  const windowInfo = getBookingMessagingWindow(booking);
  if (!windowInfo.isOpen) {
    showToast(windowInfo.label, "warning");
  }

  currentBookingMessagesBookingId = normalizedBookingId;
  const messages = await loadBookingMessages(normalizedBookingId);
  markBookingMessageNotificationsRead(normalizedBookingId);
  renderBookingMessagesModal(booking, messages);
}

function closeBookingMessages() {
  const modal = document.getElementById("bookingMessagesModal");
  if (modal) modal.classList.remove("open");
  currentBookingMessagesBookingId = null;
}

async function sendBookingMessage(event) {
  if (event) event.preventDefault();

  const bookingId = storyId(currentBookingMessagesBookingId);
  const booking = getBookings().find(item => storyIdsMatch(item.id, bookingId));
  const textarea = document.getElementById("bookingMessageText");
  const body = textarea?.value.trim() || "";

  if (!booking) {
    showToast("Prenotazione non trovata.", "warning");
    return;
  }

  if (!canUseBookingMessages(booking)) {
    showToast(getBookingMessagingWindow(booking).label, "warning");
    return;
  }

  if (!body) {
    showToast("Scrivi un messaggio prima di inviare.", "warning");
    return;
  }

  if (body.length > 1000) {
    showToast("Il messaggio può avere massimo 1000 caratteri.", "warning");
    return;
  }

  const senderId = getCurrentUserId();
  const recipientId = getBookingMessageRecipientId(booking, senderId);

  if (!recipientId) {
    showToast("Destinatario non trovato.", "warning");
    return;
  }

  let savedMessage = null;

  if (typeof supabaseClient !== "undefined" && booking.source === "supabase") {
    const { data, error } = await supabaseClient
      .from("booking_messages")
      .insert({
        booking_id: bookingId,
        sender_id: senderId,
        recipient_id: recipientId,
        message: body
      })
      .select()
      .single();

    if (error) {
      showToast("Errore invio messaggio: " + error.message, "error");
      return;
    }

    savedMessage = normalizeBookingMessage(data);
  } else {
    savedMessage = {
      id: Date.now(),
      bookingId,
      senderId,
      recipientId,
      message: body,
      createdAt: new Date().toISOString(),
      source: "local"
    };
    saveLocalBookingMessage(savedMessage);
  }

  if (textarea) textarea.value = "";

  const messages = await loadBookingMessages(bookingId);
  renderBookingMessagesModal(booking, savedMessage && !messages.some(item => storyIdsMatch(item.id, savedMessage.id)) ? [...messages, savedMessage] : messages);
  showToast("Messaggio inviato.", "success");
  await loadSupabaseNotifications();
}

function updateMasterRequestsTabBadge(pendingCount) {
  const badge = document.getElementById("masterRequestsTabBadge");
  if (!badge) return;

  const count = Number(pendingCount || 0);
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.style.display = "";
  badge.classList.toggle("is-visible", count > 0);
}

function renderDashboardBookings() {
  const container = document.getElementById("dashboardBookings");
  const count = document.getElementById("dashboardBookingCount");

  if (!container || !count) {
    updateMasterRequestsTabBadge(0);
    return;
  }

  const userId = getCurrentUserId();
  const myStoryIds = getAllStories()
    .filter(story => story.source === "supabase" && story.author_id && storyIdsMatch(story.author_id, userId))
    .map(story => storyId(story.id));

  const masterBookings = getBookings()
    .filter(booking => {
      const isMine = (booking.masterId && storyIdsMatch(booking.masterId, userId)) || myStoryIds.includes(storyId(booking.storyId));
      return isMine && !isBookingRejectedOrCancelled(booking.status);
    });

  const pendingBookings = masterBookings
    .filter(booking => isBookingPending(booking.status))
    .sort((a, b) => getBookingStatusPriority(a.status) - getBookingStatusPriority(b.status));

  const confirmedBookings = masterBookings
    .filter(booking => isBookingAccepted(booking.status))
    .sort((a, b) => `${a.date || ""} ${a.startTime || a.time || ""}`.localeCompare(`${b.date || ""} ${b.startTime || b.time || ""}`));

  const confirmedUnreadCount = getTotalUnreadBookingMessagesForBookings(confirmedBookings);

  count.textContent = pendingBookings.length === 1
    ? t("masterOneRequest", "1 richiesta")
    : tf("masterRequestsCount", { count: pendingBookings.length }, `${pendingBookings.length} richieste`);

  updateMasterRequestsTabBadge(pendingBookings.length);

  const pendingHtml = pendingBookings.length
    ? pendingBookings.map((booking, index) => {
        let statusClass = "pending";
        if (isBookingAccepted(booking.status)) statusClass = "accepted";
        if (isBookingRejectedOrCancelled(booking.status)) statusClass = "rejected";

        const bookingArg = JSON.stringify(storyId(booking.id));
        const storyArg = JSON.stringify(storyId(booking.storyId));
        const canManage = isBookingPending(booking.status);
        const isOpen = index === 0 && canManage ? 'open' : '';

        return `
          <details class="master-request-accordion ${canManage ? "booking-master-card-pending" : ""}" ${isOpen}>
            <summary class="master-request-summary">
              <div class="master-request-summary-main">
                <strong>${escapeHtml(booking.story)}</strong>
                <span>${formatBookingDateTime(booking.date, booking.startTime || booking.time, booking.endTime)}</span>
              </div>
              <div class="master-request-summary-meta">
                <span class="master-request-user">${escapeHtml(getUserDisplayName(booking.user_id))}</span>
                <span class="status ${statusClass}">${getTranslatedBookingStatus(booking.status)}</span>
              </div>
            </summary>

            <div class="master-request-body">
              <div class="booking-master-details compact-details">
                <span><strong>${t("masterRequestUser", "Utente")}:</strong> ${escapeHtml(getUserDisplayName(booking.user_id))}</span>
                <span><strong>${t("masterRequestGroup", "Gruppo")}:</strong> ${escapeHtml(booking.group || t("commonNotProvided", "Non indicato"))}</span>
                <span><strong>${t("masterRequestPlayers", "Giocatori")}:</strong> ${escapeHtml(booking.players || "-")}</span>
                <span><strong>${t("paymentStatusLabel", "Pagamento")}:</strong> ${renderBookingPaymentChip(booking)}</span>
                <span><strong>${t("masterRequestCreated", "Richiesta")}:</strong> ${formatLocalizedDateTime(booking.created_at)}</span>
              </div>

              ${booking.message ? `<p class="booking-master-message">“${escapeHtml(booking.message)}”</p>` : `<p class="muted-small">${t("masterNoPlayerMessage", "Nessun messaggio dal giocatore.")}</p>`}

              <div class="booking-master-actions compact-actions">
                <button class="light" onclick='openStory(${storyArg})'>${t("commonViewStory", "Vedi storia")}</button>
                ${canManage ? `
                  <button class="primary" onclick='updateBookingStatus(${bookingArg}, "Accettata")'>${t("bookingAccept", "Accetta")}</button>
                  <button class="danger-light" onclick='updateBookingStatus(${bookingArg}, "Rifiutata")'>${t("bookingReject", "Rifiuta")}</button>
                ` : ""}
              </div>
            </div>
          </details>
        `;
      }).join("")
    : `<p>${t("masterNoPendingRequests", "Nessuna richiesta di prenotazione al momento.")}</p>`;

  const confirmedHtml = confirmedBookings.length
    ? `
      <div class="master-confirmed-bookings">
        <div class="master-subsection-head">
          <h3>${t("masterConfirmedBookings", "Prenotazioni confermate")}</h3>
          <div class="master-subsection-counters">
            <span class="pill-counter">${tf("masterConfirmedCount", { count: confirmedBookings.length }, `${confirmedBookings.length} confermate`)}</span>
            ${confirmedUnreadCount > 0 ? `<span class="pill-counter alert-counter">${tf("bookingUnreadMessages", { count: confirmedUnreadCount > 9 ? "9+" : confirmedUnreadCount }, `${confirmedUnreadCount > 9 ? "9+" : confirmedUnreadCount} nuovi messaggi`)}</span>` : ""}
          </div>
        </div>
        <div class="master-confirmed-list">
          ${confirmedBookings.map(booking => {
            const storyArg = JSON.stringify(storyId(booking.storyId));
            const windowInfo = getBookingMessagingWindow(booking);
            const unreadMessages = getUnreadBookingMessageCount(booking.id);

            return `
              <article class="master-confirmed-booking-row ${unreadMessages > 0 ? "has-unread-messages" : ""}">
                <div class="master-confirmed-booking-main">
                  <strong>${escapeHtml(booking.story)}</strong>
                  <span>${formatBookingDateTime(booking.date, booking.startTime || booking.time, booking.endTime)}</span>
                  <small>${escapeHtml(getUserDisplayName(booking.user_id))} · ${escapeHtml(windowInfo.label)}${unreadMessages > 0 ? ` · ${tf("bookingUnreadMessages", { count: unreadMessages > 9 ? "9+" : unreadMessages }, `${unreadMessages > 9 ? "9+" : unreadMessages} nuovi messaggi`)}` : ""}</small>
                </div>
                <div class="master-confirmed-statuses">
                  <span class="status accepted">${t("bookingStatusAccepted", "Accettata")}</span>
                  ${renderBookingPaymentChip(booking)}
                </div>
                <div class="master-confirmed-actions">
                  ${renderBookingMessageAction(booking, "light")}
                  <button class="light" onclick='openStory(${storyArg})'>${t("storySingular", "Storia")}</button>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="master-pending-requests-block">
      ${pendingHtml}
    </div>
    ${confirmedHtml}
  `;
}

async function updateBookingStatus(id, status) {
  const bookingId = storyId(id);
  let changedBooking = getBookings().find(booking => storyIdsMatch(booking.id, bookingId));

  if (!changedBooking) {
    showToast("Prenotazione non trovata.", "warning");
    return;
  }

  if (!isBookingPending(changedBooking.status)) {
    showToast("Questa richiesta è già stata aggiornata e non può più essere gestita da qui.", "warning");
    await loadSupabaseBookings();
    renderDashboardBookings();
    renderDashboardStats();
    renderBookingCalendar(currentStory);
    return;
  }

  if ((typeof supabaseClient !== "undefined") && changedBooking.source === "supabase") {
    const { data, error } = await supabaseClient
      .from("bookings")
      .update({ status })
      .eq("id", bookingId)
      .in("status", ["In attesa", "in attesa", "pending", "Pending"])
      .select()
      .maybeSingle();

    if (error) {
      showToast("Errore aggiornamento prenotazione: " + error.message, "error");
      return;
    }

    if (!data) {
      showToast("La richiesta non è più in attesa. Aggiorno la lista.", "warning");
      await loadSupabaseBookings();
      renderDashboardBookings();
      renderDashboardStats();
      renderBookingCalendar(currentStory);
      return;
    }

    changedBooking = normalizeBooking(data);
    supabaseBookingsCache = supabaseBookingsCache.map(booking => storyIdsMatch(booking.id, bookingId) ? changedBooking : booking);
  } else {
    const bookings = getBookings();
    const updatedBookings = bookings.map(booking => storyIdsMatch(booking.id, bookingId) ? { ...booking, status } : booking);
    localStorage.setItem("questhubBookings", JSON.stringify(updatedBookings));
    changedBooking = updatedBookings.find(booking => storyIdsMatch(booking.id, bookingId)) || changedBooking;
  }

  if (status === "Accettata" && changedBooking.storyId) {
    unlockStoryById(changedBooking.storyId);
  }

  const userMessage = status === "Accettata"
    ? `La tua prenotazione per "${changedBooking.story}" è stata accettata.`
    : `La tua prenotazione per "${changedBooking.story}" è stata rifiutata.`;

  // La notifica al giocatore viene creata dal trigger Supabase
  // update46_booking_status_notifications, così non dipende dai permessi RLS del frontend.

  await loadSupabaseBookings();
  await loadSupabaseNotifications();

  renderDashboardBookings();
  renderDashboardStats();
  renderUserProfile();
  renderBookingCalendar(currentStory);

  if (status === "Accettata") {
    showToast(t("bookingAcceptedPaymentPrepToast", "Prenotazione accettata. Il pagamento reale non è ancora attivo: l’utente riceverà una notifica."), "success");
  }

  if (status === "Rifiutata") {
    showToast("Prenotazione rifiutata. L’utente riceverà una notifica.", "error");
  }
}

async function cancelBooking(id) {
  const bookingId = storyId(id);
  let booking = getBookings().find(item => storyIdsMatch(item.id, bookingId));

  if (!booking) {
    showToast("Prenotazione non trovata.", "warning");
    return;
  }

  if (!isBookingPending(booking.status)) {
    showToast("Puoi annullare solo richieste ancora in attesa.", "warning");
    return;
  }

  if ((typeof supabaseClient !== "undefined") && booking.source === "supabase") {
    const { data, error } = await supabaseClient
      .from("bookings")
      .update({ status: "Annullata" })
      .eq("id", bookingId)
      .in("status", ["In attesa", "in attesa", "pending", "Pending"])
      .select()
      .maybeSingle();

    if (error) {
      showToast("Errore annullamento prenotazione: " + error.message, "error");
      return;
    }

    if (!data) {
      showToast("La richiesta non è più annullabile. Aggiorno la lista.", "warning");
      await loadSupabaseBookings();
      renderMyStories();
      renderUserProfile();
      renderDashboardBookings();
      renderDashboardStats();
      renderBookingCalendar(currentStory);
      return;
    }

    const updated = normalizeBooking(data);
    supabaseBookingsCache = supabaseBookingsCache.map(item => storyIdsMatch(item.id, bookingId) ? updated : item);
    booking = updated;
  } else {
    const updatedBookings = getBookings().map(item => storyIdsMatch(item.id, bookingId) ? { ...item, status: "Annullata" } : item);
    localStorage.setItem("questhubBookings", JSON.stringify(updatedBookings));
    booking = updatedBookings.find(item => storyIdsMatch(item.id, bookingId)) || booking;
  }

  showToast("Prenotazione annullata.", "success");

  // La notifica al Master viene creata dal trigger Supabase
  // update46_booking_status_notifications, così arriva anche se il frontend non può
  // inserire notifiche per un altro utente per via delle policy RLS.

  await loadSupabaseBookings();
  await loadSupabaseNotifications();

  renderMyStories();
  renderUserProfile();
  renderDashboardBookings();
  renderDashboardStats();
  renderBookingCalendar(currentStory);
}

function unlockStoryById(id) {
  const unlockedStories = getUnlockedStories();
  const normalizedId = storyId(id);

  if (!unlockedStories.map(String).includes(normalizedId)) {
    unlockedStories.push(normalizedId);
  }

  writeJsonStorage(getUserScopedKey("questhubUnlockedStories"), unlockedStories);
}

/* JOIN-IN */

function getJoinSessions() {
  if (supabasePublicSessionsLoaded) {
    return supabasePublicSessionsCache.reduce((acc, session) => {
      acc[storyId(session.id)] = session;
      return acc;
    }, {});
  }

  return JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
}

function getJoinedOpenSessions() {
  const userId = getCurrentUserId();

  if (supabaseSessionParticipantsLoaded && userId) {
    return supabaseSessionParticipantsCache
      .filter(participant => storyIdsMatch(participant.user_id, userId) && participant.status === "joined")
      .map(participant => storyId(participant.session_id || participant.story_id));
  }

  return readJsonStorage(getUserScopedKey("questhubJoinedOpenSessions"), []);
}

function saveJoinedOpenSessions(ids) {
  writeJsonStorage(getUserScopedKey("questhubJoinedOpenSessions"), ids);
}

function hasJoinedOpenSession(id) {
  return getJoinedOpenSessions().map(String).includes(storyId(id));
}

function getOpenSessionsForStory(storyIdValue) {
  const id = storyId(storyIdValue);

  if (supabasePublicSessionsLoaded) {
    return supabasePublicSessionsCache.filter(session =>
      storyIdsMatch(session.storyId, id) &&
      session.status === "open" &&
      Number(session.joined) < Number(session.maxPlayers)
    );
  }

  const sessions = JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
  return Object.values(sessions).filter(session =>
    storyIdsMatch(session.storyId, id) &&
    session.status !== "complete" &&
    Number(session.joined || 0) < Number(session.maxPlayers || 6)
  );
}

function getFirstOpenSessionForStory(storyIdValue) {
  return getOpenSessionsForStory(storyIdValue)[0] || null;
}

function renderJoinSession(story) {
  const container = document.getElementById("joinSessionStatus");
  if (!container || !story) return;

  const userId = getCurrentUserId();
  const isOwner = isCurrentUserStory(story);
  const openSessions = getOpenSessionsForStory(story.id);
  const ownerSession = openSessions.find(session =>
    (session.createdBy && storyIdsMatch(session.createdBy, userId)) ||
    (session.storyAuthorId && storyIdsMatch(session.storyAuthorId, userId))
  );
  const joinedParticipant = !isOwner ? supabaseSessionParticipantsCache.find(participant =>
    storyIdsMatch(participant.story_id, story.id) &&
    storyIdsMatch(participant.user_id, userId) &&
    participant.status === "joined"
  ) : null;
  const joinedSession = joinedParticipant
    ? supabasePublicSessionsCache.find(session => storyIdsMatch(session.id, joinedParticipant.session_id))
    : null;

  const createButton = document.getElementById("createPublicSessionButton");
  const joinButton = document.getElementById("joinPublicSessionButton");
  const cancelButton = document.getElementById("cancelJoinSessionButton");
  const intro = document.getElementById("publicSessionIntro");

  const isMasterStory = String(story.type || "").toLowerCase().includes("master");
  const canCreatePublicSession = isOwner || !isMasterStory;

  if (intro) {
    intro.textContent = isOwner
      ? t("publicSessionIntroOwner", "Crea una sessione pubblica scegliendo uno slot libero: i giocatori potranno unirsi da Sessioni aperte.")
      : isMasterStory
        ? t("publicSessionIntroPlayer", "Puoi unirti a una sessione pubblica già creata dal Master, oppure richiedere una prenotazione privata.")
        : t("publicSessionIntroSelfPlay", "Per le storie self-play puoi organizzarti liberamente con il tuo gruppo.");
  }

  if (cancelButton) cancelButton.hidden = !joinedSession;
  if (createButton) {
    createButton.hidden = Boolean(joinedSession || ownerSession || !canCreatePublicSession);
    createButton.disabled = Boolean(!selectedBookingSlot);
    createButton.textContent = selectedBookingSlot ? t("publicSessionCreate", "Crea sessione pubblica") : t("publicSessionSelectSlot", "Seleziona uno slot");
  }
  if (joinButton) {
    joinButton.hidden = Boolean(isOwner || joinedSession) || !openSessions.length;
    joinButton.disabled = Boolean(isOwner || joinedSession) || !openSessions.length;
  }

  if (ownerSession) {
    container.innerHTML = `
      <div class="join-session-owner-confirmation">
        <div class="join-session-check">✓</div>
        <div>
          <strong>${t("publicSessionOwnerCreated", "Hai creato questa sessione pubblica")}</strong>
          <p>${tf("publicSessionPlayersJoined", { joined: ownerSession.joined, max: ownerSession.maxPlayers }, `${ownerSession.joined} / ${ownerSession.maxPlayers} giocatori iscritti`)}</p>
          <p>${formatBookingDateTime(ownerSession.sessionDate, ownerSession.startTime, ownerSession.endTime)}</p>
          <p class="muted-small">${t("publicSessionMasterNotCounted", "Tu sei il Master: non vieni contato tra i giocatori.")}</p>
        </div>
      </div>
    `;
    return;
  }

  if (joinedSession) {
    container.innerHTML = `
      <div class="join-session-confirmation">
        <div class="join-session-check">✓</div>
        <div>
          <strong>${t("publicSessionYouJoined", "Ti sei unito a questa sessione pubblica")}</strong>
          <p>${tf("publicSessionPlayersJoined", { joined: joinedSession.joined, max: joinedSession.maxPlayers }, `${joinedSession.joined} / ${joinedSession.maxPlayers} giocatori iscritti`)}</p>
          <p>${formatBookingDateTime(joinedSession.sessionDate, joinedSession.startTime, joinedSession.endTime)}</p>
        </div>
      </div>
    `;
    return;
  }

  if (!openSessions.length) {
    const emptyText = isOwner
      ? t("publicSessionEmptyOwner", "Scegli uno slot libero e crea una sessione pubblica: i giocatori potranno unirsi dalla pagina “Sessioni aperte”.")
      : isMasterStory
        ? t("publicSessionEmptyPlayer", "Al momento non ci sono sessioni pubbliche aperte. Solo il Master può crearne una per questa storia.")
        : t("publicSessionIntroSelfPlay", "Per le storie self-play puoi organizzarti liberamente con il tuo gruppo.");

    container.innerHTML = `
      <div class="join-session-status-box">
        <p><strong>${t("publicSessionNoneOpen", "Nessuna sessione pubblica aperta per questa storia.")}</strong></p>
        <p>${emptyText}</p>
      </div>
    `;
    return;
  }

  const session = openSessions[0];
  const ready = Number(session.joined) >= Number(session.minPlayers);

  container.innerHTML = `
    <div class="join-session-status-box">
      <p><strong>${session.joined} / ${session.maxPlayers}</strong> ${t("publicSessionPlayers", "giocatori iscritti")}</p>
      <p>${formatBookingDateTime(session.sessionDate, session.startTime, session.endTime)}</p>
      <p><strong>${ready ? t("sessionStatusReady", "Sessione pronta a partire") : t("sessionStatusWaitingMore", "In attesa di altri giocatori")}</strong></p>
    </div>
  `;
}

function getOpenSessionStories() {
  return getAllStories().filter(story => story.type === "Con Master");
}

function getVisibleOpenSessions() {
  const isVisibleForCurrentUser = session => {
    const alreadyJoined = hasJoinedOpenSession(session.id);
    const inactive = ["cancelled", "closed", "annullata", "chiusa"].includes(String(session.status || "").toLowerCase());

    if (inactive) return false;
    if (alreadyJoined) return true;

    return session.status === "open" &&
      Number(session.joined || 0) < Number(session.maxPlayers || 6);
  };

  if (supabasePublicSessionsLoaded) {
    return supabasePublicSessionsCache.filter(isVisibleForCurrentUser);
  }

  return Object.values(JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}"))
    .filter(isVisibleForCurrentUser);
}

function renderOpenSessions() {
  const containers = document.querySelectorAll("[data-open-sessions-list]");
  const count = document.getElementById("openSessionsCount");
  if (!containers.length) return;

  const visibleSessions = getVisibleOpenSessions();

  if (count) {
    count.textContent = visibleSessions.length === 1
      ? t("sessionsCountOne", "1 sessione aperta")
      : t("sessionsCountMany", "{count} sessioni aperte").replace("{count}", visibleSessions.length);
  }

  function buildHtml(sessions) {
    return sessions.length
      ? sessions.map(session => {
          const story = getAllStories().find(item => storyIdsMatch(item.id, session.storyId));
          if (!story) return "";

          const genreClass = getGenreClass(story.genre);
          const ready = Number(session.joined) >= Number(session.minPlayers);
          const isJoined = hasJoinedOpenSession(session.id);
          const isOwner = isCurrentUserStory(story);
          const status = isJoined
            ? t("sessionStatusJoined", "Ti sei unito")
            : (ready ? t("sessionStatusReady", "Pronta a partire") : t("sessionStatusWaiting", "In attesa di giocatori"));
          const coverStyle = story.cover ? `style="background-image:url('${story.cover}')"` : "";
          const storyArg = storyJsArg(story.id);
          const sessionArg = storyJsArg(session.id);

          return `
            <div class="card open-session-card ${isJoined ? "open-session-card-joined" : ""}" data-open-session-card="${escapeHtmlAttribute(session.id)}">
              <div class="join-success-overlay">
                <div class="join-success-icon">✓</div>
                <strong>${t("sessionStatusJoined", "Ti sei unito")}</strong>
                <span>${t("sessionOpeningStory", "Ora apriamo la storia")}</span>
              </div>
              <div class="open-session-cover ${genreClass}" ${coverStyle}></div>
              <div class="open-session-content">
                <span class="tag ${genreClass}">${escapeHtml(story.genre)}</span>
                <h3>${escapeHtml(story.title)}</h3>
                <p>${escapeHtml(story.desc || "")}</p>
                <div class="open-session-meta">
                  <span><strong>${t("storyAuthor", "Autore")}:</strong> ${escapeHtml(story.master || "Master Lorecast")}</span>
                  <span><strong>${t("sessionWhen", "Quando")}:</strong> ${formatBookingDateTime(session.sessionDate, session.startTime, session.endTime)}</span>
                  <span><strong>${t("sessionSeats", "Posti")}:</strong> ${session.joined} / ${session.maxPlayers}</span>
                  <span><strong>${t("sessionStatusLabel", "Stato")}:</strong> ${status}</span>
                </div>
                ${isJoined ? `<div class="joined-inline-banner"><span>✓</span> ${t("sessionAlreadyJoined", "Sei già iscritto a questa sessione.")}</div>` : ""}
                <div class="open-session-actions">
                  <button class="light" onclick='openStory(${storyArg})'>${t("commonViewStory", "Vedi storia")}</button>
                  ${isOwner
                    ? `<button class="primary" onclick="go('area-master')">${t("commonManage", "Gestisci")}</button>`
                    : isJoined
                      ? `<button class="light" onclick='openStory(${storyArg})'>${t("sessionOpen", "Apri sessione")}</button>`
                      : `<button class="primary" onclick='joinOpenSession(${sessionArg})'>${t("sessionJoin", "Unisciti")}</button>`}
                </div>
              </div>
            </div>
          `;
        }).join("")
      : "<p>Non ci sono sessioni aperte al momento.</p>";
  }

  containers.forEach(container => {
    container.innerHTML = buildHtml(visibleSessions);
  });
}

async function createPublicSession() {
  if (!currentStory) return;

  const profile = getUserProfile();
  if (!profile.email) {
    showToast("Devi accedere per creare una sessione pubblica.", "warning");
    go("login");
    return;
  }

  const isOwner = isCurrentUserStory(currentStory);
  const isMasterStory = String(currentStory.type || "").toLowerCase().includes("master");

  if (isMasterStory && !isOwner) {
    showToast("Solo il Master può aprire una sessione pubblica per questa storia. Puoi unirti a una sessione già aperta oppure richiedere una prenotazione privata.", "warning");
    return;
  }

  if (!selectedBookingSlot) {
    showToast("Scegli prima uno slot libero dal calendario.", "warning");
    return;
  }

  await loadSupabaseBookings();
  await loadSupabasePublicSessions();

  if (hasBookingOverlap(getCurrentStoryMasterId(currentStory), selectedBookingSlot.date, selectedBookingSlot.startTime, selectedBookingSlot.endTime) || hasPublicSessionOverlap(currentStory, selectedBookingSlot.date, selectedBookingSlot.startTime, selectedBookingSlot.endTime)) {
    showToast("Questo slot è già occupato. Scegli un altro orario.", "warning");
    renderBookingCalendar(currentStory);
    return;
  }

  const { minPlayers, maxPlayers } = parseStoryPlayersRange(currentStory);
  const initialPlayers = isOwner ? 0 : Math.min(maxPlayers, parsePlayersValue(document.getElementById("bookingPlayers")?.value, 1));
  const newStatus = initialPlayers >= maxPlayers ? "complete" : "open";

  if ((typeof supabaseClient !== "undefined") && getCurrentUserId()) {
    const { data: sessionRow, error: sessionError } = await supabaseClient
      .from("public_sessions")
      .insert({
        story_id: storyId(currentStory.id),
        story_title: currentStory.title,
        story_author_id: currentStory.source === "supabase" ? currentStory.author_id : null,
        min_players: minPlayers,
        max_players: maxPlayers,
        current_players: initialPlayers,
        status: newStatus,
        session_date: selectedBookingSlot.date,
        start_time: selectedBookingSlot.startTime,
        end_time: selectedBookingSlot.endTime,
        duration_minutes: selectedBookingSlot.durationMinutes || (timeToMinutes(selectedBookingSlot.endTime) - timeToMinutes(selectedBookingSlot.startTime)),
        created_group_size: initialPlayers,
        created_by: getCurrentUserId()
      })
      .select()
      .single();

    if (sessionError) {
      showToast("Errore creazione sessione pubblica: " + sessionError.message, "error");
      return;
    }

    const session = normalizePublicSession(sessionRow);
    supabasePublicSessionsCache = [session, ...supabasePublicSessionsCache.filter(item => !storyIdsMatch(item.id, session.id))];
    supabasePublicSessionsLoaded = true;

    if (!isOwner && initialPlayers > 0) {
      const { data: participant, error: participantError } = await supabaseClient
        .from("session_participants")
        .insert({
          session_id: session.id,
          story_id: storyId(currentStory.id),
          user_id: getCurrentUserId(),
          status: "joined",
          seats: initialPlayers
        })
        .select()
        .single();

      if (participantError) {
        showToast("Sessione creata, ma errore iscrizione: " + participantError.message, "warning");
      } else {
        supabaseSessionParticipantsCache = [normalizeSessionParticipant(participant), ...supabaseSessionParticipantsCache];
        supabaseSessionParticipantsLoaded = true;
      }
    }
  } else {
    const sessions = JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
    const localId = String(Date.now());
    sessions[localId] = {
      id: localId,
      storyId: storyId(currentStory.id),
      joined: initialPlayers,
      minPlayers,
      maxPlayers,
      status: newStatus,
      sessionDate: selectedBookingSlot.date,
      startTime: selectedBookingSlot.startTime,
      endTime: selectedBookingSlot.endTime,
      createdBy: getCurrentUserId()
    };
    localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));

    if (!isOwner) {
      const joined = getJoinedOpenSessions();
      joined.push(localId);
      saveJoinedOpenSessions(Array.from(new Set(joined.map(String))));
    }
  }

  addNotification(`Hai creato una sessione pubblica per "${currentStory.title}".`, "success", { storyId: currentStory.id, page: "sessioni" });

  const storyOwnerId = getCurrentStoryMasterId(currentStory);
  if (storyOwnerId && !storyIdsMatch(storyOwnerId, getCurrentUserId())) {
    await createNotificationForUser(
      storyOwnerId,
      `È stata creata una sessione pubblica per "${currentStory.title}".`,
      "info",
      { storyId: currentStory.id, page: "area-master" }
    );
  }

  showToast(isOwner ? "Sessione pubblica creata. I giocatori potranno unirsi da Sessioni aperte." : "Sessione pubblica creata. Ora altri giocatori potranno unirsi.", "success");
  selectedBookingSlot = null;
  await loadSupabasePublicSessions();
  await loadSupabaseSessionParticipants();
  renderBookingCalendar(currentStory);
  updateSelectedSlotLabel();
  renderJoinSession(currentStory);
  renderOpenSessions();
  renderMasterPublicSessions();
}

async function joinOpenSession(targetSessionId) {
  const profile = getUserProfile();

  if (!profile.email) {
    showToast("Devi accedere per unirti a una sessione.", "warning");
    go("login");
    return;
  }

  await loadSupabasePublicSessions();

  const session = supabasePublicSessionsCache.find(item => storyIdsMatch(item.id, targetSessionId))
    || Object.values(JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}")).find(item => storyIdsMatch(item.id, targetSessionId));

  if (!session) {
    showToast("Sessione non disponibile.", "warning");
    renderOpenSessions();
    return;
  }

  const story = getAllStories().find(item => storyIdsMatch(item.id, session.storyId));
  if (!story) return;

  if (isCurrentUserStory(story)) {
    showToast("Sei il Master di questa storia: puoi gestire la sessione dall’Area Master.", "warning");
    go("area-master");
    return;
  }

  if (hasJoinedOpenSession(session.id)) {
    showToast("Ti sei già unito a questa sessione.", "success");
    openStory(story.id);
    return;
  }

  if (Number(session.joined) >= Number(session.maxPlayers) || session.status !== "open") {
    showToast("Gruppo già completo.", "warning");
    renderOpenSessions();
    return;
  }

  if ((typeof supabaseClient !== "undefined") && getCurrentUserId() && session.source === "supabase") {
    const { data: participant, error: participantError } = await supabaseClient
      .from("session_participants")
      .upsert({
        session_id: session.id,
        story_id: storyId(story.id),
        user_id: getCurrentUserId(),
        status: "joined",
        seats: 1
      }, { onConflict: "session_id,user_id" })
      .select()
      .single();

    if (participantError) {
      showToast("Errore iscrizione sessione: " + participantError.message, "error");
      return;
    }

    const newCount = Math.min(Number(session.maxPlayers), Number(session.joined) + 1);
    const newStatus = newCount >= Number(session.maxPlayers) ? "complete" : "open";

    const { data: updatedSession, error: sessionError } = await supabaseClient
      .from("public_sessions")
      .update({ current_players: newCount, status: newStatus })
      .eq("id", session.id)
      .select()
      .single();

    if (sessionError) {
      showToast("Errore aggiornamento sessione: " + sessionError.message, "error");
      return;
    }

    const normalizedParticipant = normalizeSessionParticipant(participant);
    supabaseSessionParticipantsCache = [
      normalizedParticipant,
      ...supabaseSessionParticipantsCache.filter(item => !(storyIdsMatch(item.session_id, session.id) && storyIdsMatch(item.user_id, getCurrentUserId())))
    ].filter(Boolean);
    const normalizedSession = normalizePublicSession(updatedSession);
    supabasePublicSessionsCache = supabasePublicSessionsCache.map(item => storyIdsMatch(item.id, normalizedSession.id) ? normalizedSession : item);
  } else {
    const sessions = JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
    sessions[session.id].joined = Number(sessions[session.id].joined || 0) + 1;
    localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));
    const joined = getJoinedOpenSessions();
    joined.push(storyId(session.id));
    saveJoinedOpenSessions(Array.from(new Set(joined.map(String))));
  }

  addNotification(`Ti sei unito alla sessione pubblica: ${story.title}`, "success", { storyId: story.id, page: "profilo" });

  const storyOwnerId = getCurrentStoryMasterId(story);
  if (storyOwnerId && !storyIdsMatch(storyOwnerId, getCurrentUserId())) {
    await createNotificationForUser(
      storyOwnerId,
      `Un giocatore si è unito alla sessione pubblica di "${story.title}".`,
      "info",
      { storyId: story.id, page: "area-master" }
    );
  }

  const card = document.querySelector(`[data-open-session-card="${session.id}"]`);

  if (card) {
    card.classList.add("join-success");
    card.querySelectorAll("button").forEach(button => {
      button.disabled = true;
    });
  }

  showToast(t("publicSessionJoinedToast", "Ti sei unito a questa sessione."), "success");

  setTimeout(() => {
    renderOpenSessions();
    openStory(story.id);
  }, card ? 950 : 0);
}

function joinPublicSession() {
  if (!currentStory) return;

  const session = getFirstOpenSessionForStory(currentStory.id);
  if (!session) {
    const isOwner = isCurrentUserStory(currentStory);
    const isMasterStory = String(currentStory.type || "").toLowerCase().includes("master");

    const message = isOwner
      ? "Non ci sono sessioni pubbliche aperte per questa storia. Scegli uno slot e creane una."
      : isMasterStory
        ? "Non ci sono sessioni pubbliche aperte per questa storia. Puoi richiedere una prenotazione privata scegliendo uno slot disponibile."
        : "Non ci sono sessioni pubbliche aperte per questa storia.";

    showToast(message, "warning");
    return;
  }

  joinOpenSession(session.id);
}

async function cancelOpenSession(storyIdValue) {
  const id = storyId(storyIdValue);
  const userId = getCurrentUserId();

  if ((typeof supabaseClient !== "undefined") && userId) {
    const participant = supabaseSessionParticipantsCache.find(item =>
      storyIdsMatch(item.story_id, id) &&
      storyIdsMatch(item.user_id, userId) &&
      item.status === "joined"
    );

    if (!participant) {
      showToast("Non risulti iscritto a questa sessione.", "warning");
      return;
    }

    const session = supabasePublicSessionsCache.find(item => storyIdsMatch(item.id, participant.session_id));
    const seats = Number(participant.seats || 1);

    const { error: participantError } = await supabaseClient
      .from("session_participants")
      .update({ status: "cancelled" })
      .eq("id", participant.id);

    if (participantError) {
      showToast("Errore annullamento partecipazione: " + participantError.message, "error");
      return;
    }

    if (session) {
      const newCount = Math.max(0, Number(session.joined || 0) - seats);
      const { data, error } = await supabaseClient
        .from("public_sessions")
        .update({ current_players: newCount, status: "open" })
        .eq("id", session.id)
        .select()
        .single();

      if (error) {
        showToast("Errore aggiornamento sessione: " + error.message, "error");
        return;
      }

      supabasePublicSessionsCache = supabasePublicSessionsCache.map(item => storyIdsMatch(item.id, session.id) ? normalizePublicSession(data) : item);
    }

    supabaseSessionParticipantsCache = supabaseSessionParticipantsCache.filter(item => !storyIdsMatch(item.id, participant.id));
  } else {
    const sessions = JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
    const joinedId = getJoinedOpenSessions().find(sessionId => {
      const session = sessions[sessionId];
      return session && storyIdsMatch(session.storyId, id);
    });

    if (!joinedId) {
      showToast("Non risulti iscritto a questa sessione.", "warning");
      return;
    }

    if (sessions[joinedId]) {
      sessions[joinedId].joined = Math.max(0, Number(sessions[joinedId].joined || 0) - 1);
      localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));
    }

    const updatedJoinedIds = getJoinedOpenSessions().filter(sessionId => storyId(sessionId) !== storyId(joinedId));
    saveJoinedOpenSessions(updatedJoinedIds);
  }

  const story = getAllStories().find(item => storyIdsMatch(item.id, id));
  addNotification(`Hai annullato la partecipazione alla sessione${story ? `: ${story.title}` : ""}.`, "info", story ? { storyId: story.id } : {});

  showToast("Partecipazione annullata.", "success");

  if (story && currentStory && storyIdsMatch(currentStory.id, id)) {
    renderJoinSession(story);
    renderBookingCalendar(story);
  }

  renderOpenSessions();
  renderUserProfile();
  renderMyStories();
}

/* CREATE STORY */

function addMaterialField(existingMaterial = null) {
  const container = document.getElementById("materialsBuilder");
  if (!container) return;

  const index = container.children.length + 1;
  const material = existingMaterial || {};

  const block = document.createElement("div");
  block.className = "card material-field";
  block.dataset.existingMaterial = JSON.stringify({
    url: material.url || "",
    file_name: material.file_name || "",
    file_type: material.file_type || "",
    file_size: material.file_size || "",
    file_path: material.file_path || ""
  });

  const typeOptions = ["Indizio", "Mappa", "Scheda personaggio", "PDF", "Audio", "Immagine", "Altro"]
    .map(option => `<option ${material.type === option ? "selected" : ""}>${option}</option>`)
    .join("");

  const visibilityOptions = ["Visibile subito", "Dopo acquisto", "Durante sessione", "Solo Master"]
    .map(option => `<option ${material.visibility === option ? "selected" : ""}>${option}</option>`)
    .join("");

  block.innerHTML = `
    <h3>Materiale ${index}</h3>

    <input class="material-name" placeholder="Nome materiale, es. Mappa del castello" value="${escapeHtmlAttribute(material.name || "")}" />

    <select class="material-type">
      <option value="">Tipo materiale</option>
      ${typeOptions}
    </select>

    <select class="material-visibility">
      <option value="">Visibilità materiale</option>
      ${visibilityOptions}
    </select>

    <textarea class="material-notes" placeholder="Note sul materiale">${escapeHtml(material.notes || "")}</textarea>

    ${material.url ? `
      <p class="existing-material-note">File attuale: <a href="${material.url}" target="_blank" rel="noopener">${escapeHtml(material.file_name || "Apri materiale")}</a></p>
    ` : ""}

    <label>File materiale</label>
    <input class="material-file" type="file" accept=".pdf,image/jpeg,image/png,image/webp,audio/*,video/*,.txt,.doc,.docx" />
    <p class="form-help">Facoltativo. Se scegli un nuovo file, sostituirà quello attuale per questo materiale.</p>

    <button class="light" type="button" onclick="this.parentElement.remove()">Rimuovi materiale</button>
  `;

  container.appendChild(block);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

function getCreatedMaterials() {
  const materialBlocks = document.querySelectorAll(".material-field");

  return Array.from(materialBlocks)
    .map((block, index) => {
      let existing = {};
      try {
        existing = JSON.parse(block.dataset.existingMaterial || "{}");
      } catch (_) {
        existing = {};
      }

      return {
        name: block.querySelector(".material-name")?.value.trim() || "",
        type: block.querySelector(".material-type")?.value || "Altro",
        visibility: block.querySelector(".material-visibility")?.value || "Dopo acquisto",
        notes: block.querySelector(".material-notes")?.value.trim() || "",
        file: block.querySelector(".material-file")?.files?.[0] || null,
        order: index + 1,
        url: existing.url || "",
        file_name: existing.file_name || "",
        file_type: existing.file_type || "",
        file_size: existing.file_size || "",
        file_path: existing.file_path || ""
      };
    })
    .filter(material => material.name || material.file || material.url);
}

function sanitizeStorageName(value) {
  return String(value || "file")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "file";
}

function getFileExtension(file) {
  const name = file?.name || "";
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "bin";
}

function ensureMaxFileSize(file, maxMb, label) {
  if (!file) return true;

  if (file.size > maxMb * 1024 * 1024) {
    showToast(`${label} deve pesare massimo ${maxMb} MB.`, "warning");
    return false;
  }

  return true;
}

async function uploadStoryCover(userId, storyDraftId) {
  const fileInput = document.getElementById("newStoryCoverFile");
  const file = fileInput?.files?.[0];

  if (!file) return "";

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    showToast("La copertina deve essere JPG, PNG o WebP.", "warning");
    return null;
  }

  if (!ensureMaxFileSize(file, 5, "La copertina")) return null;

  const extension = getFileExtension(file);
  const filePath = `${userId}/${storyDraftId}/cover-${Date.now()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from("story-covers")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type
    });

  if (error) {
    showToast("Errore upload copertina: " + error.message, "error");
    return null;
  }

  const { data } = supabaseClient.storage
    .from("story-covers")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

async function uploadStoryMaterials(userId, storyDraftId, materials) {
  const uploadedMaterials = [];

  for (const material of materials) {
    const materialData = { ...material };
    const file = material.file;
    delete materialData.file;

    if (!materialData.name && file) {
      materialData.name = file.name.replace(/\.[^/.]+$/, "");
    }

    if (file) {
      if (!ensureMaxFileSize(file, 25, `Il materiale ${materialData.name || file.name}`)) {
        return null;
      }

      const safeName = sanitizeStorageName(file.name);
      const filePath = `${userId}/${storyDraftId}/materials/${Date.now()}-${material.order}-${safeName}`;

      const { error } = await supabaseClient.storage
        .from("story-materials")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });

      if (error) {
        showToast("Errore upload materiale: " + error.message, "error");
        return null;
      }

      const { data } = supabaseClient.storage
        .from("story-materials")
        .getPublicUrl(filePath);

      materialData.file_name = file.name;
      materialData.file_type = file.type || "File";
      materialData.file_size = file.size;
      materialData.file_path = filePath;
      materialData.url = data.publicUrl;
    }

    uploadedMaterials.push(materialData);
  }

  return uploadedMaterials;
}

async function createStory() {
  clearFieldErrors();

  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData.user) {
    showToast("Devi accedere per creare una storia.", "warning");
    go("login");
    return;
  }

  const title = document.getElementById("newStoryTitle")?.value.trim() || "";
  const genre = document.getElementById("newStoryGenre")?.value || "";
  const type = document.getElementById("newStoryType")?.value || "";
  const priceMode = document.getElementById("newStoryPriceMode")?.value || "";
  const storyLanguage = document.getElementById("newStoryLanguage")?.value || "";
  const priceValue = document.getElementById("newStoryPrice")?.value || "";
  const duration = document.getElementById("newStoryDuration")?.value.trim() || "";
  const players = document.getElementById("newStoryPlayers")?.value.trim() || "";
  const desc = document.getElementById("newStoryDesc")?.value.trim() || "";
  const long = document.getElementById("newStoryLong")?.value.trim() || "";
  const coverUrlInput = document.getElementById("newStoryCover")?.value.trim() || "";
  const trailer = document.getElementById("newStoryTrailer")?.value.trim() || "";
  const rawMaterials = getCreatedMaterials();

  const errors = [];

  if (!title) errors.push(["newStoryTitle", "Inserisci il titolo della storia."]);
  if (!genre) errors.push(["newStoryGenre", "Seleziona un genere."]);
  if (!type) errors.push(["newStoryType", "Seleziona il tipo di storia."]);
  if (!priceMode) errors.push(["newStoryPriceMode", "Scegli se la storia è gratuita o a pagamento."]);
  if (!storyLanguage) errors.push(["newStoryLanguage", "Seleziona la lingua della storia."]);

  if (priceMode === "paid" && (!priceValue || Number(priceValue) <= 0)) {
    errors.push(["newStoryPrice", "Inserisci un prezzo valido."]);
  }

  if (!duration) errors.push(["newStoryDuration", "Inserisci la durata."]);
  if (!players) errors.push(["newStoryPlayers", "Inserisci il numero di giocatori."]);
  if (!desc) errors.push(["newStoryDesc", "Inserisci una descrizione breve."]);

  if (errors.length) {
    showFieldErrors(errors);
    showToast("Controlla i campi obbligatori evidenziati.", "warning");
    return;
  }

  const profile = getUserProfile();
  const isEditing = Boolean(editingStoryId);
  const existingStory = isEditing
    ? getAllStories().find(story => storyIdsMatch(story.id, editingStoryId))
    : null;

  if (isEditing && !isCurrentUserStory(existingStory)) {
    showToast("Puoi modificare solo le storie create da te.", "warning");
    return;
  }

  const storyDraftId = isEditing ? storyId(editingStoryId) : `${Date.now()}-${sanitizeStorageName(title)}`;

  showToast(isEditing ? "Aggiornamento storia in corso..." : "Caricamento contenuti in corso...", "success");

  const uploadedCoverUrl = await uploadStoryCover(authData.user.id, storyDraftId);
  if (uploadedCoverUrl === null) return;

  const materials = await uploadStoryMaterials(authData.user.id, storyDraftId, rawMaterials);
  if (materials === null) return;

  const payload = {
    title,
    genre,
    type,
    story_language: storyLanguage,
    price: priceMode === "free" ? 0 : Number(priceValue),
    is_free: priceMode === "free",
    duration,
    duration_minutes: getStoryDurationMinutes({ duration }),
    players,
    level: existingStory?.level || "Intermedio",
    mode: existingStory?.mode || "Online",
    master: profile.name || authData.user.user_metadata?.name || "Master Lorecast",
    description: desc,
    long_description: long || desc,
    cover_url: uploadedCoverUrl || coverUrlInput || existingStory?.cover || "",
    trailer_url: trailer,
    materials,
    status: "published"
  };

  let data = null;
  let error = null;

  if (isEditing) {
    const result = await supabaseClient
      .from("stories")
      .update(payload)
      .eq("id", editingStoryId)
      .eq("author_id", authData.user.id)
      .select()
      .single();

    data = result.data;
    error = result.error;
  } else {
    const result = await supabaseClient
      .from("stories")
      .insert({
        ...payload,
        author_id: authData.user.id
      })
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    showToast((isEditing ? "Errore aggiornamento storia: " : "Errore pubblicazione storia: ") + error.message, "error");
    return;
  }

  const savedStory = normalizeSupabaseStory(data);
  supabaseStoriesCache = [
    savedStory,
    ...supabaseStoriesCache.filter(story => !storyIdsMatch(story.id, savedStory.id))
  ];

  showToast(isEditing ? "Storia aggiornata correttamente." : "Storia pubblicata correttamente.", "success");
  addNotification(
    isEditing ? `Hai aggiornato la storia: "${title}".` : `Hai pubblicato una nuova storia: "${title}".`,
    "success",
    { storyId: savedStory.id }
  );

  clearStoryForm();
  editingStoryId = null;
  updateCreateStoryMode();
  togglePriceField();
  renderDashboardStats();
  renderFeatured();
  renderCatalog();
  renderUserProfile();

  openStory(savedStory.id);
}

function clearStoryForm() {
  document.querySelectorAll("#crea-storia input, #crea-storia textarea, #crea-storia select")
    .forEach(field => {
      field.value = "";
    });

  const languageField = document.getElementById("newStoryLanguage");
  if (languageField) languageField.value = getDefaultStoryLanguage();

  const materialsBuilder = document.getElementById("materialsBuilder");
  if (materialsBuilder) materialsBuilder.innerHTML = "";
}

function updateCreateStoryMode() {
  const title = document.getElementById("createStoryPageTitle");
  const intro = document.getElementById("createStoryPageIntro");
  const button = document.getElementById("createStorySubmitButton");
  const cancelButton = document.getElementById("cancelStoryEditButton");

  const isEditing = Boolean(editingStoryId);

  if (title) title.textContent = isEditing ? "Modifica storia" : "Crea nuova storia";
  if (intro) {
    intro.textContent = isEditing
      ? "Aggiorna informazioni, copertina e materiali della tua storia."
      : "Pubblica una storia self-play o una storia con Master. I materiali possono essere visibili subito, dopo acquisto, durante la sessione o solo al Master.";
  }
  if (button) button.textContent = isEditing ? "Salva modifiche" : "Pubblica storia";
  if (cancelButton) cancelButton.hidden = !isEditing;
}

function cancelStoryEdit() {
  editingStoryId = null;
  clearStoryForm();
  updateCreateStoryMode();
  togglePriceField();
  showToast("Modifica annullata.", "success");
}

function openEditCurrentStory(options = {}) {
  if (!currentStory || !isCurrentUserStory(currentStory)) {
    showToast("Puoi modificare solo le storie create da te.", "warning");
    return;
  }

  editingStoryId = currentStory.id;
  populateStoryFormForEdit(currentStory);
  go("crea-storia");
  updateCreateStoryMode();
  togglePriceField();

  if (options.focus === "materials") {
    setTimeout(() => {
      document.getElementById("materialsBuilder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
}

function populateStoryFormForEdit(story) {
  clearFieldErrors();
  clearStoryForm();

  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  };

  setValue("newStoryTitle", story.title);
  setValue("newStoryGenre", story.genre);
  setValue("newStoryType", story.type);
  setValue("newStoryPriceMode", story.isFree || Number(story.price) === 0 ? "free" : "paid");
  setValue("newStoryLanguage", getStoryLanguageCode(story));
  setValue("newStoryPrice", story.isFree ? "" : story.price);
  setValue("newStoryDuration", story.duration);
  setValue("newStoryPlayers", story.players);
  setValue("newStoryDesc", story.desc);
  setValue("newStoryLong", story.long);
  setValue("newStoryCover", story.cover);
  setValue("newStoryTrailer", story.trailer);

  const materials = story.materials || [];
  materials.forEach(material => addMaterialField(material));
}

async function cleanupStoryRelatedData(storyIdValue) {
  if (!storyIdValue || typeof supabaseClient === "undefined") return;

  const id = storyId(storyIdValue);

  const { data: sessions } = await supabaseClient
    .from("public_sessions")
    .select("id")
    .eq("story_id", id);

  const sessionIds = (sessions || []).map(session => session.id);

  if (sessionIds.length) {
    await supabaseClient
      .from("session_participants")
      .delete()
      .in("session_id", sessionIds);
  }

  await supabaseClient.from("public_sessions").delete().eq("story_id", id);
  await supabaseClient.from("master_availability").delete().eq("story_id", id);
  await supabaseClient.from("bookings").delete().eq("story_id", id);
  await supabaseClient.from("notifications").delete().eq("story_id", id);
}

async function deleteCurrentStory() {
  if (!currentStory || !isCurrentUserStory(currentStory)) {
    showToast("Puoi eliminare solo le storie create da te.", "warning");
    return;
  }

  const confirmed = window.confirm(`Vuoi eliminare definitivamente "${currentStory.title}"?`);
  if (!confirmed) return;

  const storyToDelete = currentStory;
  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData.user) {
    showToast("Sessione non valida. Accedi di nuovo.", "warning");
    return;
  }

  await cleanupStoryRelatedData(storyToDelete.id);

  const { error } = await supabaseClient
    .from("stories")
    .delete()
    .eq("id", storyToDelete.id)
    .eq("author_id", authData.user.id);

  if (error) {
    showToast("Errore eliminazione storia: " + error.message, "error");
    return;
  }

  supabaseStoriesCache = supabaseStoriesCache.filter(story => !storyIdsMatch(story.id, storyToDelete.id));
  currentStory = null;

  showToast("Storia eliminata.", "success");
  addNotification(`Hai eliminato la storia: "${storyToDelete.title}".`, "info");

  renderCatalog();
  renderFeatured();
  renderUserProfile();
  go("catalogo");
}

function renderDashboardStats() {
  const storiesCount = document.getElementById("dashboardStoriesCount");
  if (!storiesCount) return;

  const userId = getCurrentUserId();
  const totalStories = getAllStories().filter(story => story.source === "supabase" && story.author_id && storyIdsMatch(story.author_id, userId)).length;

  storiesCount.textContent = totalStories === 1
    ? "1 storia attiva"
    : totalStories + " storie attive";
}

function getMasterOwnedStoryIds() {
  const userId = getCurrentUserId();
  return getAllStories()
    .filter(story => story.source === "supabase" && story.author_id && storyIdsMatch(story.author_id, userId))
    .map(story => storyId(story.id));
}

function getParticipantsForSession(sessionIdValue) {
  const id = storyId(sessionIdValue);
  return supabaseSessionParticipantsCache.filter(participant =>
    storyIdsMatch(participant.session_id, id) && participant.status === "joined"
  );
}

function renderMasterPublicSessions() {
  const container = document.getElementById("masterPublicSessions");
  const count = document.getElementById("masterPublicSessionsCount");
  if (!container) return;

  const userId = getCurrentUserId();
  const ownedStoryIds = new Set(getMasterOwnedStoryIds());

  const sessions = supabasePublicSessionsCache.filter(session => {
    if (session.status === "cancelled") return false;

    return (
      (session.storyAuthorId && storyIdsMatch(session.storyAuthorId, userId)) ||
      (session.createdBy && storyIdsMatch(session.createdBy, userId)) ||
      ownedStoryIds.has(storyId(session.storyId))
    );
  });

  if (count) {
    count.textContent = sessions.length === 1
      ? t("masterOnePublicSession", "1 sessione pubblica")
      : tf("masterPublicSessionsCount", { count: sessions.length }, `${sessions.length} sessioni pubbliche`);
  }

  container.innerHTML = sessions.length
    ? sessions.map(session => {
        const story = getAllStories().find(item => storyIdsMatch(item.id, session.storyId));
        const participants = getParticipantsForSession(session.id);
        const ready = Number(session.joined) >= Number(session.minPlayers);
        const statusLabel = session.status === "cancelled"
          ? t("sessionStatusCancelled", "Annullata")
          : session.status === "closed"
            ? t("sessionStatusClosed", "Chiusa")
            : session.status === "complete"
              ? t("sessionStatusComplete", "Completa")
              : ready
                ? t("sessionStatusReadyShort", "Pronta")
                : t("sessionStatusOpen", "Aperta");
        const statusClass = session.status === "cancelled" || session.status === "closed"
          ? "rejected"
          : ready
            ? "accepted"
            : "pending";
        const sessionArg = JSON.stringify(storyId(session.id));

        return `
          <div class="master-session-card">
            <div class="master-session-main">
              <div>
                <h3>${escapeHtml(story?.title || session.storyTitle || "Sessione Lorecast")}</h3>
                <p>${formatBookingDateTime(session.sessionDate, session.startTime, session.endTime)}</p>
              </div>
              <span class="status ${statusClass}">${statusLabel}</span>
            </div>

            <div class="master-session-meta">
              <span><strong>${t("sessionJoinedCount", "Iscritti")}:</strong> ${session.joined} / ${session.maxPlayers}</span>
              <span><strong>${t("sessionMinPlayers", "Minimo")}:</strong> ${session.minPlayers}</span>
              <span><strong>${t("sessionParticipants", "Partecipanti")}:</strong> ${participants.length}</span>
            </div>

            <details class="session-participants-details">
              <summary>${t("sessionViewParticipants", "Vedi partecipanti")}</summary>
              ${participants.length
                ? `<div class="session-participants-list">
                    ${participants.map((participant, index) => `
                      <div class="session-participant-row">
                        <span>${escapeHtml(getUserDisplayName(participant.user_id, `Giocatore ${index + 1}`))}</span>
                        <small>${tf(Number(participant.seats || 1) > 1 ? "sessionSeatsPlural" : "sessionSeatsSingular", { count: Number(participant.seats || 1) }, `${Number(participant.seats || 1)} posto${Number(participant.seats || 1) > 1 ? "i" : ""}`)}</small>
                      </div>
                    `).join("")}
                  </div>`
                : `<p class="muted-small">${t("sessionNoPlayersYet", "Non ci sono ancora giocatori iscritti.")}</p>`}
            </details>

            ${["open", "complete"].includes(session.status) ? `
              <div class="master-session-actions">
                <button class="light" type="button" onclick='closePublicSession(${sessionArg})'>${t("sessionClose", "Chiudi sessione")}</button>
                <button class="danger-light" type="button" onclick='cancelPublicSessionAsMaster(${sessionArg})'>${t("sessionCancel", "Annulla sessione")}</button>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")
    : `<p>${t("masterNoPublicSessions", "Non hai ancora sessioni pubbliche create.")}</p>`;
}

async function updatePublicSessionStatus(sessionIdValue, status) {
  const id = storyId(sessionIdValue);

  if ((typeof supabaseClient !== "undefined")) {
    const { data, error } = await supabaseClient
      .from("public_sessions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      showToast("Errore aggiornamento sessione: " + error.message, "error");
      return null;
    }

    const updated = normalizePublicSession(data);
    supabasePublicSessionsCache = supabasePublicSessionsCache.map(session =>
      storyIdsMatch(session.id, updated.id) ? updated : session
    );
    return updated;
  }

  return null;
}

async function closePublicSession(sessionIdValue) {
  const updated = await updatePublicSessionStatus(sessionIdValue, "closed");
  if (!updated) return;

  showToast("Sessione chiusa.", "success");
  renderMasterPublicSessions();
  renderOpenSessions();
  if (currentStory) renderJoinSession(currentStory);
}

async function cancelPublicSessionAsMaster(sessionIdValue) {
  if (!confirm("Vuoi annullare questa sessione pubblica?")) return;

  const updated = await updatePublicSessionStatus(sessionIdValue, "cancelled");
  if (!updated) return;

  showToast("Sessione pubblica annullata.", "success");
  renderMasterPublicSessions();
  renderOpenSessions();
  if (currentStory) renderJoinSession(currentStory);
}


/* MASTER AVAILABILITY */

function getWeekdayLabel(weekday) {
  return ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"][Number(weekday)] || "Giorno";
}

let masterAvailabilityCalendarOffsetDays = 0;
let selectedMasterAvailabilitySlot = null;

function getMasterAvailabilitySelectedStory() {
  const storyIdValue = document.getElementById("availabilityStoryId")?.value || "";
  return getAllStories().find(story => storyIdsMatch(story.id, storyIdValue)) || null;
}

function renderMasterAvailability() {
  const container = document.getElementById("masterAvailabilityList");
  const storySelect = document.getElementById("availabilityStoryId");
  const countBadge = document.getElementById("masterAvailabilityCount");
  if (!container) return;

  const userId = getCurrentUserId();
  const ownedStories = getOwnedMasterStories();
  const currentValue = storySelect?.value || "";

  if (storySelect) {
    storySelect.innerHTML = `
      <option value="">Scegli una tua storia Con Master</option>
      ${ownedStories.map(story => `
        <option value="${escapeHtmlAttribute(storyId(story.id))}" ${storyIdsMatch(story.id, currentValue) ? "selected" : ""}>${escapeHtml(story.title)}</option>
      `).join("")}
    `;
  }

  if (!ownedStories.length) {
    container.innerHTML = `
      <div class="empty-state compact-empty">
        <p>Non hai ancora storie “Con Master”. Crea una storia per impostare disponibilità dedicate.</p>
        <button class="primary" type="button" onclick="goCreateStory()">Crea storia</button>
      </div>
    `;
    const picker = document.getElementById("masterAvailabilityPicker");
    if (picker) picker.innerHTML = "";
    if (countBadge) countBadge.textContent = "0 slot";
    return;
  }

  if (storySelect && !storySelect.value && ownedStories[0]) {
    storySelect.value = storyId(ownedStories[0].id);
  }

  renderMasterAvailabilityPicker();

  const ownedStoryIds = new Set(ownedStories.map(story => storyId(story.id)));

  const rules = getMasterAvailabilityRules()
    .filter(rule => {
      if (!userId) return false;
      if (rule.storyId) return ownedStoryIds.has(storyId(rule.storyId));
      return storyIdsMatch(rule.masterId, userId);
    })
    .sort((a, b) => {
      const titleA = getStoryTitleById(a.storyId || "");
      const titleB = getStoryTitleById(b.storyId || "");
      const dateA = a.availabilityDate || String(a.weekday || "");
      const dateB = b.availabilityDate || String(b.weekday || "");
      return titleA.localeCompare(titleB) || dateA.localeCompare(dateB) || a.startTime.localeCompare(b.startTime);
    });

  if (countBadge) countBadge.textContent = rules.length === 1 ? "1 slot" : `${rules.length} slot`;

  container.innerHTML = rules.length
    ? rules.map(rule => `
        <div class="availability-row">
          <div>
            <strong>${escapeHtml(getStoryTitleById(rule.storyId || ""))}</strong>
            <span>${rule.availabilityDate ? formatLongItalianDate(rule.availabilityDate) : getWeekdayLabel(rule.weekday)} · ${rule.startTime}–${rule.endTime}</span>
          </div>
          <div class="availability-row-actions">
            ${rule.availabilityDate ? `<button class="light" type="button" onclick='repeatMasterAvailability(${JSON.stringify(storyId(rule.id))})'>Ripeti 4 settimane</button>` : ""}
            <button class="light" type="button" onclick='removeMasterAvailability(${JSON.stringify(storyId(rule.id))})'>Rimuovi</button>
          </div>
        </div>
      `).join("")
    : "<p>Non hai ancora impostato disponibilità per le tue storie.</p>";
}

function getMasterAvailabilityCandidateSlots(story, day) {
  const duration = getStoryDurationMinutes(story);
  const dateIso = formatISODate(day);
  const starts = [];

  // Granularità oraria: se la storia dura 2 ore, cliccare 21:00 crea 21:00–23:00.
  for (let minutes = 9 * 60; minutes + duration <= 24 * 60; minutes += 60) {
    starts.push(minutes);
  }

  const existing = getAvailabilityForStory(story).filter(rule => rule.availabilityDate === dateIso);

  return starts.map(start => {
    const end = start + duration;
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(end);
    const active = existing.some(rule => rule.startTime === startTime && rule.endTime === endTime);
    return { date: dateIso, startTime, endTime, active };
  });
}

function renderMasterAvailabilityPicker() {
  const picker = document.getElementById("masterAvailabilityPicker");
  const selectedStory = getMasterAvailabilitySelectedStory();
  if (!picker) return;

  selectedMasterAvailabilitySlot = null;

  if (!selectedStory) {
    picker.innerHTML = `<div class="booking-calendar-empty"><p>Scegli una storia per impostare gli slot.</p></div>`;
    return;
  }

  const baseDate = addDays(new Date(), masterAvailabilityCalendarOffsetDays);
  const days = Array.from({ length: 3 }, (_, index) => addDays(baseDate, index));
  const slotsByDay = days.map(day => ({ day, slots: getMasterAvailabilityCandidateSlots(selectedStory, day) }));
  const allTimes = Array.from(new Set(slotsByDay.flatMap(item => item.slots.map(slot => slot.startTime)))).sort();

  const head = days.map(day => `
    <div class="booking-calendar-day">
      <strong>${formatItalianDate(day).split(" ")[0]}</strong>
      <span>${formatItalianDate(day).replace(formatItalianDate(day).split(" ")[0], "").trim()}</span>
    </div>
  `).join("");

  const rows = allTimes.map(time => {
    const cells = slotsByDay.map(({ slots }) => {
      const slot = slots.find(item => item.startTime === time);
      if (!slot) return `<div class="booking-slot-cell empty">-</div>`;
      if (slot.active) {
        return `<div class="booking-slot-cell occupied availability-already-set"><span>${slot.startTime}</span><small>${slot.endTime}</small></div>`;
      }
      return `
        <button type="button" class="booking-slot-cell available" onclick="addMasterAvailability('${slot.date}', '${slot.startTime}', '${slot.endTime}')">
          <span>${slot.startTime}</span>
          <small>${slot.endTime}</small>
        </button>
      `;
    }).join("");
    return `<div class="booking-calendar-row">${cells}</div>`;
  }).join("");

  picker.innerHTML = `
    <div class="master-availability-picker-note">
      <strong>${escapeHtml(selectedStory.title)}</strong>
      <span>Clicca l’orario di inizio: la fine viene calcolata automaticamente dalla durata della storia.</span>
    </div>
    <div class="booking-calendar-toolbar">
      <button class="calendar-nav-button" type="button" onclick="shiftMasterAvailabilityCalendar(-3)">‹</button>
      <div class="booking-calendar-head">${head}</div>
      <button class="calendar-nav-button" type="button" onclick="shiftMasterAvailabilityCalendar(3)">›</button>
    </div>
    <div class="booking-calendar-body">${rows}</div>
  `;
}

function shiftMasterAvailabilityCalendar(days) {
  masterAvailabilityCalendarOffsetDays = Math.max(0, masterAvailabilityCalendarOffsetDays + days);
  renderMasterAvailabilityPicker();
}

async function addMasterAvailability(dateValue, startTime, endTime) {
  const storyIdValue = document.getElementById("availabilityStoryId")?.value || "";
  const selectedStory = getAllStories().find(story => storyIdsMatch(story.id, storyIdValue));

  if (!storyIdValue || !selectedStory || !isCurrentUserStory(selectedStory)) {
    showToast("Scegli una tua storia Con Master.", "warning");
    return;
  }

  if (!dateValue || !startTime || !endTime) {
    showToast("Seleziona uno slot dal calendario.", "warning");
    return;
  }

  const userId = getCurrentUserId();
  const dates = [dateValue];

  if ((typeof supabaseClient !== "undefined") && userId) {
    const rows = dates.map(date => ({
      story_id: storyIdValue,
      master_id: userId,
      availability_date: date,
      weekday: new Date(`${date}T12:00:00`).getDay(),
      start_time: startTime,
      end_time: endTime
    }));

    const { data, error } = await supabaseClient
      .from("master_availability")
      .insert(rows)
      .select();

    if (error) {
      showToast("Errore disponibilità: " + error.message, "error");
      return;
    }

    const rules = (data || []).map(normalizeAvailability).filter(Boolean);
    supabaseAvailabilityCache = [...supabaseAvailabilityCache, ...rules];
    supabaseAvailabilityLoaded = true;
    await loadSupabaseAvailability();
  }

  renderMasterAvailability();
  if (currentStory) renderBookingCalendar(currentStory);
  showToast("Disponibilità aggiunta.", "success");
}

async function repeatMasterAvailability(id) {
  const ruleId = storyId(id);
  const existingRule = getMasterAvailabilityRules().find(rule => storyIdsMatch(rule.id, ruleId));

  if (!existingRule || !existingRule.availabilityDate) {
    showToast("Disponibilità non trovata.", "warning");
    return;
  }

  const userId = getCurrentUserId();
  if (!userId) {
    showToast("Devi effettuare l’accesso.", "warning");
    return;
  }

  const base = new Date(`${existingRule.availabilityDate}T12:00:00`);
  const candidateDates = [];

  for (let i = 1; i <= 4; i += 1) {
    candidateDates.push(formatISODate(addDays(base, i * 7)));
  }

  const existingKeys = new Set(getMasterAvailabilityRules().map(rule =>
    `${storyId(rule.storyId)}|${rule.availabilityDate}|${rule.startTime}|${rule.endTime}`
  ));

  const rows = candidateDates
    .filter(date => !existingKeys.has(`${storyId(existingRule.storyId)}|${date}|${existingRule.startTime}|${existingRule.endTime}`))
    .map(date => ({
      story_id: storyId(existingRule.storyId),
      master_id: userId,
      availability_date: date,
      weekday: new Date(`${date}T12:00:00`).getDay(),
      start_time: existingRule.startTime,
      end_time: existingRule.endTime
    }));

  if (!rows.length) {
    showToast("Gli slot delle prossime settimane erano già presenti.", "info");
    return;
  }

  if (typeof supabaseClient !== "undefined") {
    const { data, error } = await supabaseClient
      .from("master_availability")
      .insert(rows)
      .select();

    if (error) {
      showToast("Errore ripetizione disponibilità: " + error.message, "error");
      return;
    }

    const rules = (data || []).map(normalizeAvailability).filter(Boolean);
    supabaseAvailabilityCache = [...supabaseAvailabilityCache, ...rules];
    await loadSupabaseAvailability();
  }

  renderMasterAvailability();
  if (currentStory) renderBookingCalendar(currentStory);
  showToast(`Disponibilità ripetuta per ${rows.length} settimane.`, "success");
}

async function notifyParticipantsForCancelledSession(session, storyTitle) {
  if (!session?.id || typeof supabaseClient === "undefined") return;

  const participants = supabaseSessionParticipantsCache.filter(participant =>
    storyIdsMatch(participant.session_id, session.id) && participant.status === "joined"
  );

  await Promise.all(participants.map(participant =>
    createNotificationForUser(
      participant.user_id,
      `La sessione pubblica di "${storyTitle}" è stata annullata dal Master.`,
      "warning",
      { storyId: session.storyId, page: "profilo" }
    )
  ));
}

async function cancelSessionsAndBookingsForAvailability(rule) {
  if (!rule || typeof supabaseClient === "undefined") return;

  const storyTitle = getStoryTitleById(rule.storyId || "") || "Storia Lorecast";

  const sessionsToCancel = supabasePublicSessionsCache.filter(session =>
    storyIdsMatch(session.storyId, rule.storyId) &&
    session.sessionDate === rule.availabilityDate &&
    session.startTime === rule.startTime &&
    session.endTime === rule.endTime &&
    !["cancelled", "closed"].includes(session.status)
  );

  for (const session of sessionsToCancel) {
    await notifyParticipantsForCancelledSession(session, storyTitle);
    await supabaseClient
      .from("public_sessions")
      .update({ status: "cancelled" })
      .eq("id", session.id);
  }

  const bookingsToCancel = getBookings().filter(booking =>
    storyIdsMatch(booking.storyId, rule.storyId) &&
    booking.date === rule.availabilityDate &&
    booking.startTime === rule.startTime &&
    booking.endTime === rule.endTime &&
    !isBookingInactive(booking.status)
  );

  for (const booking of bookingsToCancel) {
    await supabaseClient
      .from("bookings")
      .update({ status: "Annullata" })
      .eq("id", booking.id);

    // La notifica all’utente viene creata dal trigger Supabase
    // update46_booking_status_notifications sul cambio stato della prenotazione.
  }
}

async function removeMasterAvailability(id) {
  const ruleId = storyId(id);
  const existingRule = getMasterAvailabilityRules().find(rule => storyIdsMatch(rule.id, ruleId));

  if (!existingRule) return;

  if (!confirm("Vuoi rimuovere questa disponibilità? Le sessioni e prenotazioni collegate saranno annullate e gli utenti riceveranno una notifica.")) {
    return;
  }

  await cancelSessionsAndBookingsForAvailability(existingRule);

  if ((typeof supabaseClient !== "undefined") && existingRule?.source === "supabase") {
    const { error } = await supabaseClient
      .from("master_availability")
      .delete()
      .eq("id", ruleId);

    if (error) {
      showToast("Errore rimozione disponibilità: " + error.message, "error");
      return;
    }

    supabaseAvailabilityCache = supabaseAvailabilityCache.filter(rule => !storyIdsMatch(rule.id, ruleId));
  } else {
    const rules = getMasterAvailabilityRules().filter(rule => !storyIdsMatch(rule.id, ruleId));
    localStorage.setItem("questhubMasterAvailability", JSON.stringify(rules));
  }

  await loadSupabaseAvailability();
  await loadSupabasePublicSessions();
  await loadSupabaseBookings();
  await loadSupabaseNotifications();

  renderMasterAvailability();
  renderMasterPublicSessions();
  renderDashboardBookings();
  renderOpenSessions();
  renderBookingCalendar(currentStory);
  updateNotificationBadge();
  showToast("Disponibilità rimossa. Eventuali sessioni e prenotazioni collegate sono state annullate.", "success");
}


/* MY STORIES */

function renderMyStories() {
  const unlockedContainer = document.getElementById("myUnlockedStories");
  const bookingsContainer = document.getElementById("myBookings");

  if (!unlockedContainer || !bookingsContainer) return;

  const unlockedIds = getUnlockedStories();
  const unlockedStoryIds = unlockedIds.map(String);
  const unlockedStories = getAllStories().filter(story => unlockedStoryIds.includes(storyId(story.id)));

  unlockedContainer.innerHTML = unlockedStories.length
    ? unlockedStories.map(story => `
        <div class="card">
          <h3>${story.title}</h3>
          <p>${story.desc}</p>
          <button class="primary" onclick='openStory(${storyJsArg(story.id)})'>Apri storia</button>
        </div>
      `).join("")
    : "<p>Non hai ancora storie sbloccate.</p>";

  const bookings = getCurrentUserBookings();

  bookingsContainer.innerHTML = bookings.length
    ? bookings.map(booking => {
        const canCancel = isBookingPending(booking.status);

        return `
          <div class="card booking-user-card">
            <h3>${booking.story}</h3>
            <p><strong>Data:</strong> ${booking.date} · ${booking.startTime || booking.time}${booking.endTime ? `–${booking.endTime}` : ""}</p>
            <p><strong>Giocatori:</strong> ${booking.players}</p>
            <p><strong>Stato:</strong> ${booking.status}</p>
            ${canCancel ? `<button class="light danger-light" onclick='cancelBooking(${JSON.stringify(storyId(booking.id))})'>Disdici prenotazione</button>` : ""}
          </div>
        `;
      }).join("")
    : "<p>Non hai ancora prenotazioni.</p>";
}

/* NOTIFICATIONS */

function normalizeSupabaseNotification(row) {
  if (!row) return null;

  return {
    id: row.id,
    message: row.message,
    type: row.type || "info",
    read: Boolean(row.read),
    storyId: row.story_id || null,
    bookingId: row.booking_id || row.bookingId || null,
    page: row.page || null,
    date: row.created_at ? formatLocalizedDateTime(row.created_at) : formatLocalizedDateTime(new Date().toISOString()),
    source: "supabase"
  };
}

async function loadSupabaseNotifications() {
  if (typeof supabaseClient === "undefined") return [];

  const { data: authData } = await supabaseClient.auth.getUser();
  if (!authData.user) return [];

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("*")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("Impossibile caricare notifiche:", error.message);
    return [];
  }

  const remoteNotifications = (data || []).map(normalizeSupabaseNotification).filter(Boolean);
  const localNotifications = getNotifications().filter(notification => notification.source !== "supabase");
  saveNotifications([...remoteNotifications, ...localNotifications].slice(0, 80));
  updateNotificationBadge();
  return remoteNotifications;
}

function getNotifications() {
  return readJsonStorage(getUserScopedKey("questhubNotifications"), []);
}

function saveNotifications(notifications) {
  writeJsonStorage(getUserScopedKey("questhubNotifications"), notifications);
}

async function createNotificationForUser(userId, message, type = "info", options = {}) {
  if (!userId || !message) return null;

  if (storyIdsMatch(userId, getCurrentUserId())) {
    addNotification(message, type, options);
    return null;
  }

  if (typeof supabaseClient === "undefined") return null;

  const { data, error } = await supabaseClient
    .from("notifications")
    .insert({
      user_id: userId,
      message,
      type,
      read: false,
      story_id: options.storyId ? storyId(options.storyId) : null,
      page: options.page || null
    })
    .select()
    .single();

  if (error) {
    console.warn("Errore creazione notifica:", error.message);
    return null;
  }

  return data;
}

function addNotification(message, type = "info", options = {}) {
  const notifications = getNotifications();

  notifications.unshift({
    id: Date.now(),
    message,
    type,
    read: false,
    date: new Date().toLocaleString(),
    ...options
  });

  saveNotifications(notifications);
  updateNotificationBadge();
}

function extractQuotedText(value) {
  const match = String(value || "").match(/[“"]([^”"]+)[”"]/);
  return match ? match[1] : "";
}

function getLocalizedNotificationMessage(notification) {
  const rawMessage = String(notification?.message || "").trim();
  if (!rawMessage) return t("notificationFallback", "Notifica");

  const storyTitle = extractQuotedText(rawMessage);

  if (notification?.type === "booking_message" || /^Nuovo messaggio da /i.test(rawMessage)) {
    const senderMatch = rawMessage.match(/^Nuovo messaggio da\s+(.+?)\s+per\s+[“"]/i);
    const sender = senderMatch?.[1]?.trim() || t("notificationSenderFallback", "un utente");
    return tf("notificationMessageNewBookingMessage", {
      sender,
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/prenotazione per [“"].+[”"] è stata accettata/i.test(rawMessage)) {
    return tf("notificationMessageBookingAccepted", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/prenotazione per [“"].+[”"] è stata rifiutata/i.test(rawMessage)) {
    return tf("notificationMessageBookingRejected", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^Nuova richiesta di prenotazione per /i.test(rawMessage)) {
    return tf("notificationMessageBookingRequest", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^Richiesta di prenotazione inviata per /i.test(rawMessage)) {
    return tf("notificationMessageBookingSent", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^La sessione pubblica di /i.test(rawMessage)) {
    return tf("notificationMessagePublicSessionCancelled", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^Hai creato una sessione pubblica per /i.test(rawMessage)) {
    return tf("notificationMessagePublicSessionCreated", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^Ti sei unito alla sessione pubblica:/i.test(rawMessage)) {
    const story = rawMessage.split(":").slice(1).join(":").trim() || t("storyFallback", "una storia");
    return tf("notificationMessagePublicSessionJoined", { storyTitle: story }, rawMessage);
  }

  if (/^Materiali sbloccati per /i.test(rawMessage)) {
    return tf("notificationMessageMaterialsUnlocked", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  if (/^Modalità Master attivata/i.test(rawMessage)) {
    return t("notificationMessageMasterModeActivated", rawMessage);
  }

  if (/^Hai eliminato la storia:/i.test(rawMessage)) {
    return tf("notificationMessageStoryDeleted", {
      storyTitle: storyTitle || t("storyFallback", "una storia")
    }, rawMessage);
  }

  return rawMessage;
}

function getNotificationActionLabel(notification) {
  if (!notification) return t("notificationActionDetail", "Apri dettaglio");
  if (notification.type === "booking_message") return t("notificationActionMessages", "Apri messaggi");
  if (notification.bookingId) return t("notificationActionBooking", "Apri prenotazione");
  if (notification.page === "area-master") return t("notificationActionRequests", "Apri richieste");
  if (notification.page === "profilo") return t("notificationActionProfile", "Apri profilo");
  return t("notificationActionDetail", "Apri dettaglio");
}

function notificationHasAction(notification) {
  return Boolean(notification?.bookingId || notification?.storyId || notification?.page || notification?.type === "booking_message");
}

async function resolveNotificationBookingId(notification) {
  if (!notification) return "";
  if (notification.bookingId) return storyId(notification.bookingId);

  if (notification.type !== "booking_message" || !notification.storyId) return "";

  await loadSupabaseBookings();

  const candidates = getBookings().filter(booking =>
    storyIdsMatch(booking.storyId, notification.storyId) &&
    isBookingAccepted(booking.status) &&
    isBookingMessagingParticipant(booking)
  );

  return candidates.length === 1 ? storyId(candidates[0].id) : "";
}

function openNotificationPage(page) {
  if (!page) return false;

  if (page === "area-master") {
    currentMasterAreaView = "requests";
    go("area-master");
    return true;
  }

  go(page);

  if (page === "profilo") {
    setTimeout(() => setProfileLibraryTab("booked"), 350);
  }

  return true;
}

function renderNotifications() {
  const container = document.getElementById("notificationsList");
  if (!container) return;

  const notifications = getNotifications();

  container.innerHTML = notifications.length
    ? notifications.map(notification => {
        const hasAction = notificationHasAction(notification);
        const notificationArg = JSON.stringify(storyId(notification.id));

        return `
          <div
            class="card notification-card ${notification.read ? "read" : "unread"} ${hasAction ? "notification-actionable" : ""}"
            ${hasAction ? `role="button" tabindex="0" onclick='handleNotificationItemClick(${notificationArg})'` : ""}
          >
            <p><strong>${escapeHtml(getLocalizedNotificationMessage(notification))}</strong></p>
            <p>${escapeHtml(notification.date || "")}</p>
            ${hasAction ? `<small>${getNotificationActionLabel(notification)}</small>` : ""}
          </div>
        `;
      }).join("")
    : `<p>${t("notificationsEmpty", "Non hai notifiche.")}</p>`;
}

function markNotificationsAsRead(showMessage = false) {
  const notifications = getNotifications();
  const hasUnread = notifications.some(notification => !notification.read);

  if (!hasUnread) return;

  const updated = notifications.map(notification => ({
    ...notification,
    read: true
  }));

  saveNotifications(updated);

  const remoteIds = updated
    .filter(notification => notification.source === "supabase" && notification.id)
    .map(notification => notification.id);

  if (remoteIds.length && typeof supabaseClient !== "undefined") {
    supabaseClient
      .from("notifications")
      .update({ read: true })
      .in("id", remoteIds)
      .then(({ error }) => {
        if (error) console.warn("Errore aggiornamento notifiche lette:", error.message);
      });
  }

  updateNotificationBadge();
  renderNotifications();
  renderNotificationsPreview();

  if (showMessage) {
    showToast("Notifiche segnate come lette.", "success");
  }
}

function clearNotifications() {
  markNotificationsAsRead(true);
}

function handleNotificationButtonClick(event) {
  if (event) event.stopPropagation();

  const profile = getUserProfile();

  if (!profile.email) {
    closeNotificationsDropdown(false);
    return;
  }

  const dropdown = document.getElementById("notificationsDropdown");
  const isOpen = dropdown?.classList.contains("open");

  if (isOpen) {
    closeNotificationsDropdown(true);
  } else {
    openNotificationsDropdown();
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  const profile = getUserProfile();
  const unread = profile.email
    ? getNotifications().filter(notification => !notification.read).length
    : 0;

  badge.textContent = unread;
  badge.style.display = unread > 0 ? "grid" : "none";
}

function openNotificationsDropdown() {
  const profile = getUserProfile();

  if (!profile.email) {
    closeNotificationsDropdown(false);
    return;
  }

  closeUserMenu();

  const dropdown = document.getElementById("notificationsDropdown");
  if (!dropdown) return;

  renderNotificationsPreview();
  dropdown.classList.add("open");
}

function closeNotificationsDropdown(markAsRead = true) {
  const dropdown = document.getElementById("notificationsDropdown");
  const wasOpen = dropdown?.classList.contains("open");

  if (dropdown) dropdown.classList.remove("open");

  if (wasOpen && markAsRead) {
    markNotificationsAsRead(false);
  }
}

function toggleNotificationsDropdown() {
  const dropdown = document.getElementById("notificationsDropdown");
  if (dropdown?.classList.contains("open")) {
    closeNotificationsDropdown(true);
  } else {
    openNotificationsDropdown();
  }
}

async function handleNotificationItemClick(notificationId) {
  const normalizedNotificationId = storyId(notificationId);
  const notification = getNotifications().find(item => storyIdsMatch(item.id, normalizedNotificationId));

  closeNotificationsDropdown(true);

  if (!notification) return;

  if (notification.type === "booking_message") {
    const bookingId = await resolveNotificationBookingId(notification);

    if (bookingId) {
      await loadSupabaseMarketplaceState();
      await openBookingMessages(bookingId);
      return;
    }

    if (openNotificationPage(notification.page || "area-master")) return;
  }

  if (notification.page) {
    openNotificationPage(notification.page);
    return;
  }

  if (notification.bookingId) {
    const bookingId = storyId(notification.bookingId);
    await loadSupabaseMarketplaceState();
    const booking = getBookings().find(item => storyIdsMatch(item.id, bookingId));

    if (booking && canUseBookingMessages(booking)) {
      await openBookingMessages(bookingId);
      return;
    }

    openNotificationPage(storyIdsMatch(booking?.masterId, getCurrentUserId()) ? "area-master" : "profilo");
    return;
  }

  if (notification.storyId) {
    openStory(notification.storyId);
  }
}

function renderNotificationsPreview() {
  const container = document.getElementById("notificationsPreview");
  if (!container) return;

  const notifications = getNotifications().slice(0, 5);

  container.innerHTML = notifications.length
    ? notifications.map(notification => {
        const hasAction = notificationHasAction(notification);
        const notificationArg = JSON.stringify(storyId(notification.id));

        return `
          <button type="button" class="notification-preview-item ${notification.read ? "read" : "unread"}" onclick='handleNotificationItemClick(${notificationArg})'>
            <p><strong>${escapeHtml(getLocalizedNotificationMessage(notification))}</strong></p>
            <small>${escapeHtml(notification.date || "")}</small>
            ${hasAction ? `<em>${getNotificationActionLabel(notification)}</em>` : ""}
          </button>
        `;
      }).join("")
    : `<p>${t("notificationsEmpty", "Nessuna notifica.")}</p>`;
}

/* HELPERS */

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach(field => {
    field.classList.remove("field-error");
  });

  document.querySelectorAll(".field-hint").forEach(hint => {
    hint.remove();
  });
}

function showFieldErrors(errors) {
  errors.forEach(([fieldId, message]) => {
    const field = document.getElementById(fieldId);
    if (!field) return;

    field.classList.add("field-error");

    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = message;

    field.insertAdjacentElement("afterend", hint);
  });
}

function togglePriceField() {
  const priceMode = document.getElementById("newStoryPriceMode");
  const priceField = document.getElementById("newStoryPrice");

  if (!priceMode || !priceField) return;

  if (priceMode.value === "free") {
    priceField.value = "";
    priceField.disabled = true;
    priceField.placeholder = t("priceNotNeeded", "Prezzo non necessario: storia gratuita");
  } else {
    priceField.disabled = false;
    priceField.placeholder = t("priceEuro", "Prezzo in €");
  }
}

function getCurrentLanguage() {
  return localStorage.getItem("questhubLanguage") || "it";
}

function t(key, fallback = "") {
  const language = getCurrentLanguage();
  return window.translations?.[language]?.[key]
    || window.translations?.it?.[key]
    || fallback
    || key;
}

function tf(key, values = {}, fallback = "") {
  return String(t(key, fallback)).replace(/\{(\w+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match;
  });
}

function getLocaleForLanguage(language = getCurrentLanguage()) {
  const locales = {
    it: "it-IT",
    en: "en-GB",
    es: "es-ES",
    fr: "fr-FR"
  };

  return locales[language] || "it-IT";
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.getAttribute("data-i18n");
    element.textContent = t(key, element.textContent);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    const key = element.getAttribute("data-i18n-placeholder");
    element.placeholder = t(key, element.placeholder);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
    const key = element.getAttribute("data-i18n-aria-label");
    element.setAttribute("aria-label", t(key, element.getAttribute("aria-label") || ""));
  });

  document.querySelectorAll("[data-i18n-title]").forEach(element => {
    const key = element.getAttribute("data-i18n-title");
    element.setAttribute("title", t(key, element.getAttribute("title") || ""));
  });

  const switcher = document.getElementById("languageSwitcher");
  if (switcher) switcher.value = getCurrentLanguage();

  togglePriceField();
}


async function refreshActivePageForLanguage() {
  const activePage = getActivePageId();

  updateHeaderUser();
  renderNotificationsPreview();

  if (activePage === "home") {
    renderHomeMarketplace();
    return;
  }

  if (activePage === "catalogo") {
    await renderCatalog();
    return;
  }

  if (activePage === "scheda" && currentStory) {
    openStory(currentStory.id, { replaceHistory: true });
    return;
  }

  if (activePage === "sessioni") {
    renderOpenSessions();
    return;
  }

  if (activePage === "profilo") {
    await renderUserProfile();
    return;
  }

  if (activePage === "notifiche") {
    renderNotifications();
    return;
  }

  if (activePage === "area-master") {
    renderDashboardBookings();
    renderDashboardStats();
    renderMasterAvailability();
    renderMasterPublicSessions();
    setMasterAreaView(currentMasterAreaView || "availability");
    return;
  }

  if (activePage === "scheda" && currentStory) {
    openStory(currentStory.id, { updateHash: false, scroll: false });
    return;
  }

  if (activePage === "crea-storia") {
    updateCreateStoryMode();
    togglePriceField();
  }
}

function setupLanguageSwitcher() {
  const switcher = document.getElementById("languageSwitcher");
  if (!switcher) return;

  switcher.value = getCurrentLanguage();

  switcher.onchange = async function () {
    localStorage.setItem("questhubLanguage", switcher.value);

    const profile = getUserProfile();
    if (profile.email) {
      const updatedProfile = {
        ...profile,
        language: switcher.value
      };

      localStorage.setItem("questhubUserProfile", JSON.stringify(updatedProfile));

      const { data: authData } = await supabaseClient.auth.getUser();
      if (authData.user) {
        await supabaseClient
          .from("profiles")
          .update({ language: switcher.value })
          .eq("id", authData.user.id);
      }
    }

    applyTranslations();
    await refreshActivePageForLanguage();
  };
}

function notice(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function showToast(message, type = "success") {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
function goCreateStory() {
  const profile = getUserProfile();

  if (!profile.email) {
    showToast("Devi accedere per creare una storia.", "warning");
    go("login");
    return;
  }

  editingStoryId = null;
  clearStoryForm();
  go("crea-storia");
  updateCreateStoryMode();
  togglePriceField();
}

function toggleUserMenu(event) {
  if (event) event.stopPropagation();

  const profile = getUserProfile();
  if (!profile.email) return;

  const menu = document.getElementById("userDropdown");
  const chip = document.getElementById("headerUserChip");
  if (!menu) return;

  const shouldOpen = !menu.classList.contains("open");

  if (shouldOpen) {
    closeNotificationsDropdown(true);
    menu.classList.add("open");
  } else {
    menu.classList.remove("open");
  }

  if (chip) chip.setAttribute("aria-expanded", menu.classList.contains("open") ? "true" : "false");
}

function closeUserMenu() {
  const menu = document.getElementById("userDropdown");
  const chip = document.getElementById("headerUserChip");

  if (menu) menu.classList.remove("open");
  if (chip) chip.setAttribute("aria-expanded", "false");
}

function openProfileEdit() {
  const modal = document.getElementById("profileEditModal");
  if (!modal) return;

  const profile = getUserProfile();

  const nameInput = document.getElementById("profileName");
  const languageInput = document.getElementById("profileLanguage");
  const avatarInput = document.getElementById("profileAvatarFile");

  if (nameInput) nameInput.value = profile.name || "";
  if (languageInput) languageInput.value = profile.language || getCurrentLanguage();
  if (avatarInput) avatarInput.value = "";

  modal.classList.add("open");
}

function closeProfileEdit() {
  const modal = document.getElementById("profileEditModal");
  if (modal) modal.classList.remove("open");
}

function toggleProfileEdit() {
  const modal = document.getElementById("profileEditModal");
  if (!modal) return;

  if (modal.classList.contains("open")) {
    closeProfileEdit();
  } else {
    openProfileEdit();
  }
}

function closeProfileEditOnBackdrop(event) {
  if (event.target?.id === "profileEditModal") {
    closeProfileEdit();
  }
}

function scrollToProfileReviews() {
  const section = document.getElementById("profileReviewsSection") || document.getElementById("profileReviewsList");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getProfileReviews() {
  return [
    {
      author: "Marco",
      rating: 5,
      text: "Sessione molto coinvolgente, ritmo perfetto e atmosfera bellissima."
    },
    {
      author: "Elena",
      rating: 5,
      text: "Ottima gestione del gruppo, Master preciso e molto creativo."
    },
    {
      author: "Davide",
      rating: 4,
      text: "Bella esperienza, storia interessante e ben organizzata."
    },
    {
      author: "Giulia",
      rating: 5,
      text: "La storia è stata gestita con grande cura e tutti hanno avuto spazio."
    },
    {
      author: "Nico",
      rating: 4,
      text: "Molto bella la parte investigativa, qualche passaggio poteva essere più rapido."
    },
    {
      author: "Sara",
      rating: 3,
      text: "Buona sessione, atmosfera riuscita, ma avrei preferito più interazione."
    },
    {
      author: "Luca",
      rating: 5,
      text: "Master preparato e finale memorabile."
    }
  ];
}

function setReviewFilter(rating) {
  profileReviewFilter = String(rating);
  visibleReviewsCount = 3;
  renderUserReviews();
}

function showMoreReviews() {
  visibleReviewsCount += 3;
  renderUserReviews();
}

function renderUserReviews() {
  const container = document.getElementById("profileReviewsList");
  if (!container) return;

  const reviews = getProfileReviews();
  const filtered = profileReviewFilter === "all"
    ? reviews
    : reviews.filter(review => String(review.rating) === profileReviewFilter);

  const average = reviews.length
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : "0.0";

  document.querySelectorAll(".profile-rating-box strong, .restaurant-review-summary strong")
    .forEach(element => element.textContent = average);

  const filters = document.getElementById("profileReviewFilters");
  if (filters) {
    filters.innerHTML = [5, 4, 3, 2, 1].map(rating => {
      const count = reviews.filter(review => review.rating === rating).length;
      const percent = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
      const active = profileReviewFilter === String(rating);

      return `
        <button type="button" class="review-filter-row ${active ? "active" : ""}" onclick="setReviewFilter('${rating}')">
          <span>${rating} stelle</span>
          <i><b style="width:${percent}%"></b></i>
          <strong>${count}</strong>
        </button>
      `;
    }).join("");
  }

  const activeFilter = document.getElementById("activeReviewFilter");
  if (activeFilter) {
    activeFilter.innerHTML = profileReviewFilter === "all"
      ? ""
      : `<button class="light" type="button" onclick="setReviewFilter('all')">Filtro attivo: ${profileReviewFilter} stelle ×</button>`;
  }

  const visible = filtered.slice(0, visibleReviewsCount);

  container.innerHTML = visible.length
    ? visible.map(review => `
        <article class="compact-review-card">
          <div>
            <strong>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</strong>
            <span>${review.author}</span>
          </div>
          <p>${review.text}</p>
        </article>
      `).join("")
    : "<p>Nessuna recensione con questo filtro.</p>";

  const actions = document.getElementById("profileReviewsActions");
  if (actions) {
    actions.innerHTML = filtered.length > visibleReviewsCount
      ? `<button class="light" type="button" onclick="showMoreReviews()">Mostra altre</button>`
      : "";
  }
}

function setupGlobalUiHandlers() {
  document.addEventListener("click", function (event) {
    const notificationsDropdown = document.getElementById("notificationsDropdown");
    const notificationButton = document.getElementById("notificationButton");
    const userDropdown = document.getElementById("userDropdown");
    const userMenuWrapper = document.getElementById("userMenuWrapper");
  const userChip = document.getElementById("headerUserChip");

    if (notificationsDropdown && notificationButton) {
      if (!notificationsDropdown.contains(event.target) && !notificationButton.contains(event.target)) {
        closeNotificationsDropdown(true);
      }
    }

    if (userDropdown && userChip) {
      if (!userDropdown.contains(event.target) && !userChip.contains(event.target)) {
        closeUserMenu();
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeNotificationsDropdown(true);
      closeUserMenu();
      closeProfileEdit();
      closeBookingMessages();
    }
  });
}

setupGlobalUiHandlers();
renderUserReviews();
loadSections();
