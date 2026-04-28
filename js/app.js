let currentStory = null;
let currentMaster = null;

const sections = [
  "home",
  "catalogo",
  "scheda",
  "profilo-master",
  "master",
  "dashboard",
  "mie-storie",
  "profilo",
  "notifiche",
  "login"
];

async function loadSections() {
  const app = document.getElementById("app");

  for (const section of sections) {
   const response = await fetch(`sections/${section}.html?v=${Date.now()}`, {
  cache: "no-store"
});
    const html = await response.text();
    app.insertAdjacentHTML("beforeend", html);
  }

  renderFeatured();
  go("home");
  setupLanguageSwitcher();
  applyTranslations();
  updateNotificationBadge();
  await checkAuthSession();
}

function getAllStories() {
  const savedStories = JSON.parse(localStorage.getItem("questhubStories") || "[]");
  return [...storiesData, ...savedStories];
}

function getUnlockedStories() {
  return JSON.parse(localStorage.getItem("questhubUnlockedStories") || "[]");
}

function isStoryUnlocked(storyId) {
  return getUnlockedStories().includes(storyId);
}

function getUserProfile() {
  return JSON.parse(localStorage.getItem("questhubUserProfile") || "{}");
}

function go(page) {
  document.querySelectorAll(".page").forEach(pageEl => {
    pageEl.classList.remove("active");
  });

  const selected = document.getElementById(page);
  if (selected) selected.classList.add("active");

  window.scrollTo(0, 0);

  if (page === "catalogo") renderCatalog();

  if (page === "dashboard") {
    renderDashboardBookings();
    renderDashboardStats();
    togglePriceField();
  }

  if (page === "mie-storie") renderMyStories();
  if (page === "profilo") renderUserProfile();
  if (page === "notifiche") renderNotifications();
  if (page === "login") renderAuthState();
}

/* AUTH + SUPABASE PROFILE */

