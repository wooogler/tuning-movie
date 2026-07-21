import hashlib
import json
import random
from pathlib import Path
from typing import Any

ROWS = ["A", "B", "C", "D", "E", "F"]
SEAT_NUMBERS = list(range(1, 9))
DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def rng_for(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:16], 16)
    return random.Random(seed)


def two_tier_template() -> dict:
    return {
        "rows": ROWS,
        "seatsPerRow": 8,
        "defaultType": "standard",
        "defaultPrice": 14,
        "defaultStatus": "available",
        "rowRules": [
            {"row": "A", "type": "standard", "price": 14},
            {"row": "B", "type": "standard", "price": 14},
            {"row": "C", "type": "standard", "price": 14},
            {"row": "D", "type": "standard", "price": 14},
            {"row": "E", "type": "premium", "price": 19},
            {"row": "F", "type": "premium", "price": 19},
        ],
    }


def natural_available_map(showing_id: str) -> dict[str, list[int]]:
    rng = rng_for(showing_id)
    available: dict[str, list[int]] = {}
    for row in ROWS:
        if row in {"A", "B"}:
            count = rng.randint(0, 2)
        elif row in {"C", "D"}:
            count = rng.randint(1, 3)
        else:
            count = rng.randint(1, 4)
        seats = sorted(rng.sample(SEAT_NUMBERS, count)) if count > 0 else []
        available[row] = seats

    total = sum(len(v) for v in available.values())
    while total < 10:
        row = rng.choice(["C", "D", "E", "F"])
        seat = rng.choice(SEAT_NUMBERS)
        if seat not in available[row]:
            available[row].append(seat)
            available[row].sort()
            total += 1
    return available


def no_adjacent_layout(pairs: dict[str, list[int]]) -> dict[str, list[int]]:
    layout = {row: [] for row in ROWS}
    for row, nums in pairs.items():
        layout[row] = sorted(nums)
    return layout


def pair_layout(pair_row: str, pair_start: int, extras: dict[str, list[int]] | None = None) -> dict[str, list[int]]:
    layout = {row: [] for row in ROWS}
    layout[pair_row] = [pair_start, pair_start + 1]
    for row, nums in (extras or {}).items():
        layout[row] = sorted(nums)
    return layout


def occupied_override_records(showing_id: str, available_map: dict[str, list[int]]) -> list[dict]:
    overrides = []
    for row in ROWS:
        available = set(available_map.get(row, []))
        occupied = [num for num in SEAT_NUMBERS if num not in available]
        overrides.append({
            "showingId": showing_id,
            "row": row,
            "occupiedNumbers": occupied,
        })
    return overrides


def replace_showing_overrides(data: dict, showing_id: str, available_map: dict[str, list[int]]) -> None:
    data["seatOverrides"] = [o for o in data.get("seatOverrides", []) if o.get("showingId") != showing_id]
    data["seatOverrides"].extend(occupied_override_records(showing_id, available_map))


def set_relevant_assertions(data: dict, rules: list[tuple[str, str, list[int], int | None, int | None]]) -> None:
    seat_rules: list[dict[str, Any]] = []
    adjacency_rules: list[dict[str, Any]] = []
    for showing_id, row, nums, min_adj, max_adj in rules:
        seat_rules.append({
            "showingId": showing_id,
            "row": row,
            "expectedAvailableNumbers": nums,
        })
        adj: dict[str, Any] = {"showingId": showing_id, "row": row}
        if min_adj is not None:
            adj["minAdjacentAvailable"] = min_adj
        if max_adj is not None:
            adj["maxAdjacentAvailable"] = max_adj
        adjacency_rules.append(adj)
    data["assertions"]["seatAvailabilityRules"] = seat_rules
    data["assertions"]["adjacencyRules"] = adjacency_rules


def apply_patterns(filename: str, explicit_layouts: dict[str, dict[str, list[int]]], relevant_rules: list[tuple[str, str, list[int], int | None, int | None]]) -> None:
    path = DATA_DIR / filename
    data = json.loads(path.read_text())
    data["seatTemplate"] = two_tier_template()

    data["seatOverrides"] = []
    for showing in data["showings"]:
      showing_id = showing["id"]
      layout = explicit_layouts.get(showing_id) or natural_available_map(showing_id)
      replace_showing_overrides(data, showing_id, layout)

    set_relevant_assertions(data, relevant_rules)
    path.write_text(json.dumps(data, indent=2) + "\n")


