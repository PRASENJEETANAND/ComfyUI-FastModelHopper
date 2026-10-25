import asyncio
import os
import shutil
import subprocess
import sys
import threading

def _install_requirements():
    req = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")
    if not os.path.isfile(req):
        return
    packages = []
    with open(req, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#"):
                packages.append(line)
    if not packages:
        return
    subprocess.check_call([sys.executable, "-m", "pip", "install", *packages])

try:
    _install_requirements()
except Exception as exc:
    print(f"[Fast Model Hopper] could not install requirements: {exc}")

from aiohttp import web
from server import PromptServer

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

MODEL_EXTS = (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".sft")

routes = PromptServer.instance.routes


def _clean(path):
    return (path or "").strip().strip('"')


def _safe_join(base, rel):
    base_abs = os.path.abspath(base)
    rel = (rel or "").replace("\\", "/").lstrip("/")
    parts = [p for p in rel.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise ValueError("invalid relative path")
    full = os.path.abspath(os.path.join(base_abs, *parts)) if parts else base_abs
    if os.path.commonpath([base_abs, full]) != base_abs:
        raise ValueError("path escapes destination")
    return full


def _dest_root(dest_base, folder):
    dest_base = _clean(dest_base)
    folder = (folder or "").replace("\\", "/").strip("/")
    if not dest_base:
        raise ValueError("destination path is empty")
    if folder:
        return _safe_join(dest_base, folder)
    return os.path.abspath(dest_base)


def _list_models(root):
    items = []
    if not root or not os.path.isdir(root):
        return items
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == ".":
            rel_dir = ""
        else:
            rel_dir = rel_dir.replace("\\", "/")
        for name in sorted(filenames):
            if not name.lower().endswith(MODEL_EXTS):
                continue
            rel = f"{rel_dir}/{name}" if rel_dir else name
            full = os.path.join(dirpath, name)
            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0
            items.append({"rel": rel, "name": name, "folder": rel_dir, "size": size})
    return items


@routes.post("/fdl/scan")
async def scan(request):
    data = await request.json()
    source = _clean(data.get("source_path"))
    dest_base = _clean(data.get("dest_path"))
    if not source or not os.path.isdir(source):
        return web.json_response({"error": "Source path is not a folder"}, status=400)
    if not dest_base:
        return web.json_response({"error": "Destination path is empty"}, status=400)

    source_files = _list_models(source)
    source_rels = {f["rel"] for f in source_files}
    source_names = {f["name"] for f in source_files}
    loaded = []
    if os.path.isdir(dest_base):
        for item in _list_models(dest_base):
            parts = item["rel"].split("/", 1)
            if len(parts) == 2:
                target, inner_rel = parts
            else:
                target, inner_rel = "", item["rel"]
            inner = os.path.dirname(inner_rel).replace("\\", "/")
            loaded.append({
                "target": target,
                "rel": inner_rel,
                "name": item["name"],
                "inner": inner,
                "size": item["size"],
                "orphan": inner_rel not in source_rels and item["name"] not in source_names,
            })

    probe = dest_base if os.path.exists(dest_base) else ""
    space = {"free_gb": None, "total_gb": None}
    if probe:
        usage = shutil.disk_usage(probe)
        space = {
            "free_gb": round(usage.free / (1024 ** 3), 2),
            "total_gb": round(usage.total / (1024 ** 3), 2),
        }

    return web.json_response({"source": source_files, "loaded": loaded, **space})


def _file_entry(entry, fallback_folder):
    if isinstance(entry, str):
        return entry, fallback_folder or ""
    return entry.get("rel") or "", entry.get("folder") or fallback_folder or ""


_progress_lock = threading.Lock()
_progress = {"done": 0, "total": 0, "index": 0, "count": 0, "name": "", "busy": False}
_cancel = threading.Event()


class _Stopped(Exception):
    pass


def _set_progress(**kwargs):
    with _progress_lock:
        _progress.update(kwargs)


def _get_progress():
    with _progress_lock:
        return dict(_progress)


def _remove_file(path):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _copy_bytes(src, dst, base_done):
    part = dst + ".fdlpart"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    copied = 0
    try:
        with open(src, "rb") as src_file, open(part, "wb") as dst_file:
            while True:
                if _cancel.is_set():
                    raise _Stopped()
                chunk = src_file.read(4 * 1024 * 1024)
                if not chunk:
                    break
                dst_file.write(chunk)
                copied += len(chunk)
                _set_progress(done=base_done + copied)
                if _cancel.is_set():
                    raise _Stopped()
        if _cancel.is_set():
            raise _Stopped()
        shutil.copystat(src, part)
        os.replace(part, dst)
    except Exception:
        _remove_file(part)
        raise
    return copied


def _load_job(source, dest_path, files, fallback_folder):
    _cancel.clear()
    planned, errors = [], []
    for entry in files:
        rel, folder = _file_entry(entry, fallback_folder)
        flat = isinstance(entry, dict) and bool(entry.get("flat"))
        try:
            dest = _dest_root(dest_path, folder)
            src = _safe_join(source, rel)
            dst_rel = os.path.basename(rel) if flat else rel
            dst = _safe_join(dest, dst_rel)
            if not os.path.isfile(src):
                errors.append(f"{rel}: missing on HDD")
                continue
            planned.append({
                "rel": rel,
                "src": src,
                "dst": dst,
                "size": os.path.getsize(src),
                "name": os.path.basename(rel),
            })
        except Exception as exc:
            errors.append(f"{rel}: {exc}")

    total = sum(item["size"] for item in planned)
    _set_progress(done=0, total=total, index=0, count=len(planned), name="", busy=True)
    copied = []
    done = 0
    stopped = False
    for index, item in enumerate(planned):
        if _cancel.is_set():
            stopped = True
            break
        _set_progress(index=index, name=item["name"], done=done)
        try:
            _copy_bytes(item["src"], item["dst"], done)
            done += item["size"]
            copied.append(item["rel"])
            _set_progress(done=done, index=index + 1)
        except _Stopped:
            stopped = True
            _remove_file(item["dst"] + ".fdlpart")
            break
        except Exception as exc:
            errors.append(f"{item['rel']}: {exc}")
    if stopped:
        for item in planned:
            _remove_file(item["dst"] + ".fdlpart")
    _set_progress(done=done, total=total, busy=False, name="")
    return copied, errors, stopped


@routes.get("/fdl/progress")
async def copy_progress(request):
    return web.json_response(_get_progress())


@routes.post("/fdl/stop")
async def stop_copy(request):
    _cancel.set()
    return web.json_response({"stopping": True})


@routes.post("/fdl/load")
async def load_models(request):
    data = await request.json()
    source = _clean(data.get("source_path"))
    files = data.get("files") or []
    if not source or not os.path.isdir(source):
        return web.json_response({"error": "Source path is not a folder"}, status=400)
    try:
        copied, errors, stopped = await asyncio.to_thread(
            _load_job, source, data.get("dest_path"), files, data.get("folder")
        )
    except Exception as exc:
        _set_progress(busy=False)
        return web.json_response({"error": str(exc)}, status=500)
    return web.json_response({"copied": copied, "errors": errors, "stopped": stopped})


@routes.post("/fdl/unload")
async def unload_models(request):
    data = await request.json()
    files = data.get("files") or []
    deleted, errors = [], []
    for entry in files:
        rel, folder = _file_entry(entry, data.get("folder"))
        try:
            dest = _dest_root(data.get("dest_path"), folder)
            dst = _safe_join(dest, rel)
            if os.path.isfile(dst):
                os.remove(dst)
                deleted.append(rel)
            else:
                errors.append(f"{rel}: not on SSD")
        except Exception as e:
            errors.append(f"{rel}: {e}")
    return web.json_response({"deleted": deleted, "errors": errors})


def _pick_folder(initial):
    initial = initial if initial and os.path.isdir(initial) else ""
    if os.name == "nt":
        safe = initial.replace("'", "''")
        script = (
            "Add-Type -AssemblyName System.Windows.Forms\n"
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog\n"
            "$d.Description = 'Select HDD folder'\n"
            "$d.ShowNewFolderButton = $true\n"
            + (f"$d.SelectedPath = '{safe}'\n" if safe else "")
            + "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }\n"
        )
        result = subprocess.run(
            ["powershell", "-STA", "-NoProfile", "-Command", script],
            capture_output=True, text=True, timeout=300,
        )
        path = (result.stdout or "").strip()
        if result.returncode != 0 and not path:
            raise RuntimeError((result.stderr or "folder dialog failed").strip())
        return path
    if shutil.which("zenity"):
        cmd = ["zenity", "--file-selection", "--directory", "--title=Select HDD folder"]
        if initial:
            cmd.append("--filename=" + initial)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return (result.stdout or "").strip()
    if shutil.which("kdialog"):
        result = subprocess.run(
            ["kdialog", "--getexistingdirectory", initial or os.path.expanduser("~")],
            capture_output=True, text=True, timeout=300,
        )
        return (result.stdout or "").strip()
    raise RuntimeError("No folder dialog on this system. Paste the HDD folder path in the box.")


def _roots():
    if os.name == "nt":
        import string
        return [f"{letter}:\\" for letter in string.ascii_uppercase if os.path.exists(f"{letter}:\\")]
    roots = ["/"]
    home = os.path.expanduser("~")
    if home and os.path.isdir(home) and home not in roots:
        roots.append(home)
    return roots


@routes.post("/fdl/browse")
async def browse(request):
    data = await request.json()
    path = _clean(data.get("path"))
    if not path:
        return web.json_response({
            "path": "",
            "parent": "",
            "dirs": [{"name": item, "path": item} for item in _roots()],
        })
    if not os.path.isdir(path):
        return web.json_response({"error": "Not a folder"}, status=400)
    dirs = []
    try:
        names = sorted(os.listdir(path), key=str.lower)
    except OSError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    for name in names:
        full = os.path.join(path, name)
        if os.path.isdir(full):
            dirs.append({"name": name, "path": full})
    parent = os.path.dirname(os.path.abspath(path))
    if os.path.abspath(parent) == os.path.abspath(path):
        parent = ""
    return web.json_response({"path": os.path.abspath(path), "parent": parent, "dirs": dirs})


@routes.post("/fdl/pick")
async def pick_path(request):
    data = await request.json()
    initial = _clean(data.get("initial"))
    try:
        path = await __import__("asyncio").to_thread(_pick_folder, initial)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"path": path, "kind": "folder"})


