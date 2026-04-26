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
  "login"
];

async function loadSections() {
  const app = document.getElementById("app");

  for (const section of sections) {
    const response = await fetch(`sections/${section}.html`);
    const html = await response.text();
    app.insertAdjacentHTML("beforeend", html);
  }

renderFeatured();
go("home");
setupLanguageSwitcher();
applyTranslations();
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
}

function card(story) {
  const priceLabel = story.isFree || Number(story.price) === 0
    ? `<span class="story-price-free">Gratis</span>`
    : `<span class="story-price-paid">${story.price}€</span>`;

  return `
    <div class="card story" onclick="openStory(${story.id})">
      <span class="tag">${story.genre}</span>
      <span class="tag gold">${story.type}</span>
      <h2>${story.title}</h2>
      <p>${story.desc}</p>
      <strong>${story.players} giocatori · ${priceLabel}</strong>
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
    container.innerHTML = `
      <div class="locked-box">
        🔒 Questa storia non ha ancora materiali caricati.
      </div>
    `;
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

            <button class="primary" onclick="updateBookingStatus(${booking.id}, 'Accettata')">
              Accetta
            </button>

            <button class="light" onclick="updateBookingStatus(${booking.id}, 'Rifiutata')">
              Rifiuta
            </button>
          </div>
        `;
      }).join("")
    : "<p>Nessuna richiesta di prenotazione al momento.</p>";
}

function updateBookingStatus(id, status) {
  const bookings = JSON.parse(localStorage.getItem("questhubBookings") || "[]");

  const updatedBookings = bookings.map(booking => {
    if (booking.id === id) {
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
  }

  if (status === "Rifiutata") {
    showToast("Prenotazione rifiutata.", "error");
  }
}

function unlockStoryById(storyId) {
  const unlockedStories = getUnlockedStories();

  if (!unlockedStories.includes(storyId)) {
    unlockedStories.push(storyId);
  }

  localStorage.setItem("questhubUnlockedStories", JSON.stringify(unlockedStories));
}

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

    <button class="light" type="button" onclick="this.parentElement.remove()">
      Rimuovi materiale
    </button>
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

function saveUserProfile() {
  const name = document.getElementById("profileName")?.value || "";
  const email = document.getElementById("profileEmail")?.value || "";
  const language = document.getElementById("profileLanguage")?.value || "Italiano";

  if (!name || !email) {
    showToast("Inserisci nome ed email.", "warning");
    return;
  }

  const profile = {
    name,
    email,
    language,
    isMaster: getUserProfile().isMaster || false
  };

  localStorage.setItem("questhubUserProfile", JSON.stringify(profile));
  showToast("Profilo salvato.", "success");
}

function renderUserProfile() {
  const profile = getUserProfile();

  const name = document.getElementById("profileName");
  const email = document.getElementById("profileEmail");
  const language = document.getElementById("profileLanguage");
  const status = document.getElementById("masterModeStatus");

  if (name) name.value = profile.name || "";
  if (email) email.value = profile.email || "";
  if (language) language.value = profile.language || "Italiano";

  if (status) {
    status.style.display = profile.isMaster ? "block" : "none";
  }
}

function activateMasterMode() {
  const profile = getUserProfile();

  const updatedProfile = {
    ...profile,
    isMaster: true
  };

  localStorage.setItem("questhubUserProfile", JSON.stringify(updatedProfile));

  const status = document.getElementById("masterModeStatus");
  if (status) status.style.display = "block";

  showToast("Modalità Master attivata.", "success");
}

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
          <button class="primary" onclick="openStory(${story.id})">
            Apri storia
          </button>
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
function getCurrentLanguage() {
  return localStorage.getItem("questhubLanguage") || "it";
}

function applyTranslations() {
  const language = getCurrentLanguage();
  const dictionary = translations[language] || translations.it;

  document.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.getAttribute("data-i18n");

    if (dictionary[key]) {
      element.textContent = dictionary[key];
    }
  });

  const switcher = document.getElementById("languageSwitcher");
  if (switcher) {
    switcher.value = language;
  }
}

function setupLanguageSwitcher() {
  const switcher = document.getElementById("languageSwitcher");

  if (!switcher) return;

  switcher.value = getCurrentLanguage();

  switcher.addEventListener("change", function () {
    localStorage.setItem("questhubLanguage", switcher.value);
    applyTranslations();
  });
}
loadSections();