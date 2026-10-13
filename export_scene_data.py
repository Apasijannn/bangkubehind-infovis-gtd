"""
Group 01 (BangKuBehind) - EA234506 Assignment 2, immersive version.

Usage:
    python export_scene_data.py path/to/globalterrorismdb_0718dist.csv [scene-data.json]
"""
import json
import os
import sys

import numpy as np
import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "../../data/globalterrorismdb_0718dist.csv"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "scene-data.json")

df = pd.read_csv(SRC, encoding="ISO-8859-1", low_memory=False)
df = df.rename(columns={k: v for k, v in {"region_txt": "region", "country_txt": "country",
                                          "attacktype1_txt": "attack_type"}.items() if k in df.columns})
df["attack_type"] = df["attack_type"].replace({
    "Bombing/Explosion": "Explosion", "Hostage Taking (Kidnapping)": "Kidnapping",
    "Facility/Infrastructure Attack": "Facility Attack", "Hostage Taking (Barricade Incident)": "Barricade"})

A, B = "Middle East & North Africa", "South Asia"
Y0, Y1 = int(df.iyear.min()), int(df.iyear.max())

# regions: attacks and deaths (V3)
by_region = df.groupby("region").size().sort_values(ascending=False)
deaths_region = df.groupby("region")["nkill"].sum()

# Q2 yearly, three groups; years with no data (1993) become null
grp = df.region.where(df.region.isin([A, B]), "Rest of world")
yearly = df.groupby(["iyear", grp]).size().unstack(fill_value=0).reindex(range(Y0, Y1 + 1))
yearly_d = df.groupby(["iyear", grp])["nkill"].sum().unstack(fill_value=0).reindex(range(Y0, Y1 + 1))
total = yearly.sum(axis=1, min_count=1)

def series(col, tbl=None):
    tbl = yearly if tbl is None else tbl
    return [None if pd.isna(v) else int(v) for v in tbl[col]]

# Q3 attack types (Unknown excluded), sorted by number of attacks
atk = df[df.attack_type != "Unknown"].groupby("attack_type").agg(
    attacks=("eventid", "size"), deaths_per=("nkill", "mean")).sort_values("attacks", ascending=False)

# Q4 top-10 countries by deaths
ctry = df.groupby("country").agg(deaths=("nkill", "sum"), region=("region", "first"))
ctry = ctry.sort_values("deaths", ascending=False).head(10)

# Q5 attacks per country, with the same name fixes as the 2D map
NAME_FIX = {
    "United States": "United States of America", "West Bank and Gaza Strip": "West Bank",
    "West Germany (FRG)": "Germany", "East Germany (GDR)": "Germany",
    "Yugoslavia": "Republic of Serbia", "Serbia-Montenegro": "Republic of Serbia", "Serbia": "Republic of Serbia",
    "Bosnia-Herzegovina": "Bosnia and Herzegovina", "Rhodesia": "Zimbabwe", "Soviet Union": "Russia",
    "Tanzania": "United Republic of Tanzania", "Zaire": "Democratic Republic of the Congo",
    "Slovak Republic": "Slovakia", "Czechoslovakia": "Czech Republic", "Guinea-Bissau": "Guinea Bissau",
    "North Yemen": "Yemen", "South Yemen": "Yemen", "Bahamas": "The Bahamas",
    "People's Republic of the Congo": "Republic of the Congo", "South Vietnam": "Vietnam",
    "New Hebrides": "Vanuatu",
}
per_country = df.assign(g=df.country.replace(NAME_FIX)).groupby("g").size()
top5 = per_country.sort_values(ascending=False).head(5)

data = {
    "meta": {"source": "START (2018). Global Terrorism Database. Kaggle START-UMD/gtd",
             "n_attacks": int(len(df)), "year_min": Y0, "year_max": Y1,
             "peak_year": int(total.idxmax()), "peak_attacks": int(total.max()),
             "highlight": {"A": A, "B": B}},
    "regions": [{"name": r, "attacks": int(v), "deaths": int(deaths_region[r])} for r, v in by_region.items()],
    "yearly": {"years": list(range(Y0, Y1 + 1)), "A": series(A), "B": series(B),
               "rest": series("Rest of world")},
    "yearly_deaths": {"years": list(range(Y0, Y1 + 1)), "A": series(A, yearly_d), "B": series(B, yearly_d),
                      "rest": series("Rest of world", yearly_d)},
    "attack_types": [{"type": t, "attacks": int(r.attacks), "deaths_per": round(float(r.deaths_per), 2)}
                     for t, r in atk.iterrows()],
    "top_countries": [{"country": c, "deaths": int(r.deaths), "region": r.region} for c, r in ctry.iterrows()],
    "countries": {k: int(v) for k, v in per_country.items()},
    "share_parent": {"Somaliland": "Somalia", "Northern Cyprus": "Cyprus"},
    "top5_by_attacks": list(top5.index),
    "map_classes": {"edges": [0, 1, 101, 1001, 5001, 10001],
                    "labels": ["0", "1-100", "101-1,000", "1,001-5,000", "5,001-10,000", "> 10,000"]},
}
with open(OUT, "w") as f:
    json.dump(data, f, indent=1)
print("wrote", OUT, "|", data["meta"])