@routes.post("/fdl/move_to_hdd")
async def move_to_hdd(request):
    data = await request.json()
    files = data.get("files") or []
    hdd_folder = _clean(data.get("hdd_folder"))
    hdd_file = _clean(data.get("hdd_file"))
    if hdd_file and len(files) != 1:
        return web.json_response({"error": "Select one purple model when using a file path"}, status=400)
    if not hdd_file and (not hdd_folder or not os.path.isdir(hdd_folder)):
        return web.json_response({"error": "Pick an HDD folder first"}, status=400)

    moved, errors = [], []
    for entry in files:
        rel, folder = _file_entry(entry, "")
        try:
            src_root = _dest_root(data.get("dest_path"), folder)
            src = _safe_join(src_root, rel)
            if not os.path.isfile(src):
                errors.append(f"{rel}: not on SSD")
                continue
            if hdd_file:
                dst = os.path.abspath(hdd_file)
            else:
                dst = _safe_join(hdd_folder, rel)
            if os.path.abspath(src) == os.path.abspath(dst):
                errors.append(f"{rel}: source and destination are the same")
                continue
            if os.path.exists(dst):
                errors.append(f"{rel}: already exists on HDD")
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            moved.append(rel)
        except Exception as e:
            errors.append(f"{rel}: {e}")
    return web.json_response({"moved": moved, "errors": errors})


@routes.get("/fdl/model_folders")
async def model_folders(request):
    try:
        import folder_paths
        folders = sorted(folder_paths.folder_names_and_paths.keys())
    except Exception:
        folders = [
            "checkpoints", "loras", "vae", "unet", "clip",
            "controlnet", "diffusion_models", "text_encoders",
            "upscale_models", "embeddings",
        ]
    return web.json_response({"folders": folders})


print("[Fast Model Hopper] routes ready")
