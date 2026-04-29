let currentStory = null;
let currentMaster = null;
let bookingCalendarOffsetDays = 0;
let bookingCalendarExpanded = false;
let selectedBookingSlot = null;
let profileReviewFilter = "all";
let visibleReviewsCount = 3;

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
  "condizioni",
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
  closeNotificationsDropdown();
  closeUserMenu();

  document.querySelectorAll(".page").forEach(pageEl => {
    pageEl.classList.remove("active");
  });

  const selected = document.getElementById(page);
  if (selected) selected.classList.add("active");

  window.scrollTo(0, 0);

  if (page === "catalogo") renderCatalog();
  if (page === "sessioni") renderOpenSessions();

  if (page === "crea-storia") {
    togglePriceField();
  }

  if (page === "area-master") {
    renderDashboardBookings();
    renderDashboardStats();
    renderOpenSessions();
    renderMasterAvailability();
  }

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

  const fallbackProfile = {
    id: user.id,
    name: user.user_metadata?.name || user.user_metadata?.full_name || user.email,
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
     ? `Accesso effettuato.`
    : "Non hai ancora effettuato l’accesso.";
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

  const name = profile.name || profile.email || "Utente";

  if (nameEl) nameEl.textContent = name;

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
    if (profileName) profileName.textContent = "Non hai effettuato l’accesso";
    if (profileMeta) profileMeta.textContent = "Accedi per personalizzare il profilo.";
    if (profileMainName) profileMainName.textContent = "Profilo utente";
    if (roleBadge) roleBadge.textContent = "Guest";
    if (reviewLink) reviewLink.textContent = "0 recensioni ricevute";

    return;
  }

  await upsertSupabaseProfile(data.user);

  const profile = getUserProfile();
  const savedStories = JSON.parse(localStorage.getItem("questhubStories") || "[]");
  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");
  const unlockedIds = getUnlockedStories();
  const reviews = getProfileReviews();

  const displayName = profile.name || "Utente Lorecast";
  
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
  if (profileMeta) profileMeta.textContent = "Membro Lorecast";
  if (profileMainName) profileMainName.textContent = displayName;
  if (roleBadge) roleBadge.textContent = profile.isMaster ? "Player + Master" : "Player";
  if (reviewLink) {
    reviewLink.textContent = reviews.length === 1
      ? "1 recensione ricevuta"
      : `${reviews.length} recensioni ricevute`;
  }

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
          <div class="card profile-mini-story">
            <div class="profile-mini-cover ${getGenreClass(story.genre)}">${story.genre}</div>
            <div>
              <h3>${story.title}</h3>
              <p>${story.desc}</p>
              <button class="primary" onclick="openStory(${story.id})">Apri storia</button>
            </div>
          </div>
        `).join("")
      : "<p>Non hai ancora pubblicato storie.</p>";
  }

  const played = document.getElementById("profilePlayedStories");
  if (played) {
    played.innerHTML = bookings.length
      ? bookings.map(booking => `
          <div class="card profile-mini-story">
            <div class="profile-mini-cover">${booking.status || "Sessione"}</div>
            <div>
              <h3>${booking.story}</h3>
              <p><strong>Data:</strong> ${booking.date || "Da definire"} · ${booking.time || ""}</p>
              <p><strong>Stato:</strong> ${booking.status || "In attesa"}</p>
            </div>
          </div>
        `).join("")
      : "<p>Non hai ancora partecipato a sessioni.</p>";
  }

  renderUserReviews();
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
    <div class="story-card" onclick="openStory(${story.id})">
      ${coverHtml}

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
    const matchesPrice = !price
      ? true
      : price === "free"
        ? story.isFree || Number(story.price) === 0
        : Number(story.price) <= Number(price);

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
  renderStoryPaymentPanel(story);

  document.getElementById("detailAction").textContent =
    story.type === "Con Master"
      ? "Prenota una sessione guidata o sblocca i materiali della storia."
      : "Acquista e gioca in autonomia.";

  renderStoryMedia(story);
  renderStoryMaterials(story);
  renderJoinSession(story);
  renderStoryBookingMode(story);

  go("scheda");
}

function renderStoryPaymentPanel(story) {
  const priceEl = document.getElementById("paymentTotalPrice");
  const titleEl = document.getElementById("paymentStoryTitle");
  const hintEl = document.getElementById("paymentHint");
  const payButton = document.getElementById("paymentButton");

  if (!story) return;

  const priceLabel = story.isFree || Number(story.price) === 0
    ? "Gratis"
    : `${story.price}€`;

  if (priceEl) priceEl.textContent = priceLabel;
  if (titleEl) titleEl.textContent = story.title;

  if (hintEl) {
    hintEl.textContent = story.type === "Con Master"
      ? "Pagamento storia/materiali. La prenotazione resta in attesa finché il Master accetta lo slot."
      : "Dopo il pagamento sblocchi subito tutti i materiali self-play.";
  }

  if (payButton) {
    payButton.textContent = story.isFree || Number(story.price) === 0
      ? "Sblocca gratis"
      : "Paga ora";
  }
}

function payForCurrentStory() {
  if (!currentStory) return;

  const profile = getUserProfile();
  if (!profile.email) {
    showToast("Accedi per completare il pagamento o sbloccare la storia.", "warning");
    go("login");
    return;
  }

  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || "card";
  const payments = JSON.parse(localStorage.getItem("questhubPayments") || "[]");

  payments.push({
    id: Date.now(),
    storyId: currentStory.id,
    story: currentStory.title,
    amount: currentStory.isFree || Number(currentStory.price) === 0 ? 0 : Number(currentStory.price),
    method,
    status: "Simulato",
    createdAt: new Date().toISOString()
  });

  localStorage.setItem("questhubPayments", JSON.stringify(payments));

  unlockCurrentStory();

  showToast(
    currentStory.isFree || Number(currentStory.price) === 0
      ? "Storia sbloccata gratuitamente."
      : "Pagamento simulato completato. Materiali sbloccati.",
    "success"
  );
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
  return date.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function formatLongItalianDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function getDefaultMasterAvailability() {
  return [
    { id: 1, masterId: 1, weekday: 6, startTime: "13:00", endTime: "17:30" },
    { id: 2, masterId: 1, weekday: 2, startTime: "19:00", endTime: "22:30" },
    { id: 3, masterId: 2, weekday: 0, startTime: "16:00", endTime: "21:00" },
    { id: 4, masterId: 3, weekday: 5, startTime: "20:00", endTime: "23:30" },
    { id: 5, masterId: 3, weekday: 6, startTime: "18:00", endTime: "23:30" }
  ];
}

function getMasterAvailabilityRules() {
  const saved = JSON.parse(localStorage.getItem("questhubMasterAvailability") || "null");

  if (Array.isArray(saved) && saved.length) return saved;

  const defaults = getDefaultMasterAvailability();
  localStorage.setItem("questhubMasterAvailability", JSON.stringify(defaults));
  return defaults;
}

function getAvailabilityForMaster(masterId) {
  return getMasterAvailabilityRules().filter(rule => Number(rule.masterId) === Number(masterId));
}

function getBookings() {
  return JSON.parse(localStorage.getItem("questhubBookings") || "[]");
}

function hasBookingOverlap(masterId, date, startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  return getBookings().some(booking => {
    if (Number(booking.masterId) !== Number(masterId)) return false;
    if (booking.date !== date) return false;
    if (booking.status === "Rifiutata") return false;

    const bookingStart = timeToMinutes(booking.startTime || booking.time);
    const bookingEnd = timeToMinutes(booking.endTime || minutesToTime(bookingStart + (booking.durationMinutes || 120)));

    return start < bookingEnd && end > bookingStart;
  });
}

function getDaySlots(story, date) {
  const duration = getStoryDurationMinutes(story);
  const step = duration;
  const rules = getAvailabilityForMaster(story.masterId).filter(rule => Number(rule.weekday) === date.getDay());
  const dateIso = formatISODate(date);
  const slots = [];
  const seen = new Set();

  rules.forEach(rule => {
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);

    for (let current = start; current + duration <= end; current += step) {
      const startTime = minutesToTime(current);
      const endTime = minutesToTime(current + duration);
      const key = `${dateIso}-${startTime}-${endTime}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const occupied = hasBookingOverlap(story.masterId, dateIso, startTime, endTime);

      slots.push({
        date: dateIso,
        startTime,
        endTime,
        durationMinutes: duration,
        occupied
      });
    }
  });

  return slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function renderBookingCalendar(story = currentStory) {
  const container = document.getElementById("bookingCalendar");
  if (!container || !story) return;

  const baseDate = addDays(new Date(), bookingCalendarOffsetDays);
  const days = Array.from({ length: 4 }, (_, index) => addDays(baseDate, index));
  const slotsByDay = days.map(day => ({ day, slots: getDaySlots(story, day) }));
  const allTimes = Array.from(new Set(slotsByDay.flatMap(item => item.slots.map(slot => slot.startTime)))).sort();
  const visibleTimes = bookingCalendarExpanded ? allTimes : allTimes.slice(0, 5);

  if (!allTimes.length) {
    container.innerHTML = `
      <div class="booking-calendar-empty">
        <p>Nessuna disponibilità nei prossimi giorni mostrati.</p>
        <button class="light" onclick="shiftBookingCalendar(4)">Mostra giorni successivi</button>
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
}

function updateSelectedSlotLabel() {
  const label = document.getElementById("bookingSelectedSlotLabel");
  if (!label) return;

  if (!selectedBookingSlot) {
    label.textContent = "Nessuno slot selezionato.";
    return;
  }

  label.textContent = `Slot selezionato: ${formatLongItalianDate(selectedBookingSlot.date)}, ${selectedBookingSlot.startTime}–${selectedBookingSlot.endTime}`;
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
  if (!currentStory || !currentMaster) return;

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

  if (hasBookingOverlap(currentStory.masterId, selectedBookingSlot.date, selectedBookingSlot.startTime, selectedBookingSlot.endTime)) {
    showToast("Questo slot è appena stato occupato. Scegli un altro orario.", "warning");
    renderBookingCalendar(currentStory);
    return;
  }

  const bookings = getBookings();
  const booking = {
    id: Date.now(),
    storyId: currentStory.id,
    masterId: currentStory.masterId,
    story: currentStory.title,
    master: currentMaster.name,
    group,
    date: selectedBookingSlot.date,
    time: selectedBookingSlot.startTime,
    startTime: selectedBookingSlot.startTime,
    endTime: selectedBookingSlot.endTime,
    durationMinutes: getStoryDurationMinutes(currentStory),
    players,
    message,
    status: "In attesa"
  };

  bookings.push(booking);
  localStorage.setItem("questhubBookings", JSON.stringify(bookings));

  const notice = document.getElementById("bookNotice");
  if (notice) notice.style.display = "block";

  document.getElementById("bookingGroup").value = "";
  document.getElementById("bookingPlayers").value = "";
  document.getElementById("bookingMessage").value = "";
  selectedBookingSlot = null;

  renderBookingCalendar(currentStory);
  updateSelectedSlotLabel();

  showToast("Richiesta di prenotazione inviata al Master.", "success");
  addNotification(`Richiesta di prenotazione inviata per "${currentStory.title}".`, "success");
  await notifyMasterBookingEmail(booking);
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
            <p><strong>Data:</strong> ${booking.date} · ${booking.startTime || booking.time}${booking.endTime ? `–${booking.endTime}` : ""}</p>
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

function getJoinedOpenSessions() {
  return JSON.parse(localStorage.getItem("questhubJoinedOpenSessions") || "[]");
}

function saveJoinedOpenSessions(ids) {
  localStorage.setItem("questhubJoinedOpenSessions", JSON.stringify(ids));
}

function hasJoinedOpenSession(storyId) {
  return getJoinedOpenSessions().includes(Number(storyId));
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

  const joined = hasJoinedOpenSession(story.id);

  container.innerHTML = `
    <p><strong>${session.joined} / ${session.maxPlayers}</strong> giocatori iscritti</p>
    <p>Minimo per partire: ${session.minPlayers}</p>
    <p><strong>${joined ? "Ti sei già unito a questa sessione" : status}</strong></p>
  `;
}

function getOpenSessionStories() {
  return getAllStories().filter(story => story.type === "Con Master");
}

function renderOpenSessions() {
  const containers = document.querySelectorAll("[data-open-sessions-list]");
  const count = document.getElementById("openSessionsCount");
  if (!containers.length) return;

  const sessions = getJoinSessions();
  const joinedIds = getJoinedOpenSessions();
  const allOpenStories = getOpenSessionStories();
  const visibleOpenStories = allOpenStories.filter(story => !joinedIds.includes(Number(story.id)));

  if (count) {
    count.textContent = visibleOpenStories.length === 1
      ? "1 sessione aperta"
      : `${visibleOpenStories.length} sessioni aperte`;
  }

  function buildHtml(stories, isMasterView = false) {
    return stories.length
      ? stories.map(story => {
          const session = sessions[story.id] || { joined: 0, minPlayers: 2, maxPlayers: 6 };
          const genreClass = getGenreClass(story.genre);
          const status = session.joined >= session.maxPlayers
            ? "Completa"
            : session.joined >= session.minPlayers
              ? "Pronta a partire"
              : "In attesa di giocatori";
          const coverStyle = story.cover ? `style="background-image:url('${story.cover}')"` : "";
          const alreadyJoined = joinedIds.includes(Number(story.id));

          return `
            <div class="card open-session-card ${alreadyJoined ? "joined" : ""}">
              <div class="open-session-cover ${genreClass}" ${coverStyle}></div>
              <div class="open-session-content">
                <span class="tag ${genreClass}">${story.genre}</span>
                <h3>${story.title}</h3>
                <p>${story.desc}</p>
                <div class="open-session-meta">
                  <span><strong>Master:</strong> ${story.master}</span>
                  <span><strong>Durata:</strong> ${story.duration}</span>
                  <span><strong>Posti:</strong> ${session.joined} / ${session.maxPlayers}</span>
                  <span><strong>Stato:</strong> ${alreadyJoined ? "Già unito" : status}</span>
                </div>
                <div class="open-session-actions">
                  <button class="light" onclick="openStory(${story.id})">Vedi storia</button>
                  ${isMasterView ? "" : alreadyJoined ? `<button class="light" onclick="openStory(${story.id})">Già unito</button>` : `<button class="primary" onclick="joinOpenSession(${story.id})">Unisciti</button>`}
                </div>
              </div>
            </div>
          `;
        }).join("")
      : "<p>Non ci sono sessioni aperte al momento.</p>";
  }

  containers.forEach(container => {
    const isMasterView = Boolean(container.closest("#area-master"));
    container.innerHTML = buildHtml(isMasterView ? allOpenStories : visibleOpenStories, isMasterView);
  });
}

function joinOpenSession(storyId) {
  const profile = getUserProfile();

  if (!profile.email) {
    showToast("Devi accedere per unirti a una sessione.", "warning");
    go("login");
    return;
  }

  const story = getAllStories().find(item => Number(item.id) === Number(storyId));
  if (!story) return;

  if (hasJoinedOpenSession(story.id)) {
    showToast("Ti sei già unito a questa storia.", "success");
    openStory(story.id);
    return;
  }

  const sessions = getJoinSessions();

  if (!sessions[story.id]) {
    sessions[story.id] = { joined: 0, minPlayers: 2, maxPlayers: 6 };
  }

  const session = sessions[story.id];

  if (session.joined >= session.maxPlayers) {
    showToast("Gruppo già completo.", "warning");
    return;
  }

  session.joined += 1;
  localStorage.setItem("questhubJoinSessions", JSON.stringify(sessions));

  const joined = getJoinedOpenSessions();
  joined.push(Number(story.id));
  saveJoinedOpenSessions(Array.from(new Set(joined)));

  addNotification(`Ti sei unito alla sessione pubblica: ${story.title}`, "success");
  showToast("Ti sei unito a questa storia.", "success");

  if (session.joined >= session.minPlayers) {
    addNotification(`La sessione "${story.title}" è pronta a partire.`, "success");
  }

  renderOpenSessions();
  openStory(story.id);
}

function joinPublicSession() {
  if (!currentStory) return;
  joinOpenSession(currentStory.id);
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

  document.querySelectorAll("#crea-storia input, #crea-storia textarea, #crea-storia select, #dashboard input, #dashboard textarea, #dashboard select")
    .forEach(field => field.value = "");

  const materialsBuilder = document.getElementById("materialsBuilder");
  if (materialsBuilder) materialsBuilder.innerHTML = "";

  togglePriceField();
  renderDashboardStats();
  renderFeatured();
  renderCatalog();
}

function renderDashboardStats() {
  const storiesCount = document.getElementById("dashboardStoriesCount");
  if (!storiesCount) return;

  const totalStories = getAllStories().length;

  storiesCount.textContent = totalStories === 1
    ? "1 storia attiva"
    : totalStories + " storie attive";
}


/* MASTER AVAILABILITY */

function getWeekdayLabel(weekday) {
  return ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"][Number(weekday)] || "Giorno";
}

function renderMasterAvailability() {
  const container = document.getElementById("masterAvailabilityList");
  if (!container) return;

  const rules = getAvailabilityForMaster(1).sort((a, b) => Number(a.weekday) - Number(b.weekday) || a.startTime.localeCompare(b.startTime));

  container.innerHTML = rules.length
    ? rules.map(rule => `
        <div class="availability-row">
          <div>
            <strong>${getWeekdayLabel(rule.weekday)}</strong>
            <span>${rule.startTime}–${rule.endTime}</span>
          </div>
          <button class="light" type="button" onclick="removeMasterAvailability(${rule.id})">Rimuovi</button>
        </div>
      `).join("")
    : "<p>Non hai ancora impostato disponibilità.</p>";
}

function addMasterAvailability() {
  const weekday = document.getElementById("availabilityWeekday")?.value;
  const startTime = document.getElementById("availabilityStart")?.value;
  const endTime = document.getElementById("availabilityEnd")?.value;

  if (!weekday || !startTime || !endTime) {
    showToast("Completa giorno, ora inizio e ora fine.", "warning");
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast("L'orario di fine deve essere dopo l'inizio.", "warning");
    return;
  }

  const rules = getMasterAvailabilityRules();
  rules.push({
    id: Date.now(),
    masterId: 1,
    weekday: Number(weekday),
    startTime,
    endTime
  });

  localStorage.setItem("questhubMasterAvailability", JSON.stringify(rules));
  renderMasterAvailability();
  renderBookingCalendar(currentStory);
  showToast("Disponibilità aggiunta.", "success");
}

function removeMasterAvailability(id) {
  const rules = getMasterAvailabilityRules().filter(rule => Number(rule.id) !== Number(id));
  localStorage.setItem("questhubMasterAvailability", JSON.stringify(rules));
  renderMasterAvailability();
  renderBookingCalendar(currentStory);
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
          <p><strong>Data:</strong> ${booking.date} · ${booking.startTime || booking.time}${booking.endTime ? `–${booking.endTime}` : ""}</p>
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

function saveNotifications(notifications) {
  localStorage.setItem("questhubNotifications", JSON.stringify(notifications));
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

  saveNotifications(notifications);
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

function markNotificationsAsRead(showMessage = false) {
  const notifications = getNotifications();
  const hasUnread = notifications.some(notification => !notification.read);

  if (!hasUnread) return;

  const updated = notifications.map(notification => ({
    ...notification,
    read: true
  }));

  saveNotifications(updated);
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

function handleNotificationItemClick(notificationId) {
  closeNotificationsDropdown(true);
}

function renderNotificationsPreview() {
  const container = document.getElementById("notificationsPreview");
  if (!container) return;

  const notifications = getNotifications().slice(0, 5);

  container.innerHTML = notifications.length
    ? notifications.map(notification => `
        <button type="button" class="notification-preview-item ${notification.read ? "read" : "unread"}" onclick="handleNotificationItemClick(${notification.id})">
          <p><strong>${notification.message}</strong></p>
          <small>${notification.date}</small>
        </button>
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

  go("crea-storia");
}

function toggleUserMenu(event) {
  if (event) event.stopPropagation();

  const profile = getUserProfile();
  if (!profile.email) return;

  const menu = document.getElementById("userDropdown");
  const chip = document.getElementById("headerUserChip");
  if (!menu) return;

  menu.classList.toggle("open");
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
    }
  });
}

setupGlobalUiHandlers();
renderUserReviews();
loadSections();
