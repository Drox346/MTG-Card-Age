import csv
import json
import os

SCRIPT_PATH = os.path.dirname(os.path.realpath(__file__))

in_path  = f"{SCRIPT_PATH}/../../data/original_data.csv"
out_path = f"{SCRIPT_PATH}/../../data/card_data.csv"
expansions_path = f"{SCRIPT_PATH}/../../data/expansions.json"

with open(expansions_path, "r", encoding="utf-8") as f:
  expansions_by_year = json.load(f)

expansion_to_year = {
  code: int(year)
  for year, codes in expansions_by_year.items()
  for code in codes
}

def dedupe_file(path: str) -> None:
  with open(path, "r", encoding="utf-8", newline="") as f:
    reader = csv.reader(f)
    max_year_by_name = {}
    for row in reader:
      if len(row) < 2:
        continue

      name = row[0].strip()
      if not name:
        continue

      try:
        year = int(row[1])
      except ValueError:
        continue

      prev = max_year_by_name.get(name)
      if prev is None or year > prev:
        max_year_by_name[name] = year

  with open(path, "w", encoding="utf-8", newline="\n") as f:
    for name in sorted(max_year_by_name):
      f.write(f"\"{name}\",{max_year_by_name[name]}\n")

with open(in_path, "r", newline="") as fin, open(out_path, "w", newline="", buffering=1024*1024) as fout:
  r = csv.reader(fin)
  next(r, None)  # skip header

  for row in r:
    if len(row) <= 66:
      continue
    year = expansion_to_year.get(row[66])
    if year is None:
      continue

    name = row[49] if len(row) > 49 else ""
    if not name:
      continue

    fout.write(f"\"{name}\",{year}\n")

dedupe_file(out_path)
