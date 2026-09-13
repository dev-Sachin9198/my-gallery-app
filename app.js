// ---------- Elements ----------
const input = document.getElementById("photoInput");
const gallery = document.getElementById("gallery");
const folderGrid = document.getElementById("folderGrid");
const empty = document.getElementById("empty");
const noResults = document.getElementById("noResults");
const clearBtn = document.getElementById("clearBtn");
const statsEl = document.getElementById("stats");
const themeBtn = document.getElementById("themeBtn");

const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const favFilterBtn = document.getElementById("favFilterBtn");
const selectBtn = document.getElementById("selectBtn");
const viewModeBtn = document.getElementById("viewModeBtn");

const breadcrumb = document.getElementById("breadcrumb");
const newAlbumBtn = document.getElementById("newAlbumBtn");

const bulkBar = document.getElementById("bulkBar");
const selectCount = document.getElementById("selectCount");
const bulkMove = document.getElementById("bulkMove");
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
const viewerMove = document.getElementById("viewerMove");
const viewerDownload = document.getElementById("viewerDownload");
const viewerDelete = document.getElementById("viewerDelete");
const tagChips = document.getElementById("tagChips");
const tagInput = document.getElementById("tagInput");

const albumPicker = document.getElementById("albumPicker");
const albumPickerList = document.getElementById("albumPickerList");
const albumPickerCancel = document.getElementById("albumPickerCancel");

