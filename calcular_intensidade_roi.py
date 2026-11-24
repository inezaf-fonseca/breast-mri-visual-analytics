"""Calcular MeanIntensity nos CSV das coleções incluídas na aplicação.

Cada valor é a média dos píxeis, em escala de cinzentos 8 bits (0–255),
no retângulo [xmin,xmax) x [ymin,ymax) da imagem JPEG processada.
Não mede intensidade DICOM nem segmenta a lesão.

Execução: python calcular_intensidade_roi.py
Por defeito processa apenas os três CSV sem MeanIntensity; mantém o ISPY1.
"""
from pathlib import Path
from PIL import Image, ImageStat
import csv
import math

ROOT = Path(__file__).resolve().parent / "media_data"
COLLECTIONS = [
    "bcdataset_subset_20260428_132406",  # ISPY2
    "bcdataset_subset_20260428_133158",  # DUKE
    "bcdataset_subset_20260428_133535",  # NACT
]

def process(csv_path: Path):
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    if "MeanIntensity" not in fieldnames:
        fieldnames.append("MeanIntensity")
    done = missing = invalid = 0
    for row in rows:
        # Nunca substituir um valor que já exista.
        if str(row.get("MeanIntensity") or "").strip():
            continue
        row["MeanIntensity"] = ""
        try:
            x0, x1, y0, y1 = (int(float(row[k])) for k in
                ("bbox_xmin", "bbox_xmax", "bbox_ymin", "bbox_ymax"))
            img_rel = row["jpg_path"].strip().replace("\\", "/")
            image_path = (csv_path.parent / img_rel).resolve()
            if not image_path.is_relative_to(csv_path.parent.resolve()) or not image_path.is_file():
                missing += 1
                continue
            with Image.open(image_path) as im:
                gray = im.convert("L")
                width, height = gray.size
                # Evita preencher áreas exteriores da imagem com preto.
                if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
                    invalid += 1
                    continue
                val = ImageStat.Stat(gray.crop((x0, y0, x1, y1))).mean[0]
            if math.isfinite(val):
                row["MeanIntensity"] = f"{val:.2f}"
                done += 1
            else:
                invalid += 1
        except (ValueError, KeyError, OSError):
            invalid += 1
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{csv_path.parent.name}: {done} calculados; {missing} JPEG em falta; {invalid} registos inválidos; {len(rows)} registos")
    return done, missing, invalid

if __name__ == "__main__":
    for folder in COLLECTIONS:
        process(ROOT / folder / "slices_info.csv")
