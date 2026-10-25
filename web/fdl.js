import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const RED = "#e74c3c";
const YELLOW = "#f1c40f";
const GREEN = "#c6d84a";
const PURPLE = "#9b59b6";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="16" width="56" height="34" rx="7" fill="#162033" stroke="#7ec8f0" stroke-width="3"/><rect x="12" y="24" width="18" height="5" rx="2" fill="#3d5166"/><circle cx="48" cy="40" r="3.5" fill="#c6d84a"/><path d="M36 4 L24 30 H33 L27 60 L50 26 H39 L44 4 Z" fill="#f1c40f" stroke="#1a1200" stroke-width="1.5"/></svg>`;

function installSideLogo() {
  if (!document.getElementById("fdl-side-style")) {
    const style = document.createElement("style");
    style.id = "fdl-side-style";
    style.textContent = `
      .fdl-side-icon {
        width: 22px !important;
        height: 22px !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        background: none !important;
      }
      .fdl-side-icon::before { content: none !important; }
      .fdl-side-icon svg { width: 22px; height: 22px; display: block; }
    `;
    document.head.appendChild(style);
  }
  document.querySelectorAll("i.fdl-side-icon, span.fdl-side-icon").forEach((icon) => {
    if (!icon.querySelector("svg")) icon.innerHTML = LOGO_SVG;
  });
}
function fmtSize(bytes) {
  if (!bytes) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return ` (${gb.toFixed(2)} GB)`;
  const mb = bytes / 1024 ** 2;
  return ` (${mb.toFixed(0)} MB)`;
}

app.registerExtension({
  name: "FastModelHopper.Panel",

  async setup() {
    if (!app.extensionManager?.registerSidebarTab) {
      console.warn("[Fast Model Hopper] sidebar API missing");
      return;
    }

    installSideLogo();
    const iconWatch = new MutationObserver(() => installSideLogo());
    iconWatch.observe(document.body, { childList: true, subtree: true });
    app.extensionManager.registerSidebarTab({
      id: "fast-model-hopper",
      icon: "fdl-side-icon",
      title: "FMH",
      tooltip: "Fast Model Hopper",
      type: "custom",
      render: (el) => {
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.position = "relative";
        el.style.height = "100%";
        el.style.minHeight = "0";
        el.innerHTML = `
          <style>
            @keyframes fdl-slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
            .fdl-knob { width: 44px; height: 24px; border-radius: 12px; border: 0; padding: 0; position: relative; flex-shrink: 0; cursor: pointer; }
            .fdl-knob i { position: absolute; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; left: 3px; }
            .fdl-mini { width: 34px; height: 18px; border-radius: 9px; }
            .fdl-mini i { width: 12px; height: 12px; top: 3px; }
          </style>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px 0;flex-shrink:0;font-size:12px;">
            <span>UI size</span>
            <input id="fdl-scale" type="range" min="60" max="140" step="5" value="80" style="flex:1;accent-color:#7ec8f0;">
            <span id="fdl-scale-val" style="min-width:42px;font-weight:700;">80%</span>
          </div>
          <div id="fdl-root" style="flex:1;min-height:0;padding:8px 10px;display:flex;flex-direction:column;gap:6px;overflow:hidden;box-sizing:border-box;font-family:system-ui,sans-serif;color:#ddd;">
            <div id="fdl-title" style="display:flex;align-items:center;justify-content:center;gap:8px;flex-shrink:0;">
              <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
                <rect x="4" y="16" width="56" height="34" rx="7" fill="#162033" stroke="#7ec8f0" stroke-width="3"/>
                <rect x="12" y="24" width="18" height="5" rx="2" fill="#3d5166"/>
                <circle cx="48" cy="40" r="3.5" fill="#c6d84a"/>
                <path d="M36 4 L24 30 H33 L27 60 L50 26 H39 L44 4 Z" fill="#f1c40f" stroke="#1a1200" stroke-width="1.5"/>
              </svg>
              <span id="fdl-title-text" style="font-size:16px;font-weight:800;color:${RED};">Fast Model Hopper</span>
            </div>
            <div id="fdl-progress" style="display:none;flex-shrink:0;background:#1a1408;border:2px solid #f1c40f;border-radius:8px;padding:8px;">
              <div id="fdl-progress-label" style="font-size:15px;font-weight:800;color:#f1c40f;margin-bottom:6px;">Working…</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:18px;background:#2a2a2a;border-radius:9px;overflow:hidden;">
                  <div id="fdl-progress-fill" style="height:100%;width:0;background:#f1c40f;"></div>
                </div>
                <button id="fdl-stop" type="button" title="Stop" style="width:28px;height:28px;border:0;border-radius:6px;background:#e74c3c;color:#fff;font-size:16px;font-weight:900;line-height:1;flex-shrink:0;">✕</button>
              </div>
              <div id="fdl-progress-eta" style="font-size:14px;font-weight:700;color:#ffe08a;margin-top:6px;"></div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;color:#888;">Source (HDD)</div>
                <div id="fdl-source" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Not selected</div>
              </div>
              <button id="fdl-pick-source" type="button" style="padding:8px 10px;flex-shrink:0;font-weight:700;">Select folder</button>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;color:#888;">Destination (SSD)</div>
                <div id="fdl-dest" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Not selected</div>
              </div>
              <button id="fdl-pick-dest" type="button" style="padding:8px 10px;flex-shrink:0;font-weight:700;">Select folder</button>
            </div>
            <div id="fdl-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;flex-shrink:0;font-size:11px;"></div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button id="fdl-refresh" type="button" style="flex:1;padding:8px;font-weight:700;">Refresh</button>
              <button id="fdl-load" type="button" style="flex:1;padding:8px;background:${YELLOW};color:#111;border:0;font-weight:800;">Load</button>
              <button id="fdl-unload" type="button" style="flex:1;padding:8px;background:${RED};color:#fff;border:0;font-weight:800;">Unload</button>
            </div>
            <div id="fdl-warn" style="display:none;flex-shrink:0;border:2px solid #e74c3c;background:#3b1212;color:#ffd0c8;font-size:18px;font-weight:700;line-height:1.35;padding:12px;border-radius:6px;"></div>
            <div id="fdl-status" style="font-size:12px;min-height:14px;color:#aaa;flex-shrink:0;"></div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <span style="font-size:12px;">Open levels</span>
              <button id="fdl-exp-minus" type="button" style="width:28px;height:28px;font-weight:800;">−</button>
              <span id="fdl-exp-val" style="min-width:16px;text-align:center;font-weight:800;">0</span>
              <button id="fdl-exp-plus" type="button" style="width:28px;height:28px;font-weight:800;">+</button>
              <span style="font-size:11px;color:#888;">0 = closed. Click a folder to open just that one.</span>
            </div>
            <div id="fdl-source-list" style="flex:1;min-height:80px;overflow:auto;border:1px solid #333;padding:4px;font-size:13px;background:#141414;"></div>
            <div style="font-size:11px;color:#888;flex-shrink:0;">On SSD — purple means it is not on the HDD</div>
            <div id="fdl-loaded-list" style="flex:1;min-height:80px;overflow:auto;border:1px solid #333;padding:4px;font-size:13px;background:#141414;"></div>
            <div id="fdl-space" style="font-size:13px;text-align:center;color:${GREEN};flex-shrink:0;font-weight:700;">SSD free: --</div>
          </div>
          <div id="fdl-picker" style="display:none;position:fixed;z-index:100000;background:#121212;border:2px solid #5dade2;border-radius:8px;padding:10px;flex-direction:column;gap:8px;box-sizing:border-box;">
            <div id="fdl-picker-title" style="font-size:18px;font-weight:800;">Select folder</div>
            <div id="fdl-picker-path" style="font-size:13px;word-break:break-all;color:#9bd;min-height:18px;"></div>
            <div style="display:flex;gap:6px;">
              <button id="fdl-picker-up" type="button" style="padding:8px 10px;">Up</button>
              <button id="fdl-picker-use" type="button" style="flex:1;padding:8px;background:#2ecc71;color:#111;border:0;font-weight:800;">Use this folder</button>
              <button id="fdl-picker-cancel" type="button" style="padding:8px 10px;">Cancel</button>
            </div>
            <div id="fdl-picker-list" style="flex:1;overflow:auto;border:1px solid #333;background:#101010;"></div>
          </div>
        `;

        const title = el.querySelector("#fdl-title-text");
        const root = el.querySelector("#fdl-root");
        const scaleInput = el.querySelector("#fdl-scale");
        const scaleVal = el.querySelector("#fdl-scale-val");
        function applyScale(pct) {
          const next = Math.min(140, Math.max(60, Number(pct) || 80));
          root.style.zoom = String(next / 100);
          scaleInput.value = String(next);
          scaleVal.textContent = `${next}%`;
          localStorage.setItem("fdl_scale", String(next));
        }
        applyScale(localStorage.getItem("fdl_scale") || "80");
        scaleInput.addEventListener("input", () => applyScale(scaleInput.value));
        const sourceEl = el.querySelector("#fdl-source");
        const destEl = el.querySelector("#fdl-dest");
        const sourceList = el.querySelector("#fdl-source-list");
        const loadedList = el.querySelector("#fdl-loaded-list");
        const spaceEl = el.querySelector("#fdl-space");
        const statusEl = el.querySelector("#fdl-status");
        const warnEl = el.querySelector("#fdl-warn");
        const progressEl = el.querySelector("#fdl-progress");
        const progressFill = el.querySelector("#fdl-progress-fill");
        const progressLabel = el.querySelector("#fdl-progress-label");
        const progressEta = el.querySelector("#fdl-progress-eta");
        const picker = el.querySelector("#fdl-picker");
        const pickerList = el.querySelector("#fdl-picker-list");
        const pickerPath = el.querySelector("#fdl-picker-path");
        const pickerTitle = el.querySelector("#fdl-picker-title");

        let sourcePath = localStorage.getItem("fdl_source") || "";
        let destPath = localStorage.getItem("fdl_dest") || "";
        const showPath = (node, path) => { node.textContent = path || "Not selected"; node.title = path || ""; };
        showPath(sourceEl, sourcePath);
        showPath(destEl, destPath);

        let folderNames = ["checkpoints", "loras", "vae", "unet", "clip", "diffusion_models", "text_encoders", "controlnet"];
        let fileFolders = {};
        let hierMap = {};
        let folderTargets = {};
        try { fileFolders = JSON.parse(localStorage.getItem("fdl_file_folders") || "{}"); } catch (e) { fileFolders = {}; }
        try { hierMap = JSON.parse(localStorage.getItem("fdl_hier") || "{}"); } catch (e) { hierMap = {}; }
        try { folderTargets = JSON.parse(localStorage.getItem("fdl_dir_folders") || "{}"); } catch (e) { folderTargets = {}; }
        let expandLevel = Math.max(0, Number(localStorage.getItem("fdl_expand") || "0") || 0);
        const expVal = el.querySelector("#fdl-exp-val");
        expVal.textContent = String(expandLevel);
        const armed = new Set();
        let loadedSet = new Set();

        function normKey(value) {
          return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        }
        function guessFolder(parts) {
          const aliases = {
            lora: "loras", loras: "loras",
            checkpoint: "checkpoints", checkpoints: "checkpoints", ckpt: "checkpoints",
            vae: "vae", clip: "clip", unet: "unet",
            diffusion: "diffusion_models", diffusionmodel: "diffusion_models", diffusionmodels: "diffusion_models",
            textencoder: "text_encoders", textencoders: "text_encoders",
            controlnet: "controlnet",
            embedding: "embeddings", embeddings: "embeddings",
            upscale: "upscale_models", upscalemodel: "upscale_models", upscalemodels: "upscale_models",
          };
          for (let i = parts.length - 1; i >= 0; i--) {
            const key = normKey(parts[i]);
            const direct = folderNames.find((name) => normKey(name) === key);
            if (direct) return direct;
            const mapped = aliases[key];
            if (mapped) return folderNames.find((name) => name === mapped) || mapped;
          }
          return folderNames.includes("diffusion_models") ? "diffusion_models" : "diffusion_models";
        }
        function chosenFolder(rel) {
          if (fileFolders[rel]) return fileFolders[rel];
          const parts = String(rel || "").split("/").filter(Boolean);
          parts.pop();
          for (let i = parts.length; i > 0; i--) {
            const saved = folderTargets[parts.slice(0, i).join("/")];
            if (saved) return saved;
          }
          return guessFolder(parts);
        }
        function saveFolder(rel, folder) {
          fileFolders[rel] = folder;
          localStorage.setItem("fdl_file_folders", JSON.stringify(fileFolders));
          localStorage.setItem("fdl_last_folder", folder);
        }
        function saveHier(rel, on) {
          hierMap[rel] = !!on;
          localStorage.setItem("fdl_hier", JSON.stringify(hierMap));
        }
        function isOnSsd(rel, folder) {
          const base = (rel || "").split("/").pop();
          return loadedSet.has(`${folder}\n${rel}`) || loadedSet.has(`${folder}\n${base}`);
        }
        function showWarn(msg) {
          warnEl.style.display = "block";
          warnEl.textContent = msg;
        }
        function clearWarn() {
          warnEl.style.display = "none";
          warnEl.textContent = "";
        }
        function paintFill(pct, sliding) {
          progressFill.style.animation = sliding ? "fdl-slide 0.9s linear infinite" : "none";
          progressFill.style.width = sliding ? "40%" : `${pct}%`;
        }
        let copyStarted = 0;
        function fmtEta(seconds) {
          if (!Number.isFinite(seconds) || seconds < 0) return "Estimating time…";
          if (seconds < 5) return "A few seconds left";
          const s = Math.ceil(seconds);
          if (s < 60) return `About ${s}s left`;
          const m = Math.floor(s / 60);
          const rem = s % 60;
          if (m < 60) return rem ? `About ${m}m ${rem}s left` : `About ${m}m left`;
          const h = Math.floor(m / 60);
          return `About ${h}h ${m % 60}m left`;
        }
        function fmtBytes(bytes) {
          const gb = bytes / 1024 ** 3;
          if (gb >= 1) return `${gb.toFixed(2)} GB`;
          const mb = bytes / 1024 ** 2;
          return `${Math.max(0, mb).toFixed(0)} MB`;
        }
        function setProgress(doneBytes, totalBytes, doneCount, totalCount, name) {
          progressEl.style.display = "block";
          const pct = totalBytes ? Math.min(100, (doneBytes / totalBytes) * 100) : 0;
          paintFill(pct, false);
          progressLabel.textContent = `Copying ${fmtBytes(doneBytes)} / ${fmtBytes(totalBytes)}${name ? " — " + name : ""}`;
          if (doneBytes <= 0) {
            progressEta.textContent = "Estimating time…";
            return;
          }
          if (doneBytes >= totalBytes) {
            progressEta.textContent = "Done";
            return;
          }
          const elapsed = (Date.now() - copyStarted) / 1000;
          const left = elapsed > 0.3 ? ((totalBytes - doneBytes) / doneBytes) * elapsed : NaN;
          progressEta.textContent = fmtEta(left);
        }
        function setBusy(label) {
          progressEl.style.display = "block";
          progressLabel.textContent = label;
          progressEta.textContent = "";
          paintFill(40, true);
        }
        function hideProgress() {
          progressEl.style.display = "none";
          progressEta.textContent = "";
          paintFill(0, false);
        }
        const raf = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        function makeKnob(mini) {
          const knob = document.createElement("button");
          knob.type = "button";
          knob.className = mini ? "fdl-knob fdl-mini" : "fdl-knob";
          knob.innerHTML = "<i></i>";
          return knob;
        }
        function moveDot(knob, on) {
          const dot = knob.querySelector("i");
          dot.style.left = on ? (knob.classList.contains("fdl-mini") ? "18px" : "23px") : "3px";
        }

        function paint(knob) {
          const text = knob.parentElement?.querySelector(".fdl-name");
          let color = RED;
          let on = false;
          let state = "red";
          if (knob.dataset.orphan === "1") {
            color = PURPLE;
            on = true;
            state = "purple";
          } else if (isOnSsd(knob.dataset.rel, knob.dataset.folder || "")) {
            if (knob.dataset.mark === "1") {
              color = YELLOW;
              on = true;
              state = "yellow";
            } else {
              color = GREEN;
              on = true;
              state = "green";
            }
          } else if (armed.has(knob.dataset.rel)) {
            color = YELLOW;
            on = true;
            state = "yellow";
          }
          knob.dataset.state = state;
          knob.dataset.on = on ? "1" : "0";
          knob.style.background = color;
          moveDot(knob, on);
          if (text) {
            text.style.color = color;
            text.style.fontWeight = "700";
          }
          queueStats();
        }

        function setTitle(any) {
          title.style.color = any ? GREEN : RED;
        }

        function countFiles(node) {
          let n = node.files.length;
          for (const child of node.dirs.values()) n += countFiles(child);
          return n;
        }

        function folderRow(name, depth, count, pathParts, pickFolder) {
          const head = document.createElement("div");
          head.style.cssText = `display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;margin:8px 0 4px;padding:8px 10px;margin-left:${depth * 14}px;background:#243044;border-left:4px solid #5dade2;border-radius:4px;cursor:pointer;user-select:none;`;
          head.dataset.fdlFolder = "1";
          head.dataset.depth = String(depth);
          const label = document.createElement("span");
          label.textContent = `▸ ${name}  (${count})`;
          label.style.flex = "1";
          head.appendChild(label);
          if (pickFolder) {
            const sel = document.createElement("select");
            sel.className = "fdl-dir";
            sel.style.cssText = "max-width:132px;background:#1e1e1e;color:#eee;border:1px solid #555;font-size:11px;";
            const pathKey = pathParts.join("/");
            const picked = folderTargets[pathKey] || guessFolder(pathParts);
            const names = folderNames.includes(picked) ? folderNames : [picked, ...folderNames];
            for (const item of names) {
              const opt = document.createElement("option");
              opt.value = item;
              opt.textContent = item;
              if (item === picked) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.addEventListener("click", (e) => e.stopPropagation());
            sel.addEventListener("mousedown", (e) => e.stopPropagation());
            sel.addEventListener("change", (e) => {
              e.stopPropagation();
              folderTargets[pathKey] = sel.value;
              localStorage.setItem("fdl_dir_folders", JSON.stringify(folderTargets));
              const body = head.nextElementSibling;
              if (!body) return;
              [...body.children].forEach((child) => {
                const knob = child.querySelector("button.fdl-model");
                if (!knob || knob.parentElement !== child) return;
                const target = child.querySelector("select.fdl-target");
                if (target && [...target.options].some((opt) => opt.value === sel.value)) target.value = sel.value;
                saveFolder(knob.dataset.rel, sel.value);
                knob.dataset.folder = sel.value;
                if (!isOnSsd(knob.dataset.rel, sel.value)) armed.delete(knob.dataset.rel);
                paint(knob);
              });
            });
            head.appendChild(sel);
          }
          head._label = label;
          head._name = name;
          head._count = count;
          return head;
        }

        function buildTree(files) {
          const root = { dirs: new Map(), files: [] };
          for (const file of files) {
            const parts = (file.folder || "").split("/").filter(Boolean);
            let node = root;
            for (const part of parts) {
              if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
              node = node.dirs.get(part);
            }
            node.files.push(file);
          }
          return root;
        }

        function setHierKnob(knob, on) {
          knob.dataset.on = on ? "1" : "0";
          knob.style.background = on ? YELLOW : "#555";
          moveDot(knob, on);
        }

        function setOpen(head, body, open) {
          body.style.display = open ? "block" : "none";
          head._label.textContent = `${open ? "▾" : "▸"} ${head._name}  (${head._count})`;
        }

        function applyExpand() {
          expVal.textContent = String(expandLevel);
          localStorage.setItem("fdl_expand", String(expandLevel));
          el.querySelectorAll("[data-fdl-folder]").forEach((head) => {
            const body = head.nextElementSibling;
            if (!body) return;
            setOpen(head, body, Number(head.dataset.depth) < expandLevel);
          });
        }

        function renderTree(node, parent, depth, pickFolder, pathParts) {
          const names = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b));
          for (const name of names) {
            const child = node.dirs.get(name);
            const parts = pathParts.concat(name);
            const head = folderRow(name, depth, countFiles(child), parts, pickFolder);
            const body = document.createElement("div");
            setOpen(head, body, depth < expandLevel);
            head.addEventListener("click", () => {
              setOpen(head, body, body.style.display === "none");
            });
            parent.append(head, body);
            renderTree(child, body, depth + 1, pickFolder, parts);
          }
          for (const file of node.files) {
            const wrap = document.createElement("div");
            wrap.style.marginLeft = `${depth * 14 + 8}px`;
            parent.appendChild(wrap);
            row(file, wrap, pickFolder);
          }
        }

        function row(file, list, pickFolder) {
          const rel = file.rel;
          const wrap = document.createElement("div");
          wrap.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px;";
          const knob = makeKnob(false);
          knob.classList.add("fdl-model");
          knob.dataset.rel = rel;
          knob.dataset.size = String(file.size || 0);
          knob.dataset.folder = pickFolder ? chosenFolder(rel) : (file.target || "");
          knob.dataset.orphan = file.orphan ? "1" : "0";
          knob.addEventListener("click", () => {
            if (knob.dataset.orphan === "1") return;
            if (isOnSsd(knob.dataset.rel, knob.dataset.folder || "")) {
              knob.dataset.mark = knob.dataset.mark === "1" ? "0" : "1";
            } else if (armed.has(rel)) armed.delete(rel);
            else armed.add(rel);
            paint(knob);
          });
          const text = document.createElement("span");
          text.className = "fdl-name";
          text.textContent = file.name + fmtSize(file.size);
          text.style.flex = "1";
          text.style.wordBreak = "break-all";
          wrap.append(knob, text);
          if (pickFolder) {
            const hier = makeKnob(true);
            hier.classList.add("fdl-hier");
            hier.title = "Keep folders";
            setHierKnob(hier, hierMap[rel] === true);
            knob.dataset.hier = hier.dataset.on;
            hier.addEventListener("click", (e) => {
              e.stopPropagation();
              const on = hier.dataset.on !== "1";
              setHierKnob(hier, on);
              saveHier(rel, on);
              knob.dataset.hier = on ? "1" : "0";
            });
            const sel = document.createElement("select");
            sel.className = "fdl-target";
            sel.style.cssText = "max-width:120px;background:#1e1e1e;color:#eee;border:1px solid #555;font-size:11px;";
            const current = chosenFolder(rel);
            for (const name of folderNames) {
              const opt = document.createElement("option");
              opt.value = name;
              opt.textContent = name;
              if (name === current) opt.selected = true;
              sel.appendChild(opt);
            }
            knob.dataset.folder = sel.value;
            sel.addEventListener("change", () => {
              saveFolder(rel, sel.value);
              knob.dataset.folder = sel.value;
              if (!isOnSsd(rel, sel.value)) armed.delete(rel);
              paint(knob);
            });
            wrap.append(hier, sel);
          }
          if (file.orphan) {
            const pick = document.createElement("button");
            pick.type = "button";
            pick.textContent = "Select folder";
            pick.style.cssText = `padding:4px 6px;background:${PURPLE};color:#fff;border:0;font-weight:700;flex-shrink:0;`;
            pick.onclick = () => openPicker("Move " + file.name + " to HDD", async (folder) => {
              setBusy("Moving " + file.name);
              await raf();
              const result = await post("/fdl/move_to_hdd", {
                dest_path: destPath,
                files: [{ rel, folder: knob.dataset.folder }],
                hdd_folder: folder,
              });
              hideProgress();
              if (result.errors?.length) showWarn(result.errors.join("\n"));
              else {
                clearWarn();
                statusEl.textContent = "Moved " + file.name;
              }
              await refresh();
            });
            wrap.appendChild(pick);
          }
          paint(knob);
          list.appendChild(wrap);
        }

        async function post(path, body) {
          const res = await api.fetchApi(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || res.statusText);
          return data;
        }

        const statsEl = el.querySelector("#fdl-stats");
        let lastFree = null;
        let statsTimer = 0;
        function statCell(label, value, color) {
          return `<div style="background:#1b1b1b;border:1px solid #333;border-radius:4px;padding:4px 6px;"><div style="color:#888;">${label}</div><div style="color:${color};font-weight:800;">${value}</div></div>`;
        }
        function updateStats() {
          const sourceKnobs = [...sourceList.querySelectorAll("button.fdl-model")];
          const loadedKnobs = [...loadedList.querySelectorAll("button.fdl-model")];
          const bytesOf = (list) => list.reduce((sum, knob) => sum + (Number(knob.dataset.size) || 0), 0);
          const onHdd = sourceKnobs.length;
          const onSsd = loadedKnobs.length;
          const bothReal = sourceKnobs.filter((knob) => isOnSsd(knob.dataset.rel, knob.dataset.folder || ""));
          const onlyHdd = sourceKnobs.filter((knob) => !isOnSsd(knob.dataset.rel, knob.dataset.folder || ""));
          const onlySsd = loadedKnobs.filter((knob) => knob.dataset.orphan === "1");
          const toLoad = sourceKnobs.filter((knob) => knob.dataset.state === "yellow" && knob.dataset.orphan !== "1" && !isOnSsd(knob.dataset.rel, knob.dataset.folder || ""));
          const toUnload = loadedKnobs.filter((knob) => knob.dataset.mark === "1");
          const loadBytes = bytesOf(toLoad);
          let fit = "Selected size —";
          if (lastFree != null && toLoad.length) {
            fit = loadBytes <= lastFree ? `Fits, ${fmtBytes(lastFree - loadBytes)} free after` : `Too big by ${fmtBytes(loadBytes - lastFree)}`;
          }
          statsEl.innerHTML = [
            statCell("On HDD", `${onHdd} · ${fmtBytes(bytesOf(sourceKnobs))}`, "#ddd"),
            statCell("On SSD", `${onSsd} · ${fmtBytes(bytesOf(loadedKnobs))}`, GREEN),
            statCell("Only on HDD", `${onlyHdd.length} · ${fmtBytes(bytesOf(onlyHdd))}`, RED),
            statCell("Only on SSD", `${onlySsd.length} · ${fmtBytes(bytesOf(onlySsd))}`, PURPLE),
            statCell("On both", `${bothReal.length} · ${fmtBytes(bytesOf(bothReal))}`, GREEN),
            statCell("Selected to load", `${toLoad.length} · ${fmtBytes(loadBytes)}`, YELLOW),
            statCell("Selected to unload", `${toUnload.length} · ${fmtBytes(bytesOf(toUnload))}`, RED),
            statCell("Free after load", fit, loadBytes && lastFree != null && loadBytes > lastFree ? RED : GREEN),
          ].join("");
        }
        function queueStats() {
          clearTimeout(statsTimer);
          statsTimer = setTimeout(updateStats, 30);
        }
        async function refresh() {
          if (!sourcePath || !destPath) {
            showWarn("Select the HDD folder and the SSD folder first.");
            return;
          }
          clearWarn();
          setBusy("Checking disks…");
          statusEl.textContent = "Checking…";
          await raf();
          try {
            const data = await post("/fdl/scan", { source_path: sourcePath, dest_path: destPath });
            loadedSet = new Set((data.loaded || []).map((f) => `${f.target}\n${f.rel}`));
            for (const rel of [...armed]) {
              const folder = chosenFolder(rel);
              if (isOnSsd(rel, folder)) armed.delete(rel);
            }
            sourceList.innerHTML = "";
            loadedList.innerHTML = "";
            if (!(data.source || []).length) sourceList.textContent = "No model files in the HDD folder.";
            else renderTree(buildTree(data.source), sourceList, 0, true, []);
            if (!(data.loaded || []).length) loadedList.textContent = "Nothing on the SSD.";
            else {
              const loadedFiles = data.loaded.map((f) => ({
                rel: f.rel,
                name: f.name,
                size: f.size,
                target: f.target,
                orphan: !!f.orphan,
                folder: f.target ? (f.inner ? `${f.target}/${f.inner}` : f.target) : (f.inner || ""),
              }));
              renderTree(buildTree(loadedFiles), loadedList, 0, false, []);
            }
            setTitle((data.loaded || []).length > 0);
            lastFree = data.free_gb != null ? data.free_gb * 1024 ** 3 : null;
            spaceEl.textContent = data.free_gb != null ? `SSD free: ${data.free_gb} / ${data.total_gb} GB` : "SSD free: --";
            updateStats();
            const purple = (data.loaded || []).filter((f) => f.orphan).length;
            const onSsd = (data.loaded || []).length;
            statusEl.textContent = `${(data.source || []).length} on HDD, ${onSsd} on SSD, ${purple} purple`;
          } catch (err) {
            showWarn(String(err.message || err));
          } finally {
            hideProgress();
          }
        }

        let pickerCurrent = "";
        let pickerParent = "";
        let pickerDone = null;

        function placePicker() {
          const box = el.getBoundingClientRect();
          picker.style.display = "flex";
          picker.style.left = `${Math.max(8, box.left)}px`;
          picker.style.top = `${Math.max(8, box.top)}px`;
          picker.style.width = `${Math.max(280, box.width - 8)}px`;
          picker.style.height = `${Math.max(360, box.height - 8)}px`;
        }

        async function showDir(path) {
          pickerList.textContent = "Loading folders…";
          try {
            const data = await post("/fdl/browse", { path: path || "" });
            pickerCurrent = data.path || "";
            pickerParent = data.parent || "";
            pickerPath.textContent = data.path || "Choose a drive";
            pickerList.innerHTML = "";
            const dirs = data.dirs || [];
            if (!dirs.length) {
              pickerList.textContent = "No folders in here. You can still use this folder.";
              return;
            }
            for (const dir of dirs) {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = dir.name;
              button.style.cssText = "display:block;width:100%;text-align:left;padding:12px;background:transparent;color:#eee;border:0;border-bottom:1px solid #2a2a2a;font-size:15px;cursor:pointer;";
              button.onclick = () => showDir(dir.path);
              pickerList.appendChild(button);
            }
          } catch (err) {
            pickerList.textContent = "";
            showWarn(String(err.message || err));
          }
        }

        function openPicker(titleText, onUse) {
          pickerDone = onUse;
          pickerTitle.textContent = titleText;
          placePicker();
          showDir("");
        }

        el.querySelector("#fdl-exp-minus").onclick = () => {
          expandLevel = Math.max(0, expandLevel - 1);
          applyExpand();
        };
        el.querySelector("#fdl-exp-plus").onclick = () => {
          expandLevel += 1;
          applyExpand();
        };
        el.querySelector("#fdl-refresh").onclick = () => refresh();
        el.querySelector("#fdl-pick-source").onclick = () => openPicker("HDD folder", (folder) => {
          sourcePath = folder;
          localStorage.setItem("fdl_source", folder);
          showPath(sourceEl, folder);
          if (destPath) return refresh();
        });
        el.querySelector("#fdl-pick-dest").onclick = () => openPicker("SSD models folder", (folder) => {
          destPath = folder;
          localStorage.setItem("fdl_dest", folder);
          showPath(destEl, folder);
          if (sourcePath) return refresh();
        });
        el.querySelector("#fdl-picker-up").onclick = () => showDir(pickerParent);
        el.querySelector("#fdl-picker-cancel").onclick = () => { picker.style.display = "none"; };
        el.querySelector("#fdl-picker-use").onclick = async () => {
          if (!pickerCurrent) {
            showWarn("Open a folder, then press Use this folder.");
            return;
          }
          const done = pickerDone;
          picker.style.display = "none";
          clearWarn();
          try {
            await done(pickerCurrent);
          } catch (err) {
            showWarn(String(err.message || err));
            hideProgress();
          }
        };

        el.querySelector("#fdl-stop").onclick = async () => {
          progressEta.textContent = "Stopping…";
          try {
            await post("/fdl/stop", {});
          } catch (err) {
            showWarn(String(err.message || err));
          }
        };
        el.querySelector("#fdl-load").onclick = async () => {
          const files = [...sourceList.querySelectorAll("button.fdl-model")]
            .filter((knob) => knob.dataset.state === "yellow" && knob.dataset.orphan !== "1")
            .map((knob) => ({
              rel: knob.dataset.rel,
              folder: knob.dataset.folder,
              flat: knob.dataset.hier !== "1",
              size: Number(knob.dataset.size) || 1,
            }));
          if (!files.length) {
            showWarn("Turn a red knob to yellow, then press Load.");
            return;
          }
          clearWarn();
          copyStarted = Date.now();
          const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
          setProgress(0, totalBytes, 0, files.length, files[0].rel.split("/").pop());
          await raf();
          let stopPoll = false;
          const poll = (async () => {
            while (!stopPoll) {
              try {
                const res = await api.fetchApi("/fdl/progress");
                const live = await res.json();
                if (live && live.total) {
                  setProgress(live.done || 0, live.total, live.index || 0, live.count || files.length, live.name || "");
                }
              } catch (err) { /* keep the last reading */ }
              await new Promise((resolve) => setTimeout(resolve, 400));
            }
          })();
          try {
            const result = await post("/fdl/load", {
              source_path: sourcePath,
              dest_path: destPath,
              files,
            });
            stopPoll = true;
            await poll;
            if (result.stopped) {
              clearWarn();
              statusEl.textContent = `Stopped. Partial file removed. Kept ${(result.copied || []).length}.`;
              await refresh();
            } else {
              setProgress(totalBytes, totalBytes, files.length, files.length, "done");
              await new Promise((resolve) => setTimeout(resolve, 700));
              if (result.errors?.length) showWarn(result.errors.join("\n"));
              else statusEl.textContent = `Copied ${(result.copied || []).length}`;
              await refresh();
            }
          } catch (err) {
            stopPoll = true;
            showWarn(String(err.message || err));
          } finally {
            stopPoll = true;
            hideProgress();
          }
        };

        el.querySelector("#fdl-unload").onclick = async () => {
          const files = [...loadedList.querySelectorAll("button.fdl-model")]
            .filter((knob) => knob.dataset.mark === "1")
            .map((knob) => ({ rel: knob.dataset.rel, folder: knob.dataset.folder }));
          if (!files.length) {
            showWarn("Turn a green knob to yellow, then press Unload.");
            return;
          }
          setBusy("Removing from SSD…");
          await raf();
          try {
            const result = await post("/fdl/unload", { dest_path: destPath, files });
            if (result.errors?.length) showWarn(result.errors.join("\n"));
            else {
              clearWarn();
              statusEl.textContent = `Removed ${result.deleted.length} from SSD`;
            }
            await refresh();
          } catch (err) {
            showWarn(String(err.message || err));
          } finally {
            hideProgress();
          }
        };

        api.fetchApi("/fdl/model_folders")
          .then((r) => r.json())
          .then((data) => { if (data.folders?.length) folderNames = data.folders; })
          .finally(() => { if (sourcePath && destPath) refresh(); });
      },
    });
  },
});