apply_patterns(
    "scn_s1_t1_child_playdate_easy.json",
    {
        "s_m1_t1_20260412_1310": no_adjacent_layout({"D": [2], "E": [4], "F": [6]}),
        "s_m1_t1_20260412_1520": pair_layout("D", 4, {"E": [2, 7], "F": [3]}),
    },
    [
        ("s_m1_t1_20260412_1310", "D", [2], None, 1),
        ("s_m1_t1_20260412_1310", "E", [4], None, 1),
        ("s_m1_t1_20260412_1310", "F", [6], None, 1),
        ("s_m1_t1_20260412_1520", "D", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s1_t2_action_friend_hard.json",
    {
        "s_m1_t1_20260418_1810": no_adjacent_layout({"D": [2], "E": [4], "F": [6]}),
        "s_m2_t2_20260314_1830_standard": pair_layout("D", 4, {"E": [2], "F": [7]}),
    },
    [
        ("s_m1_t1_20260418_1810", "D", [2], None, 1),
        ("s_m2_t2_20260314_1830_standard", "D", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s2_t1_solo_sf_easy.json",
    {},
    [],
)

apply_patterns(
    "scn_s2_t2_anniversary_hard.json",
    {
        "s_m1_t1_20260315_1150_standard": no_adjacent_layout({"D": [5], "E": [2, 4], "F": [3]}),
        "s_m1_t1_20260315_1510_standard": no_adjacent_layout({"E": [2], "F": [7]}),
        "s_m1_t2_20260502_1615": pair_layout("F", 4, {"E": [2]}),
        "s_m1_t2_20260315_1140_standard": pair_layout("E", 4, {"F": [7]}),
    },
    [
        ("s_m1_t1_20260315_1150_standard", "D", [5], None, 1),
        ("s_m1_t1_20260315_1150_standard", "E", [2, 4], None, 1),
        ("s_m1_t1_20260315_1510_standard", "E", [2], None, 1),
        ("s_m1_t1_20260315_1510_standard", "F", [7], None, 1),
        ("s_m1_t2_20260502_1615", "F", [4, 5], 2, None),
        ("s_m1_t2_20260315_1140_standard", "E", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s3_t1_couple_date_easy.json",
    {
        "s_m1_t1_20260510_1540": pair_layout("E", 4, {"F": [3]}),
    },
    [
        ("s_m1_t1_20260510_1540", "E", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s3_t2_sibling_bmovie_hard.json",
    {
        "s_m1_t1_20260515_1840": no_adjacent_layout({"C": [1, 3, 5], "D": [2], "E": [4]}),
        "s_m2_t1_20260313_1820_standard": no_adjacent_layout({"C": [2, 5], "D": [1], "E": [7]}),
        "s_m2_t1_20260313_2010_standard": pair_layout("D", 4, {"E": [2], "F": [7]}),
        "s_m2_t1_20260516_1815": no_adjacent_layout({"C": [2, 5], "D": [1], "E": [7]}),
        "s_m2_t1_20260516_1930": pair_layout("D", 4, {"E": [2], "F": [7]}),
    },
    [
        ("s_m1_t1_20260515_1840", "C", [1, 3, 5], None, 1),
        ("s_m2_t1_20260313_1820_standard", "C", [2, 5], None, 1),
        ("s_m2_t1_20260313_2010_standard", "D", [4, 5], 2, None),
        ("s_m2_t1_20260516_1815", "C", [2, 5], None, 1),
        ("s_m2_t1_20260516_1930", "D", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s4_t1_family_amenity_easy.json",
    {
        "s_m1_t1_20260517_1100": no_adjacent_layout({"A": [1], "B": [8], "C": [2], "D": [7]}),
        "s_m1_t1_20260517_1310": pair_layout("D", 4, {"E": [2]}),
    },
    [
        ("s_m1_t1_20260517_1100", "C", [2], None, 1),
        ("s_m1_t1_20260517_1310", "D", [4, 5], 2, None),
    ],
)

apply_patterns(
    "scn_s4_t2_last_trip_hard.json",
    {
        "s_m1_t1_20260522_1810": no_adjacent_layout({"D": [2], "E": [1, 7], "F": [8]}),
        "s_m2_t1_20260522_1620": no_adjacent_layout({"D": [2], "E": [7], "F": [1]}),
        "s_m2_t1_20260522_1715": no_adjacent_layout({"D": [1], "E": [7], "F": [2]}),
        "s_m2_t1_20260522_1805": pair_layout("E", 4, {"F": [2]}),
    },
    [
        ("s_m1_t1_20260522_1810", "D", [2], None, 1),
        ("s_m1_t1_20260522_1810", "E", [1, 7], None, 1),
        ("s_m2_t1_20260522_1620", "D", [2], None, 1),
        ("s_m2_t1_20260522_1620", "E", [7], None, 1),
        ("s_m2_t1_20260522_1715", "D", [3], None, 1),
        ("s_m2_t1_20260522_1715", "E", [7], None, 1),
        ("s_m2_t1_20260522_1805", "E", [4, 5], 2, None),
    ],
)

print("Applied mixed scenario seat patterns.")
