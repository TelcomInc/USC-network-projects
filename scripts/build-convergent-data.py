import json
import re
from datetime import date, datetime
from pathlib import Path

import openpyxl
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK_PATH = Path(r"C:\Users\Ryan\OneDrive - Telcom Inc\Documents\convergent-recovered-device-workbook finished.xlsx")
PDF_PATH = Path(r"C:\Users\Ryan\OneDrive - Telcom Inc\Documents\All Gathering Building layouts.pdf")
OUTPUT_PATH = ROOT / "assets" / "convergent-data.js"


def clean_value(value):
    if value in (None, "", "#VALUE!"):
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()


def workbook_rows():
    workbook = openpyxl.load_workbook(WORKBOOK_PATH, read_only=True, data_only=True)
    result = {}
    for sheet in workbook.worksheets:
        rows = sheet.iter_rows(values_only=True)
        headers = [str(value or "").strip() for value in next(rows)]
        number_header = headers[0]
        records = {}
        for values in rows:
            number = clean_value(values[0] if values else None)
            if not number:
                continue
            record = {}
            for header, value in zip(headers, values):
                cleaned = clean_value(value)
                if not header or cleaned is None or header.lower() == "picture":
                    continue
                record[header] = cleaned
            record[number_header] = number
            records[number.lower()] = record
        result[sheet.title] = records
    return result


def marker_type(page_number, label, color):
    number = int(re.match(r"\d+", label).group())
    if page_number >= 11:
        return "Displays"
    if page_number >= 7:
        return "Unit Locks"
    if page_number in (2, 5):
        return "Network" if color in ((0.98, 0.027, 0.027), (0.0, 0.0, 0.0)) else "Access Control"
    if page_number == 1 and color == (0.2, 0.773, 0.91):
        return "Access Control"
    access_ranges = {3: range(9, 12), 4: range(12, 15), 6: range(15, 18)}
    if number in access_ranges.get(page_number, ()):
        return "Access Control"
    return "Cameras"


def markers():
    reader = PdfReader(PDF_PATH)
    found = []
    for page_number, page in enumerate(reader.pages, 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        color = [None]

        def visit_operand(operator, operands, _cm, _tm):
            if operator == b"rg":
                color[0] = tuple(round(float(value), 3) for value in operands)

        def visit_text(text, _cm, tm, _font, _size):
            label = text.strip()
            if not re.fullmatch(r"\d{1,2}[ab]?", label):
                return
            x, y = float(tm[4]), float(tm[5])
            if x <= 0 or y <= 0 or x > width or y > height:
                return
            found.append({
                "page": page_number,
                "number": label.lower(),
                "type": marker_type(page_number, label, color[0]),
                "x": round(x / width * 100, 4),
                "y": round((height - y) / height * 100, 4),
            })

        page.extract_text(visitor_operand_before=visit_operand, visitor_text=visit_text)

    found.extend([
        {"page": 1, "number": "5", "type": "Cameras", "x": 70.493, "y": 32.656},
        {"page": 3, "number": "29", "type": "Cameras", "x": 52.718, "y": 71.026},
        {"page": 4, "number": "13", "type": "Access Control", "x": 41.0, "y": 33.916},
        {"page": 6, "number": "15", "type": "Access Control", "x": 28.116, "y": 34.502},
        {"page": 2, "number": "5", "type": "Network", "x": 49.366, "y": 80.2},
        {"page": 11, "number": "2", "type": "Displays", "x": 36.271, "y": 41.6},
        {"page": 11, "number": "17", "type": "Displays", "x": 77.611, "y": 40.986},
        {"page": 12, "number": "35", "type": "Displays", "x": 76.915, "y": 56.504},
        {"page": 12, "number": "42", "type": "Displays", "x": 34.689, "y": 61.831},
        {"page": 14, "number": "67", "type": "Displays", "x": 65.461, "y": 40.537},
        {"page": 14, "number": "70", "type": "Displays", "x": 76.106, "y": 57.568},
    ])
    return found


payload = {"deviceRows": workbook_rows(), "markers": markers(), "pageCount": 14}
OUTPUT_PATH.write_text(
    "window.CONVERGENT_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
