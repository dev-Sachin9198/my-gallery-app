// ---------- Elements ----------
const input = document.getElementById("photoInput");
const gallery = document.getElementById("gallery");
const empty = document.getElementById("empty");
const noResults = document.getElementById("noResults");
const clearBtn = document.getElementById("clearBtn");
const statsEl = document.getElementById("stats");
const themeBtn = document.getElementById("themeBtn");

const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const favFilterBtn = document.getElementById("favFilterBtn");
const selectBtn = document.getElementById("selectBtn");

const bulkBar = document.getElementById("bulkBar");
const selectCount = document.getElementById("selectCount");
const bulkDownload = document.getElementById("bulkDownload");
const bulkDelete = document.getElementById("bulkDelete");
const bulkCancel = document.getElementById("bulkCancel");

const dropzone = document.getElementById("dropzone");

const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const closeViewer = document.getElementById("closeViewer");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const viewerFav = document.getElementById("viewerFav");
const viewerDownload = document.getElementById("viewerDownload");
const viewerDelete = document.getElementById("viewerDelete");
const tagChips = document.getElementById("tagChips");
const tagInput = document.getElementById("tagInput");

// ---------- DB ----------
const DB_NAME = "MyGalleryDB";
const STORE = "photos";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(file) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ blob: file, name: file.name, created: Date.now(), favorite: false, tags: [] });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.map(p => ({ favorite: false, tags: [], ...p })));
    req.onerror = () => reject(req.error);
  });
}

async function putPhoto(photo) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(photo);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- State ----------
let allPhotos = [];       // everything from DB
let viewPhotos = [];      // filtered + sorted, what's currently shown
let objectUrls = new Map(); // id -> object URL cache
let selectMode = false;
let selectedIds = new Set();
let favOnly = false;
let currentViewerId = null;

// ---------- Helpers ----------
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function urlFor(photo) {
  if (!objectUrls.has(photo.id)) {
    objectUrls.set(photo.id, URL.createObjectURL(photo.blob));
  }
  return objectUrls.get(photo.id);
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  let list = allPhotos.slice();

  if (favOnly) list = list.filter(p => p.favorite);

  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  const sortMode = sortSelect.value;
  if (sortMode === "newest") list.sort((a, b) => b.created - a.created);
  else if (sortMode === "oldest") list.sort((a, b) => a.created - b.created);
  else if (sortMode === "name") list.sort((a, b) => a.name.localeCompare(b.name));

  viewPhotos = list;
}

function updateStats() {
  const totalBytes = allPhotos.reduce((sum, p) => sum + (p.blob.size || 0), 0);
  const favCount = allPhotos.filter(p => p.favorite).length;
  if (!allPhotos.length) {
    statsEl.textContent = "No photos yet.";
  } else {
    statsEl.textContent = `${allPhotos.length} photo${allPhotos.length === 1 ? "" : "s"} · ${favCount} favorite${favCount === 1 ? "" : "s"} · ${formatBytes(totalBytes)}`;
  }
}

function updateBulkBar() {
  bulkBar.classList.toggle("hidden", !selectMode);
  selectCount.textContent = `${selectedIds.size} selected`;
}

// ---------- Render ----------
async function refreshData() {
  allPhotos = await getPhotos();
  applyFilters();
}

function render() {
  gallery.innerHTML = "";
  const hasAny = allPhotos.length > 0;
  const hasResults = viewPhotos.length > 0;

  empty.style.display = hasAny ? "none" : "block";
  noResults.classList.toggle("hidden", hasAny ? hasResults : true);

  viewPhotos.forEach(photo => {
    const url = urlFor(photo);
    const card = document.createElement("div");
    card.className = "photo";
    if (selectMode && selectedIds.has(photo.id)) card.classList.add("selected");

    card.innerHTML = `
      <img src="${url}" alt="${photo.name}" loading="lazy">
      ${photo.favorite ? '<span class="fav-badge">★</span>' : ""}
      ${selectMode
        ? `<span class="select-check">${selectedIds.has(photo.id) ? "✓" : ""}</span>`
        : `<button class="delete" title="Delete">×</button>`}
    `;

    card.querySelector("img").onclick = () => {
      if (selectMode) {
        toggleSelect(photo.id);
      } else {
        openViewer(photo.id);
      }
    };

    if (selectMode) {
      card.onclick = () => toggleSelect(photo.id);
    } else {
      const delBtn = card.querySelector(".delete");
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await deletePhoto(photo.id);
        revokeUrl(photo.id);
        await refreshData();
        render();
        updateStats();
      };
    }

    gallery.appendChild(card);
  });

  updateBulkBar();
}

function revokeUrl(id) {
  if (objectUrls.has(id)) {
    URL.revokeObjectURL(objectUrls.get(id));
    objectUrls.delete(id);
  }
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

async function refreshAndRender() {
  await refreshData();
  render();
  updateStats();
}

// ---------- Upload ----------
async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  for (const file of files) await addPhoto(file);
  await refreshAndRender();
}

input.addEventListener("change", () => {
  handleFiles(input.files);
  input.value = "";
});

// Drag & drop
let dragCounter = 0;
["dragenter", "dragover"].forEach(evt => {
  window.addEventListener(evt, (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      dragCounter++;
      dropzone.classList.remove("hidden");
    }
  });
});
["dragleave", "drop"].forEach(evt => {
  window.addEventListener(evt, (e) => {
    if (evt === "dragleave") {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) dropzone.classList.add("hidden");
    }
  });
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.add("hidden");
  if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// Paste from clipboard
window.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.files;
  if (items && items.length) handleFiles(items);
});

