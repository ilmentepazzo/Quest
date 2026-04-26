function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const home = document.getElementById('home');
  if (home) home.classList.remove('active');

  const selected = document.getElementById(page);
  if (selected) selected.classList.add('active');

  window.scrollTo(0, 0);

  if (page === 'catalogo') {
    renderCatalog();
  }
}

function card(story) {
  return `
    <div class="card story" onclick="openStory(${story.id})">
      <span class="tag">${story.genre}</span>
      <span class="tag gold">${story.type}</span>

      <h2>${story.title}</h2>

      <p>${story.desc}</p>

      <strong>
        ${story.players} giocatori · ${story.price}€
      </strong>
    </div>
  `;
}

function renderFeatured() {
  const container = document.getElementById('featured');
  if (!container) return;

  container.innerHTML = storiesData
    .slice(0, 3)
    .map(card)
    .join('');
}

function renderCatalog() {
  const container = document.getElementById('stories');
  const count = document.getElementById('count');

  if (!container || !count) return;

  container.innerHTML = storiesData.map(card).join('');
  count.textContent = storiesData.length + " storie trovate";
}

function openStory(id) {
  const story = storiesData.find(s => s.id === id);
  if (!story) return;

  document.getElementById('detailTags').innerHTML = `
    <span class="tag">${story.genre}</span>
    <span class="tag gold">${story.type}</span>
  `;

  document.getElementById('detailTitle').textContent = story.title;
  document.getElementById('detailDesc').textContent = story.desc;
  document.getElementById('detailLong').textContent = story.long;
  document.getElementById('detailDuration').textContent = story.duration;
  document.getElementById('detailPlayers').textContent = story.players;
  document.getElementById('detailLevel').textContent = story.level;
  document.getElementById('detailMode').textContent = story.mode;
  document.getElementById('detailPrice').textContent = story.price + "€";
  document.getElementById('detailMaster').textContent = story.master;

  document.getElementById('detailAction').textContent =
    story.type === "Con Master"
      ? "Prenota una sessione guidata."
      : "Acquista e gioca in autonomia.";

  go('scheda');
}

function notice(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = "block";
  }
}

function searchHome() {
  go('catalogo');
}

renderFeatured();// Logica principale dell'app QuestHub