// ---------- DB ----------
const DB_NAME = "MyGalleryDB";
const STORE = "photos";
const ALBUM_STORE = "albums";
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(ALBUM_STORE)) {
        db.createObjectStore(ALBUM_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(file, albumId, order) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({
      blob: file, name: file.name, created: Date.now(),
      favorite: false, tags: [], albumId: albumId ?? null, order: order ?? Date.now()
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.map(p => ({
      favorite: false, tags: [], albumId: null, order: p.created, ...p
    })));
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

// ---------- Albums DB ----------
async function getAlbums() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ALBUM_STORE, "readonly").objectStore(ALBUM_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addAlbum(name, parentId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, "readwrite");
    tx.objectStore(ALBUM_STORE).add({ name, parentId: parentId ?? null, created: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function putAlbum(album) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, "readwrite");
    tx.objectStore(ALBUM_STORE).put(album);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteAlbumRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, "readwrite");
    tx.objectStore(ALBUM_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- State ----------
let allPhotos = [];
let allAlbums = [];
let viewPhotos = [];        // filtered + sorted, what's currently shown (grid mode)
let objectUrls = new Map();
let selectMode = false;
let selectedIds = new Set();
let favOnly = false;
let currentViewerId = null;
let currentAlbumId = null;  // null = root
let viewMode = "grid";      // "grid" | "timeline"
let draggedId = null;
let moveTargetIds = [];     // ids being moved via the album picker

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

function revokeUrl(id) {
  if (objectUrls.has(id)) {
    URL.revokeObjectURL(objectUrls.get(id));
    objectUrls.delete(id);
  }
}

function albumById(id) {
  return allAlbums.find(a => a.id === id) || null;
}

function childAlbums(parentId) {
  return allAlbums.filter(a => (a.parentId ?? null) === (parentId ?? null));
}

function albumDepth(id, depth = 0) {
  const a = albumById(id);
  if (!a || a.parentId == null) return depth;
  return albumDepth(a.parentId, depth + 1);
}

function matchesFilters(p, q) {
  if (favOnly && !p.favorite) return false;
  if (q && !(p.name.toLowerCase().includes(q) || (p.tags || []).some(t => t.toLowerCase().includes(q)))) return false;
  return true;
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  let list;

  if (viewMode === "timeline") {
    // Timeline ignores folder scoping — shows everything matching search/favorites.
    list = allPhotos.filter(p => matchesFilters(p, q));
    list.sort((a, b) => b.created - a.created);
  } else {
    list = allPhotos.filter(p => (p.albumId ?? null) === currentAlbumId && matchesFilters(p, q));
    const sortMode = sortSelect.value;
    if (sortMode === "newest") list.sort((a, b) => b.created - a.created);
    else if (sortMode === "oldest") list.sort((a, b) => a.created - b.created);
    else if (sortMode === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === "custom") list.sort((a, b) => a.order - b.order);
  }

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

// ---------- Data refresh ----------
async function refreshData() {
  allPhotos = await getPhotos();
  allAlbums = await getAlbums();
  applyFilters();
}

async function refreshAndRender() {
  await refreshData();
  render();
  updateStats();
}

// ---------- Breadcrumb ----------
function renderBreadcrumb() {
  breadcrumb.innerHTML = "";
  newAlbumBtn.style.display = viewMode === "timeline" ? "none" : "";
  if (viewMode === "timeline") {
    breadcrumb.innerHTML = `<span>Timeline (all photos)</span>`;
    return;
  }

  const chain = [];
  let id = currentAlbumId;
  while (id != null) {
    const a = albumById(id);
    if (!a) break;
    chain.unshift(a);
    id = a.parentId;
  }

  const homeBtn = document.createElement("button");
  homeBtn.textContent = "🏠 All Photos";
  homeBtn.onclick = () => { currentAlbumId = null; applyFilters(); render(); };
  breadcrumb.appendChild(homeBtn);

  chain.forEach(a => {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "/";
    breadcrumb.appendChild(sep);

    const btn = document.createElement("button");
    btn.textContent = a.name;
    btn.onclick = () => { currentAlbumId = a.id; applyFilters(); render(); };
    breadcrumb.appendChild(btn);
  });
}

// ---------- Folder tiles ----------
function renderFolders() {
  folderGrid.innerHTML = "";
  if (viewMode === "timeline") return;

  childAlbums(currentAlbumId).forEach(album => {
    const card = document.createElement("div");
    card.className = "folder-card";
    card.innerHTML = `
      <span class="icon">📁</span>
      <span class="name">${album.name}</span>
      <div class="folder-actions">
        <button class="rename" title="Rename">✎</button>
        <button class="del" title="Delete">×</button>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".folder-actions")) return;
      currentAlbumId = album.id;
      applyFilters();
      render();
    });
    card.querySelector(".rename").onclick = async (e) => {
      e.stopPropagation();
      const name = prompt("Rename album:", album.name);
      if (name && name.trim()) {
        album.name = name.trim();
        await putAlbum(album);
        await refreshAndRender();
      }
    };
    card.querySelector(".del").onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete album "${album.name}"? Photos inside will move up one level.`)) return;
      // Move photos in this album to its parent, reparent subalbums to its parent too.
      const photosInside = allPhotos.filter(p => p.albumId === album.id);
      for (const p of photosInside) { p.albumId = album.parentId ?? null; await putPhoto(p); }
      const subAlbums = childAlbums(album.id);
      for (const sub of subAlbums) { sub.parentId = album.parentId ?? null; await putAlbum(sub); }
      await deleteAlbumRecord(album.id);
      await refreshAndRender();
    };

    // Drop photos onto folder tiles to move them
    card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("drag-over"); });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (draggedId == null) return;
      const idsToMove = selectMode && selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId];
      for (const id of idsToMove) {
        const p = allPhotos.find(ph => ph.id === id);
        if (p) { p.albumId = album.id; await putPhoto(p); }
      }
      draggedId = null;
      await refreshAndRender();
    });

    folderGrid.appendChild(card);
  });
}

newAlbumBtn.onclick = async () => {
  const name = prompt("New album name:");
  if (name && name.trim()) {
    await addAlbum(name.trim(), currentAlbumId);
    await refreshAndRender();
  }
};

// ---------- View mode toggle ----------
viewModeBtn.onclick = () => {
  viewMode = viewMode === "grid" ? "timeline" : "grid";
  viewModeBtn.textContent = viewMode === "grid" ? "🕘 Timeline" : "🔳 Grid";
  viewModeBtn.classList.toggle("active", viewMode === "timeline");
  sortSelect.disabled = viewMode === "timeline";
  applyFilters();
  render();
};

// ---------- Card builder ----------
function buildPhotoCard(photo, allowDrag) {
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
    if (selectMode) toggleSelect(photo.id);
    else openViewer(photo.id);
  };

  if (selectMode) {
    card.onclick = () => toggleSelect(photo.id);
  } else {
    const delBtn = card.querySelector(".delete");
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await deletePhoto(photo.id);
      revokeUrl(photo.id);
      await refreshAndRender();
    };
  }

  if (allowDrag) {
    card.draggable = true;
    card.addEventListener("dragstart", () => { draggedId = photo.id; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); });
    card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("drag-over"); });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (draggedId == null || draggedId === photo.id) return;
      await reorderCustom(draggedId, photo.id);
      draggedId = null;
    });
  } else {
    // Still draggable so it can be dropped onto folder tiles to move albums.
    card.draggable = !selectMode;
    card.addEventListener("dragstart", () => { draggedId = photo.id; });
  }

  return card;
}

