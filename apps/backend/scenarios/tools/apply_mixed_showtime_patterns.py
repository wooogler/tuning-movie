import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def round_to_ten_minutes(time_text: str) -> str:
    hour, minute = map(int, time_text.split(":"))
    rounded = int(round(minute / 10.0) * 10)
    if rounded == 60:
        hour = (hour + 1) % 24
        rounded = 0
    return f"{hour:02d}:{rounded:02d}"


def replace_schedule(data: dict, movie_id: str, theater_id: str, date: str, schedule: list[tuple[str, str]], keep_ids: list[str]) -> None:
    existing = [
        s for s in data["showings"] if s["movieId"] == movie_id and s["theaterId"] == theater_id and s["date"] == date
    ]
    if not existing:
        existing = [s for s in data["showings"] if s["movieId"] == movie_id and s["theaterId"] == theater_id]
    if not existing:
        existing = [s for s in data["showings"] if s["movieId"] == movie_id]
    if not existing:
        return
    template = existing[0].copy()
    data["showings"] = [
        s for s in data["showings"] if not (s["movieId"] == movie_id and s["theaterId"] == theater_id and s["date"] == date)
    ]

    new_rows = []
    for index, (time_text, fmt) in enumerate(schedule):
        row = template.copy()
        row["movieId"] = movie_id
        row["theaterId"] = theater_id
        row["date"] = date
        row["time"] = time_text
        row["format"] = fmt
        row["id"] = keep_ids[index] if index < len(keep_ids) else f"{template['id']}_{date.replace('-', '')}_{time_text.replace(':', '')}_{fmt.lower()}"
        new_rows.append(row)
    data["showings"].extend(new_rows)


def update_time_rule(data: dict, movie_id: str, theater_id: str, date: str, schedule: list[tuple[str, str]]) -> None:
    for rule in data["assertions"].get("timeRules", []):
        if rule["movieId"] == movie_id and rule["theaterId"] == theater_id and rule["date"] == date:
            rule["expectedShowings"] = [{"time": time_text, "format": fmt} for time_text, fmt in schedule]
            return
    data["assertions"].setdefault("timeRules", []).append({
        "movieId": movie_id,
        "theaterId": theater_id,
        "date": date,
        "expectedShowings": [{"time": time_text, "format": fmt} for time_text, fmt in schedule],
    })


def sync_date_rule(data: dict, movie_id: str, theater_id: str) -> None:
    expected_dates = sorted({
        showing["date"]
        for showing in data["showings"]
        if showing["movieId"] == movie_id and showing["theaterId"] == theater_id
    })
    if not expected_dates:
        return
    for rule in data["assertions"].get("dateRules", []):
        if rule["movieId"] == movie_id and rule["theaterId"] == theater_id:
            rule["expectedDates"] = expected_dates
            return
    data["assertions"].setdefault("dateRules", []).append({
        "movieId": movie_id,
        "theaterId": theater_id,
        "expectedDates": expected_dates,
    })


def normalize_remaining_times(data: dict) -> None:
    for showing in data["showings"]:
        showing["time"] = round_to_ten_minutes(showing["time"])
    for rule in data["assertions"].get("timeRules", []):
        for item in rule.get("expectedShowings", []):
            item["time"] = round_to_ten_minutes(item["time"])


def remove_movie_theater(data: dict, movie_id: str, theater_id: str) -> None:
    data["showings"] = [
        showing
        for showing in data["showings"]
        if not (showing["movieId"] == movie_id and showing["theaterId"] == theater_id)
    ]
    data["assertions"]["timeRules"] = [
        rule
        for rule in data["assertions"].get("timeRules", [])
        if not (rule["movieId"] == movie_id and rule["theaterId"] == theater_id)
    ]
    data["assertions"]["dateRules"] = [
        rule
        for rule in data["assertions"].get("dateRules", [])
        if not (rule["movieId"] == movie_id and rule["theaterId"] == theater_id)
    ]