async function upsertSupabaseProfile(user) {
  if (!user) return null;

  const profileData = {
    id: user.id,
    name: user.user_metadata?.name || user.user_metadata?.full_name || user.email,
    email: user.email,
    avatar_url: user.user_metadata?.avatar_url || "",
    language: "it"
  };

  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(profileData)
    .select()
    .single();

  if (error) {
    showToast("Errore profilo: " + error.message, "error");
    return null;
  }

  localStorage.setItem("questhubUserProfile", JSON.stringify({
    name: data.name,
    email: data.email,
    avatar_url: data.avatar_url,
    language: data.language || "it",
    isMaster: data.is_master || false
  }));

  updateHeaderUser();
  return data;
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

  showToast("Accesso effettuato.", "success");
  updateHeaderUser();
  renderAuthState();
  go("profilo");
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

window.logoutUser = async function () {
  await supabaseClient.auth.signOut({ scope: "global" });

  Object.keys(localStorage).forEach(key => {
    if (
      key.startsWith("sb-") ||
      key.includes("supabase") ||
      key === "questhubUserProfile"
    ) {
      localStorage.removeItem(key);
    }
  });

  showToast("Logout effettuato.", "success");

  setTimeout(() => {
    window.location.href = window.location.origin + "?logout=1";
  }, 500);
};

async function renderAuthState() {
  const status = document.getElementById("authStatus");
  if (!status) return;

  const { data } = await supabaseClient.auth.getUser();

  status.textContent = data.user
    ? `Accesso effettuato come ${data.user.email}`
    : "Non hai ancora effettuato l’accesso.";
}

/* HEADER / PROFILE */

function updateHeaderUser() {
  const profile = getUserProfile();

  const nameEl = document.getElementById("headerUserName");
  const avatarEl = document.getElementById("headerUserAvatar");
  const roleEl = document.getElementById("headerUserRole");

  const loginButton = document.getElementById("headerLoginButton");
  const userChip = document.getElementById("headerUserChip");
  const notificationButton = document.getElementById("notificationButton");

  const isLoggedIn = Boolean(profile.email);
  document.body.classList.toggle("is-logged-in", isLoggedIn);

const dropdown = document.getElementById("notificationsDropdown");
if (!isLoggedIn && dropdown) {
  dropdown.classList.remove("open");
}

  if (loginButton) loginButton.style.display = isLoggedIn ? "none" : "inline-flex";
  if (userChip) userChip.style.display = isLoggedIn ? "flex" : "none";
  if (notificationButton) notificationButton.style.display = isLoggedIn ? "block" : "none";

  if (!isLoggedIn) return;

  const name = profile.name || profile.email || "Utente";

  if (nameEl) nameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  if (roleEl) roleEl.textContent = profile.isMaster ? "Player + Master" : "Player";
}

async function renderUserProfile() {
  const { data } = await supabaseClient.auth.getUser();

  if (!data.user) {
    localStorage.removeItem("questhubUserProfile");
    updateHeaderUser();

    const profileName = document.getElementById("profileDisplayName");
    const profileEmail = document.getElementById("profileDisplayEmail");
    const roleBadge = document.getElementById("profileRoleBadge");

    if (profileName) profileName.textContent = "Non hai effettuato l’accesso";
    if (profileEmail) profileEmail.textContent = "Vai su Accedi per entrare nel tuo account.";
    if (roleBadge) roleBadge.textContent = "Guest";

    return;
  }

  await upsertSupabaseProfile(data.user);

  const profile = getUserProfile();
  const savedStories = JSON.parse(localStorage.getItem("questhubStories") || "[]");
  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");
  const unlockedIds = getUnlockedStories();

  const displayName = profile.name || "Utente Lorecast";
  const displayEmail = profile.email || "Non hai ancora effettuato l’accesso.";

  const nameInput = document.getElementById("profileName");
  const emailInput = document.getElementById("profileEmail");
  const languageInput = document.getElementById("profileLanguage");
  const status = document.getElementById("masterModeStatus");

  if (nameInput) nameInput.value = profile.name || "";
  if (emailInput) emailInput.value = profile.email || "";
  if (languageInput) languageInput.value = profile.language || "it";
  if (status) status.style.display = profile.isMaster ? "block" : "none";

  const avatarLarge = document.getElementById("profileAvatarLarge");
  const profileName = document.getElementById("profileDisplayName");
  const profileEmail = document.getElementById("profileDisplayEmail");
  const roleBadge = document.getElementById("profileRoleBadge");

  if (avatarLarge) avatarLarge.textContent = displayName.charAt(0).toUpperCase();
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = displayEmail;
  if (roleBadge) roleBadge.textContent = profile.isMaster ? "Player + Master" : "Player";

  const storiesCreated = document.getElementById("profileStoriesCreated");
  const bookingsCount = document.getElementById("profileBookingsCount");
  const unlockedCount = document.getElementById("profileUnlockedCount");

  if (storiesCreated) storiesCreated.textContent = savedStories.length;
  if (bookingsCount) bookingsCount.textContent = bookings.length;
  if (unlockedCount) unlockedCount.textContent = unlockedIds.length;

  const published = document.getElementById("profilePublishedStories");

  if (published) {
    published.innerHTML = savedStories.length
      ? savedStories.map(story => `
          <div class="card">
            <h3>${story.title}</h3>
            <p>${story.desc}</p>
            <button class="primary" onclick="openStory(${story.id})">
              Apri storia
            </button>
          </div>
        `).join("")
      : "<p>Non hai ancora pubblicato storie.</p>";
  }
}

async function saveUserProfile() {
  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData.user) {
    showToast("Devi effettuare l’accesso.", "warning");
    return;
  }

  const name = document.getElementById("profileName")?.value.trim() || "";
  const email = document.getElementById("profileEmail")?.value.trim() || "";
  const language = document.getElementById("profileLanguage")?.value || "it";

  if (!name || !email) {
    showToast("Inserisci nome ed email.", "warning");
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .update({
      name,
      email,
      language
    })
    .eq("id", authData.user.id)
    .select()
    .single();

  if (error) {
    showToast("Errore salvataggio profilo: " + error.message, "error");
    return;
  }

  localStorage.setItem("questhubUserProfile", JSON.stringify({
    name: data.name,
    email: data.email,
    avatar_url: data.avatar_url,
    language: data.language,
    isMaster: data.is_master || false
  }));

  showToast("Profilo salvato.", "success");
  updateHeaderUser();
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
  const priceLabel = story.isFree || Number(story.price) === 0
    ? `<span class="story-price-free">Gratis</span>`
    : `<span class="story-price-paid">${story.price}€</span>`;

  const genreClass = getGenreClass(story.genre);

  return `
    <div class="story-card" onclick="openStory(${story.id})">
      <div class="story-card-cover ${genreClass}">
  <div class="story-cover-title">
    <span>${story.genre}</span>
    <strong>${story.title}</strong>
  </div>
</div>

      <div class="story-card-body">
        <div>
          <span class="tag ${genreClass}">${story.genre}</span>
          <span class="tag gold">${story.type}</span>
        </div>

        <h2>${story.title}</h2>
        <p>${story.desc}</p>

        <div class="story-card-meta">
          <span>${story.players} giocatori</span>
          <strong>${priceLabel}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderFeatured() {
  const container = document.getElementById("featured");
  if (!container) return;

  container.innerHTML = getAllStories().slice(0, 3).map(card).join("");
}

function renderCatalog() {
  const container = document.getElementById("stories");
  const count = document.getElementById("count");
  if (!container || !count) return;

  const q = document.getElementById("q")?.value.toLowerCase() || "";
  const genre = document.getElementById("genre")?.value || "";
  const type = document.getElementById("type")?.value || "";
  const price = document.getElementById("price")?.value || "";

  const results = getAllStories().filter(story => {
    const matchesSearch =
      !q ||
      story.title.toLowerCase().includes(q) ||
      story.desc.toLowerCase().includes(q) ||
      story.genre.toLowerCase().includes(q);

    const matchesGenre = !genre || story.genre === genre;
    const matchesType = !type || story.type === type;
    const matchesPrice = !price || Number(story.price) <= Number(price);

    return matchesSearch && matchesGenre && matchesType && matchesPrice;
  });

  count.textContent = results.length + " storie trovate";

  container.innerHTML = results.length
    ? results.map(card).join("")
    : "<p>Nessuna storia trovata.</p>";
}

function openStory(id) {
  const story = getAllStories().find(s => s.id === id);
  if (!story) return;

  currentStory = story;
  currentMaster = mastersData.find(m => m.id === story.masterId);

  document.getElementById("detailTags").innerHTML = `
    <span class="tag">${story.genre}</span>
    <span class="tag gold">${story.type}</span>
  `;

  document.getElementById("detailTitle").textContent = story.title;
  document.getElementById("detailDesc").textContent = story.desc;
  document.getElementById("detailLong").textContent = story.long;
  document.getElementById("detailDuration").textContent = story.duration;
  document.getElementById("detailPlayers").textContent = story.players;
  document.getElementById("detailLevel").textContent = story.level;
  document.getElementById("detailMode").textContent = story.mode;

  document.getElementById("detailPrice").textContent =
    story.isFree || Number(story.price) === 0 ? "Gratis" : story.price + "€";

  document.getElementById("detailMaster").textContent = story.master;

  document.getElementById("detailAction").textContent =
    story.type === "Con Master"
      ? "Prenota una sessione guidata o sblocca i materiali della storia."
      : "Acquista e gioca in autonomia.";

  renderStoryMedia(story);
  renderStoryMaterials(story);
  renderJoinSession(story);

  go("scheda");
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
  const unlocked = isStoryUnlocked(story.id);

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

  localStorage.setItem("questhubUnlockedStories", JSON.stringify(unlockedStories));

  renderStoryMaterials(currentStory);
  showToast("Storia sbloccata. Ora puoi vedere i materiali riservati.", "success");
  addNotification(`Materiali sbloccati per "${currentStory.title}".`, "success");
}

function openMasterProfile() {
  if (!currentMaster) return;

  const reviews = reviewsData.filter(review => review.masterId === currentMaster.id);

  document.getElementById("masterProfileName").textContent = currentMaster.name;

  document.getElementById("masterProfileStats").textContent =
    `Master verificato · ★ ${currentMaster.rating} · ${currentMaster.sessions} sessioni completate`;

  document.getElementById("masterProfileBio").textContent = currentMaster.bio;
  document.getElementById("masterProfileLongBio").textContent = currentMaster.longBio;
  document.getElementById("masterProfilePrice").textContent = currentMaster.price;
  document.getElementById("masterProfileMode").textContent = currentMaster.mode;
  document.getElementById("masterProfileLanguage").textContent = currentMaster.language;
  document.getElementById("masterProfileAvailability").textContent = currentMaster.availability;

  document.getElementById("masterProfileSpecialties").innerHTML =
    currentMaster.specialties.map(item => `<span class="tag">${item}</span>`).join("");

  const reviewsContainer = document.getElementById("masterReviews");

  if (reviewsContainer) {
    reviewsContainer.innerHTML = reviews.length
      ? reviews.map(review => `
          <div class="card">
            <p>${"★".repeat(review.rating)}</p>
            <p><strong>${review.author}</strong> · ${review.date}</p>
            <p>“${review.text}”</p>
          </div>
        `).join("")
      : "<p>Nessuna recensione disponibile.</p>";
  }

  go("profilo-master");
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

  if (q) q.value = "";
  if (genre) genre.value = "";
  if (type) type.value = "";
  if (price) price.value = "";

  renderCatalog();
}

/* BOOKINGS */

function createBooking() {
  if (!currentStory || !currentMaster) return;

  const group = document.getElementById("bookingGroup")?.value || "";
  const date = document.getElementById("bookingDate")?.value || "";
  const time = document.getElementById("bookingTime")?.value || "";
  const players = document.getElementById("bookingPlayers")?.value || "";
  const message = document.getElementById("bookingMessage")?.value || "";

  if (!group || !date || !time || !players) {
    showToast("Compila tutti i campi principali della prenotazione.", "warning");
    return;
  }

  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");

  bookings.push({
    id: Date.now(),
    storyId: currentStory.id,
    story: currentStory.title,
    master: currentMaster.name,
    group,
    date,
    time,
    players,
    message,
    status: "In attesa"
  });

  localStorage.setItem("questhubBookings", JSON.stringify(bookings));

  document.getElementById("bookNotice").style.display = "block";

  document.getElementById("bookingGroup").value = "";
  document.getElementById("bookingDate").value = "";
  document.getElementById("bookingTime").value = "";
  document.getElementById("bookingPlayers").value = "";
  document.getElementById("bookingMessage").value = "";

  showToast("Richiesta di prenotazione inviata.", "success");
  addNotification(`Richiesta di prenotazione inviata per "${currentStory.title}".`, "success");
}

function renderDashboardBookings() {
  const container = document.getElementById("dashboardBookings");
  const count = document.getElementById("dashboardBookingCount");

  if (!container || !count) return;

  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");

  count.textContent = bookings.length === 1
    ? "1 richiesta"
    : bookings.length + " richieste";

  container.innerHTML = bookings.length
    ? bookings.map(booking => {
        let statusClass = "pending";

        if (booking.status === "Accettata") statusClass = "accepted";
        if (booking.status === "Rifiutata") statusClass = "rejected";

        return `
          <div class="card">
            <h3>${booking.story}</h3>
            <p><strong>Gruppo:</strong> ${booking.group}</p>
            <p><strong>Master:</strong> ${booking.master}</p>
            <p><strong>Data:</strong> ${booking.date} · ${booking.time}</p>
            <p><strong>Giocatori:</strong> ${booking.players}</p>
            <p><strong>Messaggio:</strong> ${booking.message || "Nessun messaggio"}</p>
            <p><strong>Stato:</strong> <span class="status ${statusClass}">${booking.status}</span></p>

            <button class="primary" onclick="updateBookingStatus(${booking.id}, 'Accettata')">Accetta</button>
            <button class="light" onclick="updateBookingStatus(${booking.id}, 'Rifiutata')">Rifiuta</button>
          </div>
        `;
      }).join("")
    : "<p>Nessuna richiesta di prenotazione al momento.</p>";
}

function updateBookingStatus(id, status) {
  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");
  let changedBooking = null;

  const updatedBookings = bookings.map(booking => {
    if (booking.id === id) {
      changedBooking = booking;

      if (status === "Accettata" && booking.storyId) {
        unlockStoryById(booking.storyId);
      }

      return { ...booking, status };
    }

    return booking;
  });

  localStorage.setItem("questhubBookings", JSON.stringify(updatedBookings));
  renderDashboardBookings();

  if (status === "Accettata") {
    showToast("Prenotazione accettata. Materiali sbloccati per l’utente.", "success");

    if (changedBooking) {
      addNotification(`Prenotazione accettata per "${changedBooking.story}". Materiali sbloccati.`, "success");
    }
  }

  if (status === "Rifiutata") {
    showToast("Prenotazione rifiutata.", "error");

    if (changedBooking) {
      addNotification(`Prenotazione rifiutata per "${changedBooking.story}".`, "error");
    }
  }
}

function unlockStoryById(storyId) {
  const unlockedStories = getUnlockedStories();

  if (!unlockedStories.includes(storyId)) {
    unlockedStories.push(storyId);
  }

  localStorage.setItem("questhubUnlockedStories", JSON.stringify(unlockedStories));
}

/* JOIN-IN */

function getJoinSessions() {
  return JSON.parse(localStorage.getItem("questhubJoinSessions") || "{}");
}

function renderJoinSession(story) {
  const container = document.getElementById("joinSessionStatus");
  if (!container || !story) return;

  const sessions = getJoinSessions();

  if (!sessions[story.id]) {
    sessions[story.id] = {
      joined: 0,
      minPlayers: 2,
      maxPlayers: 6
    };

    localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));
  }

  const session = sessions[story.id];

  let status = "In attesa di altri giocatori";

  if (session.joined >= session.maxPlayers) status = "Gruppo completo";
  else if (session.joined >= session.minPlayers) status = "Sessione pronta a partire";

  container.innerHTML = `
    <p><strong>${session.joined} / ${session.maxPlayers}</strong> giocatori iscritti</p>
    <p>Minimo per partire: ${session.minPlayers}</p>
    <p><strong>${status}</strong></p>
  `;
}

function joinPublicSession() {
  if (!currentStory) return;

  const sessions = getJoinSessions();

  if (!sessions[currentStory.id]) {
    sessions[currentStory.id] = {
      joined: 0,
      minPlayers: 2,
      maxPlayers: 6
    };
  }

  const session = sessions[currentStory.id];

  if (session.joined >= session.maxPlayers) {
    showToast("Gruppo già completo.", "warning");
    return;
  }

  session.joined += 1;

  localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));

  renderJoinSession(currentStory);

  addNotification(`Ti sei unito alla sessione pubblica: ${currentStory.title}`, "success");

  if (session.joined >= session.minPlayers) {
    showToast("Sessione pronta a partire!", "success");
    addNotification(`La sessione "${currentStory.title}" è pronta a partire.`, "success");
  } else {
    showToast("Ti sei unito alla sessione pubblica.", "success");
  }
}

/* CREATE STORY */

function addMaterialField() {
  const container = document.getElementById("materialsBuilder");
  if (!container) return;

  const index = container.children.length + 1;

  const block = document.createElement("div");
  block.className = "card material-field";

  block.innerHTML = `
    <h3>Materiale ${index}</h3>

    <input class="material-name" placeholder="Nome materiale, es. Mappa del castello" />

    <select class="material-type">
      <option value="">Tipo materiale</option>
      <option>Indizio</option>
      <option>Mappa</option>
      <option>Scheda personaggio</option>
      <option>PDF</option>
      <option>Audio</option>
      <option>Immagine</option>
      <option>Altro</option>
    </select>

    <select class="material-visibility">
      <option value="">Visibilità materiale</option>
      <option>Visibile subito</option>
      <option>Dopo acquisto</option>
      <option>Durante sessione</option>
      <option>Solo Master</option>
    </select>

    <textarea class="material-notes" placeholder="Note sul materiale"></textarea>

    <button class="light" type="button" onclick="this.parentElement.remove()">Rimuovi materiale</button>
  `;

  container.appendChild(block);
}

function getCreatedMaterials() {
  const materialBlocks = document.querySelectorAll(".material-field");

  return Array.from(materialBlocks)
    .map(block => ({
      name: block.querySelector(".material-name")?.value.trim() || "",
      type: block.querySelector(".material-type")?.value || "Altro",
      visibility: block.querySelector(".material-visibility")?.value || "Dopo acquisto",
      notes: block.querySelector(".material-notes")?.value.trim() || ""
    }))
    .filter(material => material.name);
}

function createStory() {
  clearFieldErrors();

  const title = document.getElementById("newStoryTitle")?.value.trim() || "";
  const genre = document.getElementById("newStoryGenre")?.value || "";
  const type = document.getElementById("newStoryType")?.value || "";
  const priceMode = document.getElementById("newStoryPriceMode")?.value || "";
  const priceValue = document.getElementById("newStoryPrice")?.value || "";
  const duration = document.getElementById("newStoryDuration")?.value.trim() || "";
  const players = document.getElementById("newStoryPlayers")?.value.trim() || "";
  const desc = document.getElementById("newStoryDesc")?.value.trim() || "";
  const long = document.getElementById("newStoryLong")?.value.trim() || "";
  const cover = document.getElementById("newStoryCover")?.value.trim() || "";
  const trailer = document.getElementById("newStoryTrailer")?.value.trim() || "";
  const materials = getCreatedMaterials();

  const errors = [];

  if (!title) errors.push(["newStoryTitle", "Inserisci il titolo della storia."]);
  if (!genre) errors.push(["newStoryGenre", "Seleziona un genere."]);
  if (!type) errors.push(["newStoryType", "Seleziona il tipo di storia."]);
  if (!priceMode) errors.push(["newStoryPriceMode", "Scegli se la storia è gratuita o a pagamento."]);

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

  const savedStories = JSON.parse(localStorage.getItem("questhubStories") || "[]");

  const newStory = {
    id: Date.now(),
    masterId: 1,
    title,
    genre,
    type,
    price: priceMode === "free" ? 0 : Number(priceValue),
    isFree: priceMode === "free",
    duration,
    players,
    level: "Intermedio",
    mode: "Online",
    master: "Arianna V.",
    desc,
    long: long || desc,
    cover,
    trailer,
    materials
  };

  savedStories.push(newStory);
  localStorage.setItem("questhubStories", JSON.stringify(savedStories));

  showToast("Storia pubblicata correttamente.", "success");
  addNotification(`Hai pubblicato una nuova storia: "${title}".`, "success");

  document.querySelectorAll("#dashboard input, #dashboard textarea, #dashboard select")
    .forEach(field => field.value = "");

  const materialsBuilder = document.getElementById("materialsBuilder");
  if (materialsBuilder) materialsBuilder.innerHTML = "";

  togglePriceField();
  renderDashboardStats();
  renderFeatured();
}

function renderDashboardStats() {
  const storiesCount = document.getElementById("dashboardStoriesCount");
  if (!storiesCount) return;

  const totalStories = getAllStories().length;

  storiesCount.textContent = totalStories === 1
    ? "1 storia attiva"
    : totalStories + " storie attive";
}

/* MY STORIES */

function renderMyStories() {
  const unlockedContainer = document.getElementById("myUnlockedStories");
  const bookingsContainer = document.getElementById("myBookings");

  if (!unlockedContainer || !bookingsContainer) return;

  const unlockedIds = getUnlockedStories();
  const unlockedStories = getAllStories().filter(story => unlockedIds.includes(story.id));

  unlockedContainer.innerHTML = unlockedStories.length
    ? unlockedStories.map(story => `
        <div class="card">
          <h3>${story.title}</h3>
          <p>${story.desc}</p>
          <button class="primary" onclick="openStory(${story.id})">Apri storia</button>
        </div>
      `).join("")
    : "<p>Non hai ancora storie sbloccate.</p>";

  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");

  bookingsContainer.innerHTML = bookings.length
    ? bookings.map(booking => `
        <div class="card">
          <h3>${booking.story}</h3>
          <p><strong>Data:</strong> ${booking.date} · ${booking.time}</p>
          <p><strong>Giocatori:</strong> ${booking.players}</p>
          <p><strong>Stato:</strong> ${booking.status}</p>
        </div>
      `).join("")
    : "<p>Non hai ancora prenotazioni.</p>";
}

/* NOTIFICATIONS */

function getNotifications() {
  return JSON.parse(localStorage.getItem("questhubNotifications") || "[]");
}

function addNotification(message, type = "info") {
  const notifications = getNotifications();

  notifications.unshift({
    id: Date.now(),
    message,
    type,
    read: false,
    date: new Date().toLocaleString()
  });

  localStorage.setItem("questhubNotifications", JSON.stringify(notifications));
  updateNotificationBadge();
}

function renderNotifications() {
  const container = document.getElementById("notificationsList");
  if (!container) return;

  const notifications = getNotifications();

  container.innerHTML = notifications.length
    ? notifications.map(notification => `
        <div class="card notification-card ${notification.read ? "read" : "unread"}">
          <p><strong>${notification.message}</strong></p>
          <p>${notification.date}</p>
        </div>
      `).join("")
    : "<p>Non hai notifiche.</p>";
}

function clearNotifications() {
  const notifications = getNotifications().map(notification => ({
    ...notification,
    read: true
  }));

  localStorage.setItem("questhubNotifications", JSON.stringify(notifications));
  updateNotificationBadge();
  renderNotifications();

  showToast("Notifiche segnate come lette.", "success");
}

function updateNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  const unread = getNotifications().filter(notification => !notification.read).length;

  badge.textContent = unread;
  badge.style.display = unread > 0 ? "grid" : "none";
}

function toggleNotificationsDropdown() {
  const dropdown = document.getElementById("notificationsDropdown");
  if (!dropdown) return;

  dropdown.classList.toggle("open");

  if (dropdown.classList.contains("open")) {
    renderNotificationsPreview();
  }
}

function renderNotificationsPreview() {
  const container = document.getElementById("notificationsPreview");
  if (!container) return;

  const notifications = getNotifications().slice(0, 5);

  container.innerHTML = notifications.length
    ? notifications.map(notification => `
        <div class="notification-preview-item">
          <p><strong>${notification.message}</strong></p>
          <small>${notification.date}</small>
        </div>
      `).join("")
    : "<p>Nessuna notifica.</p>";
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
    priceField.placeholder = "Prezzo non necessario: storia gratuita";
  } else {
    priceField.disabled = false;
    priceField.placeholder = "Prezzo in €";
  }
}

function getCurrentLanguage() {
  return localStorage.getItem("questhubLanguage") || "it";
}

function applyTranslations() {
  const language = getCurrentLanguage();
  const dictionary = window.translations?.[language] || window.translations?.it || {};

  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.getAttribute("data-i18n");

    if (dictionary[key]) {
      element.textContent = dictionary[key];
    }
  });

  const switcher = document.getElementById("languageSwitcher");
  if (switcher) switcher.value = language;
}

function setupLanguageSwitcher() {
  const switcher = document.getElementById("languageSwitcher");
  if (!switcher) return;

  switcher.value = getCurrentLanguage();

  switcher.onchange = function () {
    localStorage.setItem("questhubLanguage", switcher.value);
    applyTranslations();
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

  go("dashboard");
}
loadSections();