#!/usr/bin/env python3
"""Extract protocol-aligned measures from interaction logs.

Notes:
- Metrics B1/B2/B3 are partially heuristic until a stricter gold scorer is added.
- Metrics B12/B13/B14 are still best treated as exploratory/manual-coding support.
- By default, the script analyzes every matching log file, including gold-reference logs.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOG_DIR = Path(__file__).resolve().parent
SCENARIO_CATALOG_PATH = REPO_ROOT / "apps" / "backend" / "scenarios" / "catalog.json"
STANDARD_WORKFLOWS_PATH = Path(__file__).resolve().with_name("standard_workflows.json")

STAGE_ORDER = ["movie", "theater", "date", "time", "seat", "confirm"]
STAGE_INDEX = {stage: index for index, stage in enumerate(STAGE_ORDER)}
CONDITION_FROM_MODE = {
    "basic-tuning-voice-off": "C1",
    "full-tuning-voice-off": "C2",
    "basic-tuning-voice-on": "C3",
    "full-tuning-voice-on": "C4",
}
QUESTION_PATTERN = re.compile(
    r"\?|^\s*(what|which|when|where|who|how|can|could|would|should|is|are|do|does|did)\b",
    re.IGNORECASE,
)
INFO_REQUEST_PATTERN = re.compile(
    r"\b(what|which|when|where|how|show|available|options|have|any|can i|could i|do you)\b",
    re.IGNORECASE,
)


@dataclass
class StageVisit:
    stage: str
    entered_at: datetime
    exited_at: datetime | None
    source: str | None = None
    action: str | None = None


@dataclass
class GoldReference:
    scenario_id: str
    log_path: Path
    stage_sequence: list[str]
    final_workflow_ids: dict[str, Any]
    step_choices: list[dict[str, Any]] | None = None
    expected_stage_visits: int | None = None
    expected_backtrack_count: int | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract protocol-aligned behavioral measures from user-study interaction logs."
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        help="Optional log files or directories. Defaults to logs/interaction.",
    )
    parser.add_argument(
        "--output-csv",
        help="Optional CSV output path. Defaults to stdout.",
    )
    parser.add_argument(
        "--output-json",
        help="Optional JSON details output path.",
    )
    parser.add_argument(
        "--include-gold",
        action="store_true",
        help="Deprecated no-op kept for backward compatibility. Gold logs are included by default.",
    )
    parser.add_argument(
        "--exclude-gold",
        action="store_true",
        help="Exclude the configured gold-reference logs from the output table.",
    )
    return parser.parse_args()


def parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_entry_timestamp(
    entry: dict[str, Any],
    *,
    prefer_client: bool = True,
) -> datetime | None:
    if prefer_client:
        return parse_iso_timestamp(entry.get("clientTimestamp") or entry.get("timestamp"))
    return parse_iso_timestamp(entry.get("timestamp") or entry.get("clientTimestamp"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                entries.append(parsed)
    return entries


def workflow_ids_from_workflow(workflow: dict[str, Any]) -> dict[str, Any]:
    seats = workflow.get("seats")
    seat_ids = []
    if isinstance(seats, list):
        seat_ids = sorted(
            seat["id"]
            for seat in seats
            if isinstance(seat, dict) and isinstance(seat.get("id"), str)
        )

    return {
        "movieId": nested_id(workflow.get("movie")),
        "theaterId": nested_id(workflow.get("theater")),
        "dateId": nested_id(workflow.get("date")),
        "showingId": nested_id(workflow.get("showing")),
        "seatIds": seat_ids,
    }


def load_scenario_catalog() -> dict[str, dict[str, Any]]:
    raw = json.loads(SCENARIO_CATALOG_PATH.read_text(encoding="utf-8"))
    scenarios = raw.get("scenarios", [])
    return {
        scenario["id"]: scenario
        for scenario in scenarios
        if isinstance(scenario, dict) and isinstance(scenario.get("id"), str)
    }


def resolve_input_files(inputs: list[str]) -> list[Path]:
    if not inputs:
        inputs = [str(DEFAULT_LOG_DIR)]

    files: list[Path] = []
    for raw in inputs:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = (REPO_ROOT / candidate).resolve()
        if candidate.is_file() and candidate.suffix == ".jsonl":
            files.append(candidate)
            continue
        if candidate.is_dir():
            files.extend(sorted(candidate.glob("*.jsonl")))
    return sorted(set(files))


def relative_to_repo(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def extract_condition_label(entries: list[dict[str, Any]]) -> str | None:
    for entry in entries:
        value = entry.get("conditionLabel")
        if isinstance(value, str) and value.strip():
            return value.strip()
        payload = entry.get("payload")
        if isinstance(payload, dict):
            payload_value = payload.get("conditionLabel")
            if isinstance(payload_value, str) and payload_value.strip():
                return payload_value.strip()
    for entry in entries:
        study_mode = entry.get("studyMode")
        if isinstance(study_mode, str) and study_mode.strip():
            return CONDITION_FROM_MODE.get(study_mode.strip(), study_mode.strip())
    return None


def extract_stage_sequence(entries: list[dict[str, Any]]) -> tuple[list[str], list[tuple[str, datetime]]]:
    workflow_trace = extract_workflow_trace(entries)
    return [step["stage"] for step in workflow_trace], [
        (step["stage"], step["timestamp"]) for step in workflow_trace
    ]


def extract_workflow_trace(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    raw_sequence: list[tuple[str, datetime]] = []
    for entry in entries:
        if entry.get("type") != "chat.active_spec.updated":
            continue
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        stage = payload.get("stage")
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        spec = payload.get("spec")
        state = spec.get("state") if isinstance(spec, dict) else None
        workflow = state.get("workflow") if isinstance(state, dict) else None
        if (
            isinstance(stage, str)
            and stage in STAGE_INDEX
            and timestamp is not None
            and isinstance(workflow, dict)
        ):
            raw_sequence.append((stage, timestamp, workflow_ids_from_workflow(workflow)))

    collapsed: list[dict[str, Any]] = []
    for stage, timestamp, workflow_ids in raw_sequence:
        if not collapsed or collapsed[-1]["stage"] != stage:
            collapsed.append(
                {
                    "stage": stage,
                    "timestamp": timestamp,
                    "workflow_ids": workflow_ids,
                }
            )

    return collapsed


def stage_selected_item_ids(stage: str, workflow_ids: dict[str, Any]) -> list[str]:
    if stage == "movie":
        value = workflow_ids.get("movieId")
        return [value] if isinstance(value, str) and value else []
    if stage == "theater":
        value = workflow_ids.get("theaterId")
        return [value] if isinstance(value, str) and value else []
    if stage == "date":
        value = workflow_ids.get("dateId")
        return [value] if isinstance(value, str) and value else []
    if stage == "time":
        value = workflow_ids.get("showingId")
        return [value] if isinstance(value, str) and value else []
    if stage == "seat":
        value = workflow_ids.get("seatIds")
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
    return []


def infer_transition_action(from_stage: str, to_stage: str) -> str:
    if STAGE_INDEX.get(to_stage, -1) < STAGE_INDEX.get(from_stage, -1):
        return "back"
    return "next"


def extract_step_choices_from_workflow_trace(workflow_trace: list[dict[str, Any]]) -> list[dict[str, Any]]:
    choices: list[dict[str, Any]] = []
    for current, nxt in zip(workflow_trace, workflow_trace[1:]):
        from_stage = current.get("stage")
        to_stage = nxt.get("stage")
        if not isinstance(from_stage, str) or not isinstance(to_stage, str):
            continue
        action = infer_transition_action(from_stage, to_stage)
        choice = {
            "from_stage": from_stage,
            "to_stage": to_stage,
            "action": action,
            "selected_item_ids": [],
        }
        if action == "next":
            workflow_ids = nxt.get("workflow_ids")
            if isinstance(workflow_ids, dict):
                choice["selected_item_ids"] = stage_selected_item_ids(from_stage, workflow_ids)
        choices.append(choice)
    return choices


def extract_stage_visits(entries: list[dict[str, Any]], fallback_sequence: list[tuple[str, datetime]]) -> list[StageVisit]:
    visits: list[StageVisit] = []
    for entry in entries:
        if entry.get("type") != "stage.entered":
            continue
        payload = entry.get("payload")
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        if not isinstance(payload, dict) or timestamp is None:
            continue
        stage = payload.get("stage")
        if not isinstance(stage, str):
            continue
        visits.append(
            StageVisit(
                stage=stage,
                entered_at=timestamp,
                exited_at=None,
                source=payload.get("source") if isinstance(payload.get("source"), str) else None,
                action=payload.get("action") if isinstance(payload.get("action"), str) else None,
            )
        )

    if not visits:
        visits = [
            StageVisit(stage=stage, entered_at=timestamp, exited_at=None)
            for stage, timestamp in fallback_sequence
        ]

    terminal_ts = find_terminal_timestamp(entries)
    for index, visit in enumerate(visits):
        next_visit = visits[index + 1] if index + 1 < len(visits) else None
        visit.exited_at = next_visit.entered_at if next_visit else terminal_ts
    return visits


def find_terminal_timestamp(entries: list[dict[str, Any]]) -> datetime | None:
    priority = ["booking.completed", "study.control.finish_requested"]
    for wanted in priority:
        timestamps = [
            parse_entry_timestamp(entry, prefer_client=False)
            for entry in entries
            if entry.get("type") == wanted
        ]
        timestamps = [timestamp for timestamp in timestamps if timestamp is not None]
        if timestamps:
            return timestamps[-1]
    timestamps = [
        parse_entry_timestamp(entry) for entry in entries
    ]
    timestamps = [timestamp for timestamp in timestamps if timestamp is not None]
    return timestamps[-1] if timestamps else None


def extract_final_workflow(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    for entry in reversed(entries):
        if entry.get("type") != "chat.active_spec.updated":
            continue
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        spec = payload.get("spec")
        if not isinstance(spec, dict):
            continue
        state = spec.get("state")
        if not isinstance(state, dict):
            continue
        workflow = state.get("workflow")
        if isinstance(workflow, dict) and workflow:
            return workflow
    return None


def extract_final_workflow_ids(entries: list[dict[str, Any]]) -> dict[str, Any]:
    workflow = extract_final_workflow(entries) or {}
    return workflow_ids_from_workflow(workflow)


def nested_id(value: Any) -> str | None:
    if isinstance(value, dict) and isinstance(value.get("id"), str):
        return value["id"]
    return None


def levenshtein_distance(left: list[str], right: list[str]) -> int:
    if not left:
        return len(right)
    if not right:
        return len(left)

    previous = list(range(len(right) + 1))
    for i, left_value in enumerate(left, start=1):
        current = [i]
        for j, right_value in enumerate(right, start=1):
            substitution_cost = 0 if left_value == right_value else 1
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + substitution_cost,
                )
            )
        previous = current
    return previous[-1]


def compute_step_choice_error_rate(
    actual_choices: list[dict[str, Any]],
    gold_choices: list[dict[str, Any]],
) -> float | None:
    if not gold_choices:
        return None

    comparison_length = max(len(actual_choices), len(gold_choices), 1)
    mismatches = 0
    for index in range(comparison_length):
        if index >= len(actual_choices) or index >= len(gold_choices):
            mismatches += 1
            continue
        actual_step = actual_choices[index]
        gold_step = gold_choices[index]
        comparable_keys = ("from_stage", "to_stage", "action", "selected_item_ids")
        if any(actual_step.get(key) != gold_step.get(key) for key in comparable_keys):
            mismatches += 1
    return round(mismatches / comparison_length, 4)


def compute_backtrack_episodes(stage_sequence: list[str]) -> int:
    if len(stage_sequence) < 2:
        return 0
    episodes = 0
    in_backtrack = False
    for current, nxt in zip(stage_sequence, stage_sequence[1:]):
        delta = STAGE_INDEX.get(nxt, -1) - STAGE_INDEX.get(current, -1)
        if delta < 0:
            if not in_backtrack:
                episodes += 1
                in_backtrack = True
        else:
            in_backtrack = False
    return episodes


def compute_task_completion_seconds(entries: list[dict[str, Any]]) -> float | None:
    start_ts = None
    booking_ts = None
    for entry in entries:
        entry_type = entry.get("type")
        timestamp = parse_entry_timestamp(
            entry,
            prefer_client=False if entry_type in {"study.session.started", "booking.completed"} else True,
        )
        if timestamp is None:
            continue
        if entry_type == "study.session.started" and start_ts is None:
            start_ts = timestamp
        if entry_type == "booking.completed":
            booking_ts = timestamp
    if start_ts is None or booking_ts is None:
        return None
    return round((booking_ts - start_ts).total_seconds(), 3)


def compute_stage_times(visits: list[StageVisit]) -> dict[str, float]:
    totals: dict[str, float] = defaultdict(float)
    for visit in visits:
        if visit.exited_at is None:
            continue
        duration = (visit.exited_at - visit.entered_at).total_seconds()
        if duration >= 0:
            totals[visit.stage] += duration
    return {stage: round(totals.get(stage, 0.0), 3) for stage in STAGE_ORDER if stage in totals}


def collect_user_inputs(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for entry in entries:
        if entry.get("type") != "chat.user_input.submitted":
            continue
        payload = entry.get("payload")
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        if not isinstance(payload, dict) or timestamp is None:
            continue
        text = payload.get("text")
        stage = payload.get("stage")
        source = payload.get("source")
        if isinstance(text, str) and isinstance(stage, str):
            messages.append(
                {
                    "timestamp": timestamp,
                    "stage": stage,
                    "text": text.strip(),
                    "source": source if isinstance(source, str) else None,
                }
            )
    return messages


def find_info_request_count(user_inputs: list[dict[str, Any]]) -> int:
    count = 0
    for message in user_inputs:
        text = message["text"]
        if not text:
            continue
        if QUESTION_PATTERN.search(text) and INFO_REQUEST_PATTERN.search(text):
            count += 1
    return count


def count_gui_interactions(entries: list[dict[str, Any]]) -> int:
    count = 0
    for entry in entries:
        if entry.get("type") != "user.gui_action":
            continue
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        if payload.get("source") != "participant":
            continue
        action = payload.get("action")
        if action in {"select", "toggle", "next", "back", "confirm", "startOver", "selectMultiple"}:
            count += 1
    return count


def collect_transition_commits(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    commits: list[dict[str, Any]] = []
    for entry in entries:
        entry_type = entry.get("type")
        payload = entry.get("payload")
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        if not isinstance(payload, dict) or timestamp is None:
            continue

        if entry_type == "workflow.selection.committed":
            stage = payload.get("stage")
            if isinstance(stage, str):
                commits.append(
                    {
                        "timestamp": timestamp,
                        "stage": stage,
                        "source": payload.get("source") if isinstance(payload.get("source"), str) else None,
                    }
                )
            continue

        if entry_type == "workflow.transition":
            if payload.get("action") != "next":
                continue
            trigger_stage = payload.get("triggerStage") or payload.get("fromStage")
            if isinstance(trigger_stage, str):
                commits.append(
                    {
                        "timestamp": timestamp,
                        "stage": trigger_stage,
                        "source": payload.get("source") if isinstance(payload.get("source"), str) else None,
                    }
                )
    commits.sort(key=lambda item: item["timestamp"])
    return commits


def compute_gui_only_selection_rate(entries: list[dict[str, Any]]) -> float | None:
    commits = collect_transition_commits(entries)
    participant_commits = [commit for commit in commits if commit.get("source") == "participant"]
    if not participant_commits:
        return None

    user_inputs = collect_user_inputs(entries)
    gui_only_count = 0
    for commit in participant_commits:
        stage = commit["stage"]
        timestamp = commit["timestamp"]
        had_nl_input = any(
            message["stage"] == stage and message["timestamp"] <= timestamp for message in user_inputs
        )
        if not had_nl_input:
            gui_only_count += 1
    return round(gui_only_count / len(participant_commits), 4)


def count_preference_events(entries: list[dict[str, Any]]) -> tuple[int, int]:
    total = 0
    restated = 0
    for entry in entries:
        if entry.get("type") != "preference.extracted":
            continue
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        total += 1
        if payload.get("action") == "restate":
            restated += 1
    return total, restated


def classify_conflict_discovery(entries: list[dict[str, Any]], stage_sequence: list[str]) -> str:
    earliest_agent_signal: datetime | None = None
    for entry in entries:
        if entry.get("type") not in {"conflict.detected", "conflict.disclosed", "backtrack.suggested"}:
            continue
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        if payload.get("source") != "agent":
            continue
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        if timestamp is None:
            continue
        earliest_agent_signal = timestamp if earliest_agent_signal is None else min(earliest_agent_signal, timestamp)

    backward_transition_ts: datetime | None = None
    for entry in entries:
        if entry.get("type") != "workflow.transition":
            continue
        payload = entry.get("payload")
        timestamp = parse_entry_timestamp(entry, prefer_client=False)
        if not isinstance(payload, dict) or timestamp is None:
            continue
        from_stage = payload.get("fromStage")
        to_stage = payload.get("toStage")
        if isinstance(from_stage, str) and isinstance(to_stage, str):
            if STAGE_INDEX.get(to_stage, -1) < STAGE_INDEX.get(from_stage, -1):
                backward_transition_ts = timestamp
                break

    if earliest_agent_signal is not None and (
        backward_transition_ts is None or earliest_agent_signal <= backward_transition_ts
    ):
        return "agent_proactive_notification"
    if compute_backtrack_episodes(stage_sequence) > 0:
        return "user_self_discovery"
    return "undiscovered"


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def parse_minutes(value: str | None) -> int | None:
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None

    if re.fullmatch(r"\d{2}:\d{2}", value):
        hours, minutes = value.split(":")
        return int(hours) * 60 + int(minutes)

    match = re.fullmatch(r"(\d{1,2}):(\d{2})\s*([AP]M)", value.upper())
    if not match:
        return None
    hours = int(match.group(1)) % 12
    minutes = int(match.group(2))
    if match.group(3) == "PM":
        hours += 12
    return hours * 60 + minutes


def parse_duration_minutes(value: str | None) -> int | None:
    if not value or not isinstance(value, str):
        return None
    match = re.fullmatch(r"(?:(\d+)h)\s*(?:(\d+)m)?", value.strip())
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes


def age_rating_rank(value: str | None) -> int | None:
    order = {"G": 0, "PG": 1, "PG-13": 2, "R": 3, "NC-17": 4}
    if not value or not isinstance(value, str):
        return None
    return order.get(value.strip().upper())


def fuzzy_contains(values: Iterable[str], needle: str) -> bool:
    target = normalize_text(needle)
    for value in values:
        if target in normalize_text(value):
            return True
    return False


def count_hard_preference_violations(scenario: dict[str, Any], workflow: dict[str, Any] | None) -> int | None:
    if not workflow:
        return None

    movie = workflow.get("movie") if isinstance(workflow.get("movie"), dict) else {}
    theater = workflow.get("theater") if isinstance(workflow.get("theater"), dict) else {}
    date = workflow.get("date") if isinstance(workflow.get("date"), dict) else {}
    showing = workflow.get("showing") if isinstance(workflow.get("showing"), dict) else {}
    seats = workflow.get("seats") if isinstance(workflow.get("seats"), list) else []

    violations = 0
    for preference_type in scenario.get("narratorPreferenceTypes", []):
        if not isinstance(preference_type, str) or not preference_type.endswith("-hard"):
            continue
        base = preference_type[:-5]

        if base.startswith("date-"):
            target_date = base.removeprefix("date-")
            if date.get("date") != target_date and date.get("id") != target_date:
                violations += 1
            continue

        if base == "action":
            if not fuzzy_contains(movie.get("genre", []), "Action"):
                violations += 1
        elif base == "comedy":
            if not fuzzy_contains(movie.get("genre", []), "Comedy"):
                violations += 1
        elif base == "mystery":
            if not fuzzy_contains(movie.get("genre", []), "Mystery"):
                violations += 1
        elif base == "anniversary-romance":
            if not fuzzy_contains(movie.get("genre", []), "Romance"):
                violations += 1
        elif base == "cosmic-laughs":
            if normalize_text(movie.get("title")) != normalize_text("Cosmic Laughs"):
                violations += 1
        elif base == "starfall-circuit":
            if normalize_text(movie.get("title")) != normalize_text("Starfall Circuit"):
                violations += 1
        elif base == "pg13-or-lower":
            rating = age_rating_rank(movie.get("ageRating"))
            if rating is None or rating > 2:
                violations += 1
        elif base == "age-rating-g-or-pg":
            rating = normalize_text(movie.get("ageRating"))
            if rating not in {"g", "pg"}:
                violations += 1
        elif base == "weekend-only":
            if normalize_text(date.get("dayOfWeek")) not in {"sat", "sun"}:
                violations += 1
        elif base == "weekend-friday-saturday":
            if normalize_text(date.get("dayOfWeek")) not in {"fri", "sat"}:
                violations += 1
        elif base == "within-10-miles":
            distance = theater.get("distanceMiles")
            if not isinstance(distance, (int, float)) or float(distance) > 10.0:
                violations += 1
        elif base == "within-12-miles":
            distance = theater.get("distanceMiles")
            if not isinstance(distance, (int, float)) or float(distance) > 12.0:
                violations += 1
        elif base == "free-parking-theater":
            if not fuzzy_contains(theater.get("amenities", []), "Free Parking"):
                violations += 1
        elif base == "reserved-seating-theater":
            if not fuzzy_contains(theater.get("amenities", []), "Reserved Seating"):
                violations += 1
        elif base == "reclining-seat-theater":
            if not fuzzy_contains(theater.get("amenities", []), "Reclining"):
                violations += 1
        elif base == "single-screen-theater":
            if theater.get("screenCount") != 1:
                violations += 1
        elif base == "arrive-after-530pm":
            start_minutes = parse_minutes(showing.get("time"))
            if start_minutes is None or start_minutes < 17 * 60 + 30:
                violations += 1
        elif base == "arrive-after-6pm":
            start_minutes = parse_minutes(showing.get("time"))
            if start_minutes is None or start_minutes < 18 * 60:
                violations += 1
        elif base == "arrive-after-4pm":
            start_minutes = parse_minutes(showing.get("time"))
            if start_minutes is None or start_minutes < 16 * 60:
                violations += 1
        elif base == "before-1030pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 22 * 60 + 30:
                violations += 1
        elif base == "before-10pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 22 * 60:
                violations += 1
        elif base == "before-9pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 21 * 60:
                violations += 1
        elif base == "before-8pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 20 * 60:
                violations += 1
        elif base == "before-7pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 19 * 60:
                violations += 1
        elif base == "before-6pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 18 * 60:
                violations += 1
        elif base == "before-5pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes > 17 * 60:
                violations += 1
        elif base == "end-before-2pm":
            end_minutes = parse_minutes(showing.get("endTime"))
            if end_minutes is None or end_minutes >= 14 * 60:
                violations += 1
        elif base == "imax-required":
            if normalize_text(showing.get("format")) != "imax":
                violations += 1
        elif base == "3d-required":
            if normalize_text(showing.get("format")) != "3 d" and normalize_text(showing.get("format")) != "3d":
                violations += 1
        elif base == "standard-format-time":
            if normalize_text(showing.get("format")) != "standard":
                violations += 1
        elif base == "avoid-expensive-format-time":
            if normalize_text(showing.get("format")) != "standard":
                violations += 1
        elif base == "sunday-early-time":
            if normalize_text(date.get("dayOfWeek")) == "sun":
                start_minutes = parse_minutes(showing.get("time"))
                if start_minutes is None or start_minutes >= 12 * 60:
                    violations += 1
        elif base == "premium-seat":
            if not seats or not all(normalize_text(seat.get("type")) == "premium" for seat in seats if isinstance(seat, dict)):
                violations += 1
        elif base in {"two-adjacent-seats", "three-adjacent-seats", "four-adjacent-seats"}:
            expected = {"two-adjacent-seats": 2, "three-adjacent-seats": 3, "four-adjacent-seats": 4}[base]
            if not check_adjacent_seats(seats, expected):
                violations += 1
        elif base == "center-seat":
            numbers = [seat.get("number") for seat in seats if isinstance(seat, dict)]
            if not numbers or not all(isinstance(number, int) and number in {3, 4, 5, 6} for number in numbers):
                violations += 1
        elif base == "avoid-front-rows":
            if any(normalize_text(seat.get("row")) in {"a", "b", "c"} for seat in seats if isinstance(seat, dict)):
                violations += 1
        elif base == "avoid-first-two-rows":
            if any(normalize_text(seat.get("row")) in {"a", "b"} for seat in seats if isinstance(seat, dict)):
                violations += 1
        elif base == "avoid-back-rows":
            pass

    return violations


def check_adjacent_seats(seats: list[Any], expected_count: int) -> bool:
    if len(seats) != expected_count:
        return False
    rows = [seat.get("row") for seat in seats if isinstance(seat, dict)]
    numbers = [seat.get("number") for seat in seats if isinstance(seat, dict)]
    if len(rows) != expected_count or len(numbers) != expected_count:
        return False
    if len(set(rows)) != 1:
        return False
    if not all(isinstance(number, int) for number in numbers):
        return False
    ordered = sorted(numbers)
    return ordered == list(range(ordered[0], ordered[0] + expected_count))


def load_gold_references() -> dict[str, GoldReference]:
    if not STANDARD_WORKFLOWS_PATH.exists():
        return {}

    raw = json.loads(STANDARD_WORKFLOWS_PATH.read_text(encoding="utf-8"))
    workflow_rows = raw.get("workflows", [])
    references: dict[str, GoldReference] = {}
    for row in workflow_rows:
        if not isinstance(row, dict):
            continue
        scenario_id = row.get("scenario_id")
        source_log_file = row.get("source_log_file")
        stage_sequence = row.get("stage_sequence")
        final_workflow_ids = row.get("final_workflow_ids")
        step_choices = row.get("step_choices")
        if not isinstance(scenario_id, str):
            continue
        if not isinstance(source_log_file, str):
            continue
        if not isinstance(stage_sequence, list) or not all(isinstance(stage, str) for stage in stage_sequence):
            continue
        if not isinstance(final_workflow_ids, dict):
            continue
        if step_choices is not None and (
            not isinstance(step_choices, list)
            or not all(isinstance(step, dict) for step in step_choices)
        ):
            continue
        references[scenario_id] = GoldReference(
            scenario_id=scenario_id,
            log_path=REPO_ROOT / source_log_file,
            stage_sequence=stage_sequence,
            final_workflow_ids=final_workflow_ids,
            step_choices=step_choices,
            expected_stage_visits=row.get("expected_stage_visits")
            if isinstance(row.get("expected_stage_visits"), int)
            else None,
            expected_backtrack_count=row.get("expected_backtrack_count")
            if isinstance(row.get("expected_backtrack_count"), int)
            else None,
        )
    return references


def compare_final_workflow(actual: dict[str, Any], gold: dict[str, Any]) -> bool:
    return actual == gold


def infer_set_label(scenario_title: str) -> str | None:
    match = re.match(r"^S(\d+)-T\d+:", scenario_title.strip(), re.IGNORECASE)
    if not match:
        return None
    set_index = int(match.group(1))
    return f"Set {chr(ord('A') + set_index - 1)}"


def infer_difficulty(scenario_title: str) -> str | None:
    match = re.search(r"\((Easy|Hard)\)", scenario_title, re.IGNORECASE)
    return match.group(1).lower() if match else None


def analyze_log(
    log_path: Path,
    scenarios: dict[str, dict[str, Any]],
    gold_references: dict[str, GoldReference],
) -> dict[str, Any]:
    entries = load_jsonl(log_path)
    if not entries:
        raise ValueError(f"No log entries found in {log_path}")

    started = next((entry for entry in entries if entry.get("type") == "study.session.started"), None)
    scenario_id = None
    study_mode = None
    participant_id = None
    if started:
        scenario_id = started.get("scenarioId")
        study_mode = started.get("studyMode")
        participant_id = started.get("participantId")

    if not isinstance(scenario_id, str):
        scenario_id = next(
            (
                entry.get("scenarioId")
                for entry in entries
                if isinstance(entry.get("scenarioId"), str) and entry.get("scenarioId")
            ),
            None,
        )
    if not isinstance(study_mode, str):
        study_mode = next(
            (
                entry.get("studyMode")
                for entry in entries
                if isinstance(entry.get("studyMode"), str) and entry.get("studyMode")
            ),
            None,
        )
    if not isinstance(participant_id, str):
        participant_id = next(
            (
                entry.get("participantId")
                for entry in entries
                if isinstance(entry.get("participantId"), str) and entry.get("participantId")
            ),
            None,
        )

    if not isinstance(scenario_id, str):
        raise ValueError(f"Could not resolve scenarioId for {log_path}")

    scenario = scenarios.get(scenario_id, {})
    condition_label = extract_condition_label(entries)
    workflow_trace = extract_workflow_trace(entries)
    step_choices = extract_step_choices_from_workflow_trace(workflow_trace)
    stage_sequence = [step["stage"] for step in workflow_trace]
    collapsed_sequence = [(step["stage"], step["timestamp"]) for step in workflow_trace]
    visits = extract_stage_visits(entries, collapsed_sequence)
    final_workflow_ids = extract_final_workflow_ids(entries)
    final_workflow = extract_final_workflow(entries)
    user_inputs = collect_user_inputs(entries)
    preference_count, preference_restatements = count_preference_events(entries)
    task_completion_seconds = compute_task_completion_seconds(entries)
    stage_times = compute_stage_times(visits)
    gui_interaction_count = count_gui_interactions(entries)
    gui_only_rate = compute_gui_only_selection_rate(entries)
    conflict_path = classify_conflict_discovery(entries, stage_sequence)

    gold_reference = gold_references.get(scenario_id)
    is_gold_reference = gold_reference is not None and log_path.resolve() == gold_reference.log_path.resolve()
    b1_task_success = (
        compare_final_workflow(final_workflow_ids, gold_reference.final_workflow_ids)
        if gold_reference is not None
        else None
    )
    b2_violation_count = (
        0
        if b1_task_success is True
        else count_hard_preference_violations(scenario, final_workflow)
    )
    b3_error_rate = (
        compute_step_choice_error_rate(step_choices, gold_reference.step_choices)
        if gold_reference is not None and gold_reference.step_choices
        else (
            round(
                levenshtein_distance(stage_sequence, gold_reference.stage_sequence)
                / max(len(gold_reference.stage_sequence), 1),
                4,
            )
            if gold_reference is not None
            else None
        )
    )

    row = {
        "log_file": relative_to_repo(log_path),
        "participant_id": participant_id,
        "condition_label": condition_label,
        "study_mode": study_mode,
        "scenario_id": scenario_id,
        "scenario_title": scenario.get("title"),
        "set_label": infer_set_label(scenario.get("title", "")) if isinstance(scenario.get("title"), str) else None,
        "difficulty": infer_difficulty(scenario.get("title", "")) if isinstance(scenario.get("title"), str) else None,
        "is_gold_reference": is_gold_reference,
        "b1_task_success": int(b1_task_success) if isinstance(b1_task_success, bool) else None,
        "b2_requirement_violation_count": b2_violation_count,
        "b3_stage_level_choice_error_rate": b3_error_rate,
        "b4_task_completion_time_sec": task_completion_seconds,
        "b5_time_spent_per_stage_sec": json.dumps(stage_times, sort_keys=True),
        "b6_total_stage_visits": len(stage_sequence),
        "b7_backtrack_count": compute_backtrack_episodes(stage_sequence),
        "b8_gui_interaction_count": gui_interaction_count,
        "b9_gui_only_selection_rate": gui_only_rate,
        "b10_nl_preference_expression_count": preference_count,
        "b11_message_utterance_count": len(user_inputs),
        "b12_information_request_count": find_info_request_count(user_inputs),
        "b13_conflict_discovery_path": conflict_path,
        "b14_preference_restatement_count": preference_restatements,
        "collapsed_stage_sequence": json.dumps(stage_sequence),
        "final_workflow_ids": json.dumps(final_workflow_ids, sort_keys=True),
        "gold_stage_sequence": json.dumps(gold_reference.stage_sequence) if gold_reference else None,
        "gold_log_file": relative_to_repo(gold_reference.log_path) if gold_reference else None,
    }

    detail = {
        "summary": row,
        "stage_visits": [
            {
                "stage": visit.stage,
                "entered_at": visit.entered_at.isoformat(),
                "exited_at": visit.exited_at.isoformat() if visit.exited_at else None,
                "source": visit.source,
                "action": visit.action,
            }
            for visit in visits
        ],
        "user_inputs": [
            {
                "timestamp": message["timestamp"].isoformat(),
                "stage": message["stage"],
                "source": message["source"],
                "text": message["text"],
            }
            for message in user_inputs
        ],
        "step_choices": step_choices,
        "workflow_trace": [
            {
                "stage": step["stage"],
                "timestamp": step["timestamp"].isoformat(),
                "workflow_ids": step["workflow_ids"],
            }
            for step in workflow_trace
        ],
    }
    return detail


def write_csv(rows: list[dict[str, Any]], output_path: str | None) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    if output_path:
        destination = Path(output_path)
        if not destination.is_absolute():
            destination = REPO_ROOT / destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        handle = destination.open("w", newline="", encoding="utf-8")
        should_close = True
    else:
        handle = sys.stdout
        should_close = False

    try:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    finally:
        if should_close:
            handle.close()


def write_json(details: list[dict[str, Any]], output_path: str) -> None:
    destination = Path(output_path)
    if not destination.is_absolute():
        destination = REPO_ROOT / destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(details, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    scenarios = load_scenario_catalog()
    gold_references = load_gold_references()
    gold_source_files = {relative_to_repo(reference.log_path) for reference in gold_references.values()}

    input_files = resolve_input_files(args.inputs)
    if not input_files:
        print("No JSONL log files found.", file=sys.stderr)
        return 1

    details: list[dict[str, Any]] = []
    for log_path in input_files:
        relative_path = relative_to_repo(log_path)
        if args.exclude_gold and relative_path in gold_source_files:
            continue
        try:
            details.append(analyze_log(log_path, scenarios, gold_references))
        except Exception as error:  # noqa: BLE001
            print(f"[warn] Skipping {relative_path}: {error}", file=sys.stderr)

    if not details:
        print("No analyzable log files found after filtering.", file=sys.stderr)
        return 1

    rows = [detail["summary"] for detail in details]
    write_csv(rows, args.output_csv)
    if args.output_json:
        write_json(details, args.output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