def apply_file(filename: str, operations: list[tuple[str, str, str, list[tuple[str, str]], list[str]]]) -> None:
    path = DATA_DIR / filename
    data = json.loads(path.read_text())
    touched_pairs: set[tuple[str, str]] = set()
    for movie_id, theater_id, date, schedule, keep_ids in operations:
        replace_schedule(data, movie_id, theater_id, date, schedule, keep_ids)
        update_time_rule(data, movie_id, theater_id, date, schedule)
        touched_pairs.add((movie_id, theater_id))
    for movie_id, theater_id in sorted(touched_pairs):
        sync_date_rule(data, movie_id, theater_id)
    normalize_remaining_times(data)
    path.write_text(json.dumps(data, indent=2) + "\n")


def cleanup_file(filename: str, removals: list[tuple[str, str]]) -> None:
    path = DATA_DIR / filename
    data = json.loads(path.read_text())
    for movie_id, theater_id in removals:
        remove_movie_theater(data, movie_id, theater_id)
    path.write_text(json.dumps(data, indent=2) + "\n")


apply_file(
    "scn_s1_t1_child_playdate_easy.json",
    [
        ("m1", "t1", "2026-03-15", [("11:40", "Standard"), ("13:10", "Standard"), ("15:20", "Standard"), ("16:50", "Standard")], [
            "s_m1_t1_20260412_1310_20260315_1140_standard",
            "s_m1_t1_20260412_1310",
            "s_m1_t1_20260412_1520",
            "s_m1_t1_20260315_1650_standard",
        ]),
    ],
)

apply_file(
    "scn_s1_t2_action_friend_hard.json",
    [
        ("m1", "t1", "2026-03-14", [("16:10", "IMAX"), ("18:10", "IMAX"), ("20:00", "Standard")], [
            "s_m1_t1_20260314_1710_standard",
            "s_m1_t1_20260418_1810",
            "s_m1_t1_20260418_2040",
        ]),
        ("m1", "t2", "2026-03-14", [("17:10", "Standard"), ("18:10", "Standard"), ("21:10", "Standard")], [
            "s_m1_t2_20260418_1720",
            "s_m1_t2_20260418_2015",
            "s_m1_t2_20260314_2110_standard",
        ]),
        ("m2", "t1", "2026-03-14", [("14:50", "Standard"), ("16:10", "Standard"), ("17:20", "IMAX"), ("18:40", "IMAX")], [
            "s_m2_t1_20260314_1450_standard",
            "s_m2_t1_20260314_1610_standard",
            "s_m2_t1_20260313_1720_standard_20260314_1720",
            "s_m2_t1_20260314_1840_standard",
        ]),
        ("m2", "t2", "2026-03-14", [("17:20", "Standard"), ("18:30", "Standard"), ("20:50", "Standard")], [
            "s_m2_t2_20260314_1720_standard",
            "s_m2_t2_20260314_1830_standard",
            "s_m2_t2_20260314_2040_standard",
        ]),
    ],
)

apply_file(
    "scn_s2_t1_solo_sf_easy.json",
    [
        ("m1", "t1", "2026-03-12", [("14:10", "Standard"), ("16:00", "Standard"), ("18:00", "Standard")], [
            "s_m1_t1_20260312_1410_standard",
            "s_m1_t1_20260420_1610",
            "s_m1_t1_20260312_1800_standard",
        ]),
        ("m1", "t2", "2026-03-14", [("13:20", "Standard"), ("15:10", "Standard"), ("17:20", "Standard")], [
            "s_m1_t2_20260314_1320_standard",
            "s_m1_t2_20260314_1510_standard",
            "s_m1_t2_20260314_1720_standard",
        ]),
    ],
)

