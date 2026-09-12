const input = document.getElementById("photoInput");
const gallery = document.getElementById("gallery");
const empty = document.getElementById("empty");
const clearBtn = document.getElementById("clearBtn");
const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const closeViewer = document.getElementById("closeViewer");

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
    tx.objectStore(STORE).add({ blob: file, name: file.name, created: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.created - a.created));
    req.onerror = () => reject(req.error);
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

async function render() {
  const photos = await getPhotos();
  gallery.innerHTML = "";
  empty.style.display = photos.length ? "none" : "block";

  photos.forEach(photo => {
    const url = URL.createObjectURL(photo.blob);
    const card = document.createElement("div");
    card.className = "photo";
    card.innerHTML = `
      <img src="${url}" alt="${photo.name}">
      <button class="delete" title="Delete">×</button>
    `;
    card.querySelector("img").onclick = () => {
      viewerImg.src = url;
      viewer.classList.remove("hidden");
    };
    card.querySelector(".delete").onclick = async (e) => {
      e.stopPropagation();
      await deletePhoto(photo.id);
      URL.revokeObjectURL(url);
      render();
    };
    gallery.appendChild(card);
  });
}

input.addEventListener("change", async () => {
  for (const file of input.files) {
    if (file.type.startsWith("image/")) await addPhoto(file);
  }
  input.value = "";
  render();
});

clearBtn.onclick = async () => {
  if (confirm("Delete all photos from this gallery?")) {
    await clearPhotos();
    render();
  }
};

closeViewer.onclick = () => viewer.classList.add("hidden");
viewer.onclick = (e) => {
  if (e.target === viewer) viewer.classList.add("hidden");
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

render();
