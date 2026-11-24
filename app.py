import csv
import io
import os
import re
import uuid
import math
import shutil
from datetime import datetime

from flask import Flask, render_template, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename
from PIL import Image, ImageStat

from model_metrics import MODEL_METRICS

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MEDIA_DIR = os.path.join(BASE_DIR, "media_data")
UPLOADS_DIR = os.path.join(MEDIA_DIR, "user_uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Cache aplicado às imagens/CSVs servidos por /media/<path>. Não são conteúdo
# versionado por hash, por isso usamos um max-age moderado em vez de "immutable".
MEDIA_CACHE_MAX_AGE = 60 * 60 * 24  # 1 dia


@app.route("/media/<path:filepath>")
def media(filepath):
    """Serve datasets (bundled + uploads) a partir de media_data/, fora de
    static/, com cache HTTP e streaming/range requests (via send_from_directory)."""
    response = send_from_directory(MEDIA_DIR, filepath, conditional=True)
    # Os CSV são atualizáveis (incluindo MeanIntensity). Impedir que o
    # navegador reutilize CSV antigos quando a aplicação é atualizada.
    if filepath.lower().endswith(".csv"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    else:
        response.headers["Cache-Control"] = f"public, max-age={MEDIA_CACHE_MAX_AGE}"
    return response

REQUIRED_CSV_COLUMNS = [
    "Patient_ID", "Study_ID", "Phase", "Slice",
    "Mol Subtype", "X_min", "X_max", "Y_min", "Y_max", "Basename"
]

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg"}


@app.route("/")
def home():
    return render_template("index.html")


def _norm_row(row):
    return {k.lower(): v for k, v in row.items()}


def _read_dataset_csv(csv_path):
    if not os.path.isfile(csv_path):
        return []
    try:
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            return [_norm_row(r) for r in csv.DictReader(f)]
    except Exception:
        return []


def compute_pipeline_stats():
    """Aggregates real numbers from the bundled + uploaded datasets and from
    MODEL_METRICS, so the Pipeline page indicators reflect actual data
    instead of hardcoded placeholders."""
    csv_paths = [
        os.path.join(MEDIA_DIR, "bcdataset_subset_20260313_114624", "metadata.csv"),
        os.path.join(MEDIA_DIR, "bcdataset_subset_20260428_132406", "slices_info.csv"),
        os.path.join(MEDIA_DIR, "bcdataset_subset_20260428_133158", "slices_info.csv"),
        os.path.join(MEDIA_DIR, "bcdataset_subset_20260428_133535", "slices_info.csv"),
    ]
    if os.path.isdir(UPLOADS_DIR):
        for entry in os.listdir(UPLOADS_DIR):
            candidate = os.path.join(UPLOADS_DIR, entry, "metadata.csv")
            if os.path.isfile(candidate):
                csv_paths.append(candidate)

    patients, volumes, subtypes = set(), set(), set()
    for path in csv_paths:
        for row in _read_dataset_csv(path):
            pid = row.get("patient_id")
            sid = row.get("study_id")
            phase = row.get("phase")
            sub = row.get("mol subtype")
            if pid:
                patients.add(pid)
            if pid and sid and phase:
                volumes.add((pid, sid, phase))
            if sub:
                subtypes.add(sub)

    accuracies = [v["accuracy"] for v in MODEL_METRICS["subtypes"].values()]
    global_accuracy = round(100 * sum(accuracies) / len(accuracies), 1) if accuracies else 0

    return {
        "patients": len(patients),
        "volumes": len(volumes),
        "subtypes": len(subtypes) or len(MODEL_METRICS["subtypes"]),
        "steps": 6,
        "accuracy": global_accuracy,
    }


@app.route("/pipeline")
def pipeline():
    return render_template("pipeline.html", stats=compute_pipeline_stats())


@app.route("/analytics")
def analytics():
    return render_template("analytics.html")


@app.route("/analytics/upload")
def upload_data():
    return render_template("upload.html")


@app.route("/api/uploaded-cases")
def api_uploaded_cases():
    """Lists user-uploaded cases with basic stats, for the upload page."""
    cases = []
    if os.path.isdir(UPLOADS_DIR):
        for entry in sorted(os.listdir(UPLOADS_DIR), reverse=True):
            case_dir = os.path.join(UPLOADS_DIR, entry)
            csv_path = os.path.join(case_dir, "metadata.csv")
            images_dir = os.path.join(case_dir, "images")
            if not (os.path.isfile(csv_path) and os.path.isdir(images_dir)):
                continue

            try:
                with open(csv_path, "r", encoding="utf-8-sig") as f:
                    rows = list(csv.DictReader(f))
            except Exception:
                rows = []

            patients = sorted({r.get("Patient_ID", "-") for r in rows})
            n_images = len([
                fn for fn in os.listdir(images_dir)
                if os.path.splitext(fn)[1].lower() in ALLOWED_IMAGE_EXT
            ])

            cases.append({
                "caseId": entry,
                "rows": len(rows),
                "images": n_images,
                "patients": patients,
            })

    return jsonify(cases)


@app.route("/api/model-metrics")
def api_model_metrics():
    return jsonify(MODEL_METRICS)


@app.route("/api/datasets")
def api_datasets():
    """Lists built-in datasets plus any user-uploaded ones, so the frontend
    can discover new cases without a hardcoded list."""
    datasets = [
        {
            "csv": "/media/bcdataset_subset_20260313_114624/metadata.csv",
            "imageBase": "/media/bcdataset_subset_20260313_114624/images/",
            "type": "old",
        },
        {
            "csv": "/media/bcdataset_subset_20260428_132406/slices_info.csv",
            "imageBase": "/media/bcdataset_subset_20260428_132406/output_JPG/",
            "type": "new",
        },
        {
            "csv": "/media/bcdataset_subset_20260428_133158/slices_info.csv",
            "imageBase": "/media/bcdataset_subset_20260428_133158/output_JPG/",
            "type": "new",
        },
        {
            "csv": "/media/bcdataset_subset_20260428_133535/slices_info.csv",
            "imageBase": "/media/bcdataset_subset_20260428_133535/output_JPG/",
            "type": "new",
        },
    ]

    if os.path.isdir(UPLOADS_DIR):
        for entry in sorted(os.listdir(UPLOADS_DIR)):
            case_dir = os.path.join(UPLOADS_DIR, entry)
            csv_path = os.path.join(case_dir, "metadata.csv")
            images_dir = os.path.join(case_dir, "images")
            if os.path.isfile(csv_path) and os.path.isdir(images_dir):
                datasets.append({
                    "csv": f"/media/user_uploads/{entry}/metadata.csv",
                    "imageBase": f"/media/user_uploads/{entry}/images/",
                    "type": "old",
                    "userUploaded": True,
                })

    return jsonify(datasets)


def _validate_csv(file_storage):
    raw = file_storage.read()
    file_storage.seek(0)

    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        return None, "O ficheiro CSV está vazio ou é inválido."

    headers = [h.strip() for h in reader.fieldnames]
    missing = [c for c in REQUIRED_CSV_COLUMNS if c not in headers]
    if missing:
        return None, f"Faltam colunas obrigatórias no CSV: {', '.join(missing)}."

    rows = list(reader)
    if not rows:
        return None, "O CSV não contém nenhuma linha de dados."

    referenced_images = set()
    for i, row in enumerate(rows, start=2):
        try:
            for col in ("Phase", "Slice", "X_min", "X_max", "Y_min", "Y_max"):
                float(row[col])
        except (ValueError, TypeError):
            return None, f"Valor numérico inválido na linha {i} (coluna '{col}')."

        basename = (row.get("Basename") or "").strip()
        if not basename:
            return None, f"Basename em falta na linha {i}."
        if not basename.lower().endswith((".jpg", ".jpeg")):
            basename += ".jpg"
        referenced_images.add(basename)

    return {"rows": rows, "headers": headers, "referenced_images": referenced_images, "raw_text": text}, None


def _enrich_uploaded_roi_intensities(parsed, images_dir):
    """Calculate 8-bit grayscale JPEG mean inside half-open bounding boxes.

    Existing valid MeanIntensity values are preserved. Invalid/missing images or
    bounding boxes yield an empty cell, never an invented zero. The calculation
    is over the whole bounding box, not a segmented tumour or DICOM signal.
    """
    columns = list(parsed["headers"])
    if "MeanIntensity" not in columns:
        columns.append("MeanIntensity")

    calculated = preserved = unavailable = 0
    for row in parsed["rows"]:
        existing = str(row.get("MeanIntensity") or "").strip()
        if existing:
            try:
                if math.isfinite(float(existing)) and 0 <= float(existing) <= 255:
                    preserved += 1
                    continue
            except ValueError:
                pass
        row["MeanIntensity"] = ""
        try:
            name = (row.get("Basename") or "").strip()
            if not name.lower().endswith((".jpg", ".jpeg")):
                name += ".jpg"
            filename = secure_filename(name)
            path = os.path.join(images_dir, filename)
            x0, x1, y0, y1 = [int(float(row[k])) for k in
                                  ("X_min", "X_max", "Y_min", "Y_max")]
            with Image.open(path) as im:
                gray = im.convert("L")
                width, height = gray.size
                if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
                    unavailable += 1
                    continue
                val = ImageStat.Stat(gray.crop((x0, y0, x1, y1))).mean[0]
            if math.isfinite(val):
                row["MeanIntensity"] = f"{val:.2f}"
                calculated += 1
            else:
                unavailable += 1
        except (OSError, ValueError, KeyError, TypeError):
            unavailable += 1
    return columns, {"calculated": calculated, "preserved": preserved,
                     "unavailable": unavailable}


@app.route("/api/upload-case", methods=["POST"])
def api_upload_case():
    csv_file = request.files.get("csv")
    image_files = request.files.getlist("images")

    if not csv_file:
        return jsonify({"ok": False, "error": "Nenhum ficheiro CSV enviado."}), 400
    if not image_files:
        return jsonify({"ok": False, "error": "Nenhuma imagem enviada."}), 400

    parsed, error = _validate_csv(csv_file)
    if error:
        return jsonify({"ok": False, "error": error}), 400

    # Validate image extensions
    image_names = []
    for img in image_files:
        name = secure_filename(img.filename or "")
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXT:
            return jsonify({"ok": False, "error": f"Ficheiro de imagem inválido: {img.filename}"}), 400
        image_names.append(name)

    missing_images = parsed["referenced_images"] - set(image_names)
    if missing_images:
        sample = ", ".join(sorted(list(missing_images))[:5])
        return jsonify({
            "ok": False,
            "error": f"O CSV referencia imagens que não foram enviadas (ex: {sample})."
        }), 400

    # Create a unique case directory
    case_id = f"case_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    case_dir = os.path.join(UPLOADS_DIR, case_id)
    images_dir = os.path.join(case_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    # Save images first; intensity calculation requires the actual JPEG files.
    saved = 0
    try:
        for img in image_files:
            name = secure_filename(img.filename or "")
            img.save(os.path.join(images_dir, name))
            saved += 1

        fields, intensity_summary = _enrich_uploaded_roi_intensities(parsed, images_dir)
        csv_path = os.path.join(case_dir, "metadata.csv")
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(parsed["rows"])
    except Exception:
        shutil.rmtree(case_dir, ignore_errors=True)
        app.logger.exception("Falha ao guardar o caso e as intensidades")
        return jsonify({"ok": False, "error": "Não foi possível guardar o caso."}), 500

    return jsonify({
        "ok": True,
        "caseId": case_id,
        "rows": len(parsed["rows"]),
        "images": saved,
        "intensity": intensity_summary,
        "csv": f"/media/user_uploads/{case_id}/metadata.csv",
        "imageBase": f"/media/user_uploads/{case_id}/images/",
    })


if __name__ == "__main__":
    app.run(debug=True)