apply_file(
    "scn_s2_t2_anniversary_hard.json",
    [
        ("m1", "t1", "2026-03-14", [("14:20", "Standard"), ("18:10", "Standard"), ("20:20", "Standard")], [
            "s_m1_t1_20260314_1420_standard",
            "s_m1_t1_20260502_1810",
            "s_m1_t1_20260314_2020_standard",
        ]),
        ("m1", "t1", "2026-03-15", [("10:00", "Standard"), ("18:20", "Standard"), ("20:30", "Standard")], [
            "s_m1_t1_20260315_1000_standard",
            "s_m1_t1_20260315_1820_standard",
            "s_m1_t1_20260315_2030_standard",
        ]),
        ("m1", "t2", "2026-03-14", [("14:10", "Standard"), ("18:00", "Standard"), ("19:50", "Standard")], [
            "s_m1_t2_20260314_1410_standard",
            "s_m1_t2_20260314_1800_standard",
            "s_m1_t2_20260314_1950_standard",
        ]),
        ("m1", "t2", "2026-03-15", [("10:00", "Standard"), ("18:30", "Standard"), ("20:40", "Standard")], [
            "s_m1_t2_20260315_1000_standard",
            "s_m1_t2_20260315_1830_standard",
            "s_m1_t2_20260315_2040_standard",
        ]),
        ("m2", "t1", "2026-03-14", [("13:10", "Standard"), ("15:00", "Standard"), ("17:10", "Standard")], [
            "s_m2_t1_20260314_1310_standard",
            "s_m2_t1_20260314_1500_standard",
            "s_m2_t1_20260314_1710_standard",
        ]),
        ("m2", "t1", "2026-03-15", [("11:40", "Standard"), ("13:10", "Standard"), ("15:10", "Standard")], [
            "s_m2_t1_20260315_1140_standard",
            "s_m2_t1_20260315_1310_standard",
            "s_m2_t1_20260315_1510_standard",
        ]),
        ("m2", "t2", "2026-03-14", [("13:20", "Standard"), ("15:10", "Standard"), ("17:20", "Standard")], [
            "s_m2_t2_20260314_1320_standard",
            "s_m2_t2_20260314_1510_standard",
            "s_m2_t2_20260314_1720_standard",
        ]),
        ("m2", "t2", "2026-03-15", [("11:50", "Standard"), ("13:30", "Standard"), ("15:20", "Standard")], [
            "s_m2_t2_20260315_1150_standard",
            "s_m2_t2_20260503_1330",
            "s_m2_t2_20260315_1520_standard",
        ]),
    ],
)

apply_file(
    "scn_s3_t1_couple_date_easy.json",
    [
        ("m1", "t1", "2026-03-14", [("20:40", "Standard"), ("21:20", "Standard"), ("22:10", "Standard")], [
            "s_m1_t1_20260314_2040_standard",
            "s_m1_t1_20260509_1945",
            "s_m1_t1_20260314_2210_standard",
        ]),
        ("m1", "t1", "2026-03-15", [("15:40", "Standard"), ("17:10", "Standard"), ("18:40", "Standard")], [
            "s_m1_t1_20260510_1540",
            "s_m1_t1_20260315_1710_standard",
            "s_m1_t1_20260315_1840_standard",
        ]),
    ],
)

