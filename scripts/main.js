const MODULE_ID = "auto-sound-import";
const AUDIO_RE = /\.(mp3|ogg|wav|flac|webm|m4a|opus)$/i;

const getFP = () => foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
const clean = p => decodeURIComponent(p.replace(/\/+$/, "").split("/").pop().replace(/\.[^.]+$/, ""));

let running = false;

async function walk(dir, volume, stats) {
  const { files, dirs } = await getFP().browse("data", dir);
  const audio = files.filter(f => AUDIO_RE.test(f));
  if (audio.length) {
    const name = clean(dir);
    let pl = game.playlists.getName(name);
    if (!pl) { pl = await Playlist.create({ name }); stats.playlists++; }
    const existing = new Set(pl.sounds.map(s => s.path));
    const toAdd = audio
      .filter(p => !existing.has(p))
      .map(path => ({ name: clean(path), path, volume }));
    if (toAdd.length) {
      await pl.createEmbeddedDocuments("PlaylistSound", toAdd);
      stats.sounds += toAdd.length;
    }
  }
  for (const d of dirs) await walk(d, volume, stats);
}

export async function runImport({ silent = false } = {}) {
  if (!game.user.isGM || running) return;
  running = true;
  const root = game.settings.get(MODULE_ID, "root").replace(/\/+$/, "");
  const volume = game.settings.get(MODULE_ID, "volume");
  const stats = { playlists: 0, sounds: 0 };
  try {
    await walk(root, volume, stats);
    if (!silent || stats.sounds) {
      ui.notifications.info(`Auto Sound Import : ${stats.sounds} son(s) ajouté(s).`);
    }
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    ui.notifications.error(`Auto Sound Import : impossible de lire "${root}" (voir console).`);
  } finally {
    running = false;
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "root", {
    name: "Dossier des sons",
    hint: "Chemin relatif à Data/. Les sous-dossiers deviennent des playlists.",
    scope: "world",
    config: true,
    type: String,
    default: "assets/sounds",
    filePicker: "folder"
  });
  game.settings.register(MODULE_ID, "auto", {
    name: "Import automatique au chargement",
    hint: "Lance l'import à chaque chargement du monde (MJ uniquement).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "volume", {
    name: "Volume par défaut",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.5
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { runImport };
  if (game.user.isGM && !game.macros.getName("Importer les sons")) {
    Macro.create({
      name: "Importer les sons",
      type: "script",
      img: "icons/svg/sound.svg",
      command: `game.modules.get("${MODULE_ID}").api.runImport();`
    });
  }
  const isActiveGM = game.users.activeGM ? game.user === game.users.activeGM : game.user.isGM;
  if (isActiveGM && game.settings.get(MODULE_ID, "auto")) runImport({ silent: true });
});

// Bouton dans l'onglet Playlists
Hooks.on("renderPlaylistDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector(".asi-import")) return;
  const target = el.querySelector(".header-actions") ?? el.querySelector(".directory-header");
  if (!target) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "asi-import";
  btn.innerHTML = `<i class="fas fa-file-import"></i> Importer les sons`;
  btn.addEventListener("click", () => runImport());
  target.append(btn);
});
