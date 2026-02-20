import os, csv

SCRIPT_PATH = os.path.dirname(os.path.realpath(__file__))

origin_to_year = {
  **{k: 2027 for k in {"WOE","LCI","MKM","OTJ","BIG","BLB","DSK"}},
  **{k: 2028 for k in {"DFT","TDM","FIN","EOE","SPM", "TLA"}},
  **{k: 2029 for k in {"ECL"}},
  **{k: 2030 for k in {"FDN"}},
}

in_path  = f"{SCRIPT_PATH}/../data/original_data.csv"
out_path = f"{SCRIPT_PATH}/../data/card_data.csv"

with open(in_path, "r", newline="") as fin, open(out_path, "w", newline="", buffering=1024*1024) as fout:
  r = csv.reader(fin)
  next(r, None)  # skip header

  for row in r:
    if len(row) <= 66:
      continue
    year = origin_to_year.get(row[66])
    if year is None:
      continue

    name = row[49] if len(row) > 49 else ""
    if not name:
      continue

    fout.write(f"\"{name}\",{year}\n")