// ---------- Toolbar ----------
searchInput.addEventListener("input", () => { applyFilters(); render(); });
sortSelect.addEventListener("change", () => { applyFilters(); render(); });

favFilterBtn.onclick = () => {
  favOnly = !favOnly;
  favFilterBtn.classList.toggle("active", favOnly);
  applyFilters();
  render();
};

selectBtn.onclick = () => {
  selectMode = !selectMode;
  selectedIds.clear();
  selectBtn.classList.toggle("active", selectMode);
  render();
};

bulkCancel.onclick = () => {
  selectMode = false;
  selectedIds.clear();
  selectBtn.classList.remove("active");
  render();
};

bulkDelete.onclick = async () => {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} photo(s)?`)) return;
  for (const id of selectedIds) {
    await deletePhoto(id);
    revokeUrl(id);
  }
  selectedIds.clear();
  selectMode = false;
  selectBtn.classList.remove("active");
  await refreshAndRender();
};

bulkDownload.onclick = () => {
  viewPhotos.filter(p => selectedIds.has(p.id)).forEach(p => downloadPhoto(p));
};

function downloadPhoto(photo) {
  const url = urlFor(photo);
  const a = document.createElement("a");
  a.href = url;
  a.download = photo.name || `photo-${photo.id}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

clearBtn.onclick = async () => {
  if (confirm("Delete all photos from this gallery?")) {
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls.clear();
    await clearPhotos();
    await refreshAndRender();
  }
};

// ---------- Theme ----------
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("gallery-theme", theme);
}
themeBtn.onclick = () => {
  applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
};
applyTheme(localStorage.getItem("gallery-theme") || "light");

// ---------- Viewer ----------
function openViewer(id) {
  currentViewerId = id;
  showCurrentInViewer();
  viewer.classList.remove("hidden");
}

function getViewerPhoto() {
  return viewPhotos.find(p => p.id === currentViewerId) || allPhotos.find(p => p.id === currentViewerId);
}

function showCurrentInViewer() {
  const photo = getViewerPhoto();
  if (!photo) { closeTheViewer(); return; }
  viewerImg.src = urlFor(photo);
  viewerImg.classList.remove("zoomed");
  viewerFav.textContent = photo.favorite ? "★" : "☆";
  viewerFav.classList.toggle("active", photo.favorite);
  renderTagChips(photo);
}

function renderTagChips(photo) {
  tagChips.innerHTML = "";
  (photo.tags || []).forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    const x = document.createElement("button");
    x.textContent = "×";
    x.onclick = async () => {
      photo.tags = photo.tags.filter(t => t !== tag);
      await putPhoto(photo);
      await refreshData();
      renderTagChips(getViewerPhoto());
      render();
    };
    chip.appendChild(x);
    tagChips.appendChild(chip);
  });
}

tagInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && tagInput.value.trim()) {
    const photo = getViewerPhoto();
    const tag = tagInput.value.trim();
    if (!photo.tags.includes(tag)) photo.tags.push(tag);
    await putPhoto(photo);
    tagInput.value = "";
    await refreshData();
    renderTagChips(getViewerPhoto());
    render();
  }
});

function closeTheViewer() {
  viewer.classList.add("hidden");
  currentViewerId = null;
}
closeViewer.onclick = closeTheViewer;
viewer.addEventListener("click", (e) => {
  if (e.target === viewer) closeTheViewer();
});

function stepViewer(delta) {
  const idx = viewPhotos.findIndex(p => p.id === currentViewerId);
  if (idx === -1) return;
  const nextIdx = (idx + delta + viewPhotos.length) % viewPhotos.length;
  currentViewerId = viewPhotos[nextIdx].id;
  showCurrentInViewer();
}
prevBtn.onclick = () => stepViewer(-1);
nextBtn.onclick = () => stepViewer(1);

viewerImg.addEventListener("dblclick", () => viewerImg.classList.toggle("zoomed"));

viewerFav.onclick = async () => {
  const photo = getViewerPhoto();
  photo.favorite = !photo.favorite;
  await putPhoto(photo);
  await refreshData();
  showCurrentInViewer();
  render();
  updateStats();
};

viewerDownload.onclick = () => downloadPhoto(getViewerPhoto());

viewerDelete.onclick = async () => {
  const photo = getViewerPhoto();
  if (!confirm("Delete this photo?")) return;
  await deletePhoto(photo.id);
  revokeUrl(photo.id);
  await refreshData();
  if (viewPhotos.length === 0) {
    closeTheViewer();
  } else {
    const idx = Math.min(allPhotos.length - 1, 0);
    currentViewerId = viewPhotos[0] ? viewPhotos[0].id : null;
    if (currentViewerId === null) closeTheViewer();
    else showCurrentInViewer();
  }
  render();
  updateStats();
};

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (viewer.classList.contains("hidden")) return;
  if (e.key === "Escape") closeTheViewer();
  else if (e.key === "ArrowLeft") stepViewer(-1);
  else if (e.key === "ArrowRight") stepViewer(1);
  else if (e.key.toLowerCase() === "f") viewerFav.onclick();
});

// Touch swipe
let touchStartX = null;
viewer.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; });
viewer.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) stepViewer(dx > 0 ? -1 : 1);
  touchStartX = null;
});

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

// ---------- Init ----------
refreshAndRender();