apply_file(
    "scn_s3_t2_sibling_bmovie_hard.json",
    [
        ("m1", "t2", "2026-03-11", [("18:30", "Standard")], [
            "s_m1_t2_20260311_1830_standard",
        ]),
        ("m1", "t2", "2026-03-12", [("18:30", "Standard")], [
            "s_m1_t2_20260312_1830_standard",
        ]),
        ("m1", "t1", "2026-03-13", [("18:40", "Standard"), ("20:50", "Standard"), ("21:40", "Standard")], [
            "s_m1_t1_20260515_1840",
            "s_m1_t1_20260515_2050",
            "s_m1_t1_20260313_2140_standard",
        ]),
        ("m1", "t2", "2026-03-13", [("18:20", "Standard"), ("19:50", "Standard"), ("21:10", "Standard")], [
            "s_m1_t2_20260313_1820_standard",
            "s_m1_t2_20260313_1950_standard",
            "s_m1_t2_20260313_2110_standard",
        ]),
        ("m1", "t3", "2026-03-13", [("18:30", "Standard"), ("20:00", "Standard"), ("21:20", "Standard")], [
            "s_m1_t3_20260313_1830_standard",
            "s_m1_t3_20260313_2000_standard",
            "s_m1_t3_20260313_2120_standard",
        ]),
        ("m1", "t1", "2026-03-14", [("20:20", "Standard"), ("21:10", "Standard"), ("22:00", "Standard")], [
            "s_m1_t1_20260516_2020",
            "s_m1_t1_20260314_2110_standard",
            "s_m1_t1_20260314_2200_standard",
        ]),
        ("m1", "t2", "2026-03-14", [("18:10", "Standard"), ("20:10", "Standard"), ("21:30", "Standard")], [
            "s_m1_t2_20260314_1810_standard",
            "s_m1_t2_20260314_2010_standard",
            "s_m1_t2_20260314_2130_standard",
        ]),
        ("m1", "t3", "2026-03-14", [("18:20", "Standard"), ("20:00", "Standard"), ("21:20", "Standard")], [
            "s_m1_t3_20260314_1820_standard",
            "s_m1_t3_20260314_2000_standard",
            "s_m1_t3_20260314_2120_standard",
        ]),
        ("m1", "t2", "2026-03-15", [("18:30", "Standard")], [
            "s_m1_t2_20260315_1830_standard",
        ]),
        ("m1", "t3", "2026-03-15", [("18:40", "Standard")], [
            "s_m1_t3_20260315_1840_standard",
        ]),
        ("m2", "t2", "2026-03-11", [("18:10", "Standard")], [
            "s_m2_t2_20260311_1810_standard",
        ]),
        ("m2", "t3", "2026-03-11", [("18:20", "Standard")], [
            "s_m2_t3_20260311_1820_standard",
        ]),
        ("m2", "t2", "2026-03-12", [("18:10", "Standard")], [
            "s_m2_t2_20260312_1810_standard",
        ]),
        ("m2", "t3", "2026-03-12", [("18:20", "Standard")], [
            "s_m2_t3_20260312_1820_standard",
        ]),
        ("m2", "t2", "2026-03-13", [("18:00", "Standard"), ("19:40", "Standard"), ("21:00", "Standard")], [
            "s_m2_t2_20260313_1800_standard",
            "s_m2_t2_20260313_1940_standard",
            "s_m2_t2_20260313_2100_standard",
        ]),
        ("m2", "t3", "2026-03-13", [("18:10", "Standard"), ("19:50", "Standard"), ("21:10", "Standard")], [
            "s_m2_t3_20260313_1810_standard",
            "s_m2_t3_20260313_1950_standard",
            "s_m2_t3_20260313_2110_standard",
        ]),
        ("m2", "t1", "2026-03-14", [("18:10", "Standard"), ("19:30", "Standard"), ("20:40", "Standard")], [
            "s_m2_t1_20260516_1815",
            "s_m2_t1_20260516_1930",
            "s_m2_t1_20260314_2040_standard",
        ]),
        ("m2", "t2", "2026-03-14", [("18:00", "Standard"), ("19:20", "Standard"), ("20:40", "Standard")], [
            "s_m2_t2_20260314_1800_standard",
            "s_m2_t2_20260314_1920_standard",
            "s_m2_t2_20260314_2040_standard",
        ]),
        ("m2", "t3", "2026-03-14", [("18:10", "Standard"), ("19:30", "Standard"), ("20:50", "Standard")], [
            "s_m2_t3_20260314_1810_standard",
            "s_m2_t3_20260314_1930_standard",
            "s_m2_t3_20260314_2050_standard",
        ]),
        ("m2", "t2", "2026-03-15", [("18:10", "Standard")], [
            "s_m2_t2_20260315_1810_standard",
        ]),
        ("m2", "t3", "2026-03-15", [("18:20", "Standard")], [
            "s_m2_t3_20260315_1820_standard",
        ]),
        ("m2", "t1", "2026-03-13", [("18:20", "Standard"), ("20:10", "Standard"), ("21:20", "Standard")], [
            "s_m2_t1_20260313_1820_standard",
            "s_m2_t1_20260313_2010_standard",
            "s_m2_t1_20260313_2120_standard",
        ]),
        ("m3", "t2", "2026-03-13", [("17:00", "Standard"), ("18:10", "Standard"), ("20:10", "Standard")], [
            "s_m3_t2_20260313_1700_standard",
            "s_m3_t2_20260515_1810",
            "s_m3_t2_20260313_2010_standard",
        ]),
    ],
)