async function reorderCustom(fromId, toId) {
  const list = viewPhotos.slice();
  const fromIdx = list.findIndex(p => p.id === fromId);
  const toIdx = list.findIndex(p => p.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, moved);
  for (let i = 0; i < list.length; i++) {
    list[i].order = i;
    await putPhoto(list[i]);
  }
  await refreshAndRender();
}

// ---------- Timeline grouping ----------
function dateBucketLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const today = startOfDay(now);
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return "This week";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long" });
  }
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function renderTimeline() {
  const groups = new Map();
  viewPhotos.forEach(p => {
    const label = dateBucketLabel(p.created);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(p);
  });

  groups.forEach((photos, label) => {
    const section = document.createElement("div");
    section.className = "timeline-section";
    const heading = document.createElement("div");
    heading.className = "timeline-heading";
    heading.textContent = label;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "gallery";
    photos.forEach(p => grid.appendChild(buildPhotoCard(p, false)));
    section.appendChild(grid);

    gallery.appendChild(section);
  });
}

// ---------- Render ----------
function render() {
  gallery.innerHTML = "";
  renderBreadcrumb();
  renderFolders();

  const hasAny = allPhotos.length > 0;
  const hasFolders = viewMode === "grid" && childAlbums(currentAlbumId).length > 0;
  const hasResults = viewPhotos.length > 0 || hasFolders;

  empty.style.display = hasAny ? "none" : "block";
  noResults.classList.toggle("hidden", hasAny ? hasResults : true);

  if (viewMode === "timeline") {
    renderTimeline();
  } else {
    const allowDrag = sortSelect.value === "custom" && !selectMode;
    viewPhotos.forEach(photo => gallery.appendChild(buildPhotoCard(photo, allowDrag)));
  }

  updateBulkBar();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

// ---------- Upload ----------
async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  for (const file of files) await addPhoto(file, viewMode === "grid" ? currentAlbumId : null);
  await refreshAndRender();
}

input.addEventListener("change", () => {
  handleFiles(input.files);
  input.value = "";
});

// Drag & drop file upload
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
  window.addEventListener(evt, () => {
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
  allPhotos.filter(p => selectedIds.has(p.id)).forEach(p => downloadPhoto(p));
};

bulkMove.onclick = () => {
  if (!selectedIds.size) return;
  openAlbumPicker(Array.from(selectedIds));
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

// ---------- Album picker modal ----------
function openAlbumPicker(ids) {
  moveTargetIds = ids;
  albumPickerList.innerHTML = "";

  const rootBtn = document.createElement("button");
  rootBtn.textContent = "🏠 Unfiled (root)";
  rootBtn.onclick = () => applyMove(null);
  albumPickerList.appendChild(rootBtn);

  const addAlbumOption = (album, depth) => {
    const btn = document.createElement("button");
    btn.textContent = `${"—".repeat(depth)} 📁 ${album.name}`;
    btn.onclick = () => applyMove(album.id);
    albumPickerList.appendChild(btn);
    childAlbums(album.id).forEach(sub => addAlbumOption(sub, depth + 1));
  };
  childAlbums(null).forEach(a => addAlbumOption(a, 1));

  albumPicker.classList.remove("hidden");
}

async function applyMove(albumId) {
  for (const id of moveTargetIds) {
    const p = allPhotos.find(ph => ph.id === id);
    if (p) { p.albumId = albumId; await putPhoto(p); }
  }
  albumPicker.classList.add("hidden");
  moveTargetIds = [];
  await refreshAndRender();
}

albumPickerCancel.onclick = () => {
  albumPicker.classList.add("hidden");
  moveTargetIds = [];
};
albumPicker.addEventListener("click", (e) => {
  if (e.target === albumPicker) albumPickerCancel.onclick();
});

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

viewerMove.onclick = () => {
  const photo = getViewerPhoto();
  if (photo) openAlbumPicker([photo.id]);
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