apply_file(
    "scn_s4_t1_family_amenity_easy.json",
    [
        ("m1", "t1", "2026-03-15", [("10:50", "Standard"), ("12:20", "Standard"), ("14:00", "Standard"), ("15:50", "Standard")], [
            "s_m1_t1_20260517_1100",
            "s_m1_t1_20260517_1310",
            "s_m1_t1_20260315_1400_standard",
            "s_m1_t1_20260315_1550_standard",
        ]),
    ],
)

apply_file(
    "scn_s4_t2_last_trip_hard.json",
    [
        ("m1", "t2", "2026-03-11", [("16:10", "IMAX")], [
            "s_m1_t2_20260311_1610_imax",
        ]),
        ("m1", "t2", "2026-03-12", [("16:10", "IMAX")], [
            "s_m1_t2_20260312_1610_imax",
        ]),
        ("m1", "t1", "2026-03-13", [("15:30", "IMAX"), ("17:20", "3D"), ("18:10", "Standard")], [
            "s_m1_t1_20260522_1530",
            "s_m1_t1_20260522_1720",
            "s_m1_t1_20260522_1810",
        ]),
        ("m1", "t2", "2026-03-13", [("16:10", "IMAX"), ("17:40", "3D"), ("19:00", "Standard")], [
            "s_m1_t2_20260313_1610_imax",
            "s_m1_t2_20260313_1740_3d",
            "s_m1_t2_20260313_1900_standard",
        ]),
        ("m2", "t1", "2026-03-13", [("16:20", "Standard"), ("17:10", "Standard"), ("18:00", "Standard")], [
            "s_m2_t1_20260522_1620",
            "s_m2_t1_20260522_1715",
            "s_m2_t1_20260522_1805",
        ]),
        ("m2", "t2", "2026-03-13", [("16:00", "Standard"), ("17:30", "Standard"), ("19:10", "Standard")], [
            "s_m2_t2_20260313_1600_standard",
            "s_m2_t2_20260313_1730_standard",
            "s_m2_t2_20260313_1910_standard",
        ]),
        ("m3", "t1", "2026-03-13", [("15:40", "Standard"), ("17:00", "Standard"), ("19:20", "Standard")], [
            "s_m3_t1_20260313_1540_standard",
            "s_m3_t1_20260313_1700_standard",
            "s_m3_t1_20260313_1920_standard",
        ]),
        ("m2", "t2", "2026-03-14", [("16:00", "Standard")], [
            "s_m2_t2_20260314_1600_standard",
        ]),
        ("m2", "t2", "2026-03-15", [("16:00", "Standard")], [
            "s_m2_t2_20260315_1600_standard",
        ]),
        ("m1", "t2", "2026-03-14", [("16:10", "IMAX")], [
            "s_m1_t2_20260314_1610_imax",
        ]),
        ("m1", "t2", "2026-03-15", [("16:10", "IMAX")], [
            "s_m1_t2_20260315_1610_imax",
        ]),
    ],
)

cleanup_file(
    "scn_s4_t2_last_trip_hard.json",
    [("m3", "t2")],
)

print("Applied mixed showtime patterns.")
