#!/usr/bin/env python3
"""Generate a participant-level user-study summary in Markdown.

This report combines:
- objective log-based measures extracted by extract_user_study_measures.py
- per-trial survey responses
- post-study rankings / free-text rationale

Survey matching intentionally does not depend on scenarioId because the
research workflow treats the per-round condition/set as the primary join key.
"""
from __future__ import annotations

import argparse
import curses
import importlib.util
import json
import math
import os
import re
import sys
import textwrap
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


def resolve_repo_root() -> Path:
    current = Path(__file__).resolve()
    for candidate in [current.parent, *current.parents]:
        if (candidate / "package.json").exists() and (candidate / "docs").exists():
            return candidate
    raise RuntimeError("Could not determine repository root")


REPO_ROOT = resolve_repo_root()
INTERACTION_DIR = REPO_ROOT / "logs" / "interaction"
PER_TRIAL_SURVEY_DIR = REPO_ROOT / "logs" / "survey" / "per-trial"
POST_STUDY_SURVEY_DIR = REPO_ROOT / "logs" / "survey" / "post-study"

CONDITION_DISPLAY = {
    "C1": "Baseline + Text",
    "C2": "MAESTRO + Text",
    "C3": "Baseline + Voice",
    "C4": "MAESTRO + Voice",
}
INTERFACE_GROUPS = {
    "Baseline": ["C1", "C3"],
    "MAESTRO": ["C2", "C4"],
}
MODE_GROUPS = {
    "Text": ["C1", "C2"],
    "Voice": ["C3", "C4"],
}

HYPOTHESIS_METADATA = {
    "H1a_comparison_support": {
        "label": "H1a Comparison Support",
        "evidence": "Per-trial comparison survey mean (`comparison_mean` = mean of C1/C2/C3) aggregated by interface.",
        "source": "Per-trial survey (`logs/survey/per-trial/*.jsonl`), joined by participant + condition + set.",
    },
    "H1b_choice_error_rate": {
        "label": "H1b Choice Error Rate",
        "evidence": "Objective stage-level choice error rate (`b3_stage_level_choice_error_rate`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`.",
    },
    "H1c_efficiency_time": {
        "label": "H1c Efficiency Time",
        "evidence": "Objective completion time (`b4_task_completion_time_sec`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`, server timestamp based.",
    },
    "H2a_task_success": {
        "label": "H2a Task Success",
        "evidence": "Objective hard-task success (`b1_task_success`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`.",
    },
    "H2b_conflict_support": {
        "label": "H2b Conflict Support",
        "evidence": "Per-trial conflict awareness/support items (`C2`, `C3`) aggregated by interface.",
        "source": "Per-trial survey (`logs/survey/per-trial/*.jsonl`).",
    },
    "H2c_step_count": {
        "label": "H2c Step Count",
        "evidence": "Objective total stage visits (`b6_total_stage_visits`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`.",
    },
    "H2d_memory_burden": {
        "label": "H2d Memory Burden",
        "evidence": "UBS mean (`U1`-`U5`) plus `U4 remember too much`, aggregated by interface.",
        "source": "Per-trial survey (`logs/survey/per-trial/*.jsonl`).",
    },
    "H3a_perceived_usefulness": {
        "label": "H3a Perceived Usefulness",
        "evidence": "PU mean (`PU1`-`PU4`) plus `PU2` and `PU3`, aggregated by interface.",
        "source": "Per-trial survey (`logs/survey/per-trial/*.jsonl`).",
    },
    "H3b_difficulty": {
        "label": "H3b Difficulty / Mental Effort",
        "evidence": "UBS mean (`U1`-`U5`) plus `U1 mental effort`, aggregated by interface.",
        "source": "Per-trial survey (`logs/survey/per-trial/*.jsonl`).",
    },
    "H4a_preference_expression": {
        "label": "H4a Preference Expression",
        "evidence": "Objective natural-language preference expression count (`b10_nl_preference_expression_count`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`.",
    },
    "H4b_gui_only_selection": {
        "label": "H4b GUI-only Selection",
        "evidence": "Objective GUI-only selection rate (`b9_gui_only_selection_rate`) aggregated by interface.",
        "source": "Interaction log derived measure from `extract_user_study_measures.py`.",
    },
    "modality_text_vs_voice": {
        "label": "Text vs Voice",
        "evidence": "Condition groups by mode comparing success and completion time.",
        "source": "Grouped objective and survey summaries from the cohort bundle.",
    },
    "system_overhead": {
        "label": "System Overhead",
        "evidence": "Planner / extractor per-turn latency from LLM trace logs.",
        "source": "LLM traces (`logs/trace/*.llm-trace.jsonl`) joined to each interaction log.",
    },
}


def load_extract_module() -> Any:
    module_path = INTERACTION_DIR / "extract_user_study_measures.py"
    spec = importlib.util.spec_from_file_location("extract_user_study_measures", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    argv = sys.argv[1:]
    if argv and argv[0] not in {"report", "show", "cohort", "interactive"}:
        argv = ["report", *argv]

    parser = argparse.ArgumentParser(description="Participant-level user-study analysis CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    report_parser = subparsers.add_parser("report", help="Generate the Markdown participant report.")
    report_parser.add_argument("participant_id", help="Participant id, e.g. P01")
    report_parser.add_argument(
        "--output",
        help="Output markdown path. Defaults to docs/scenarios/user_study/<participant>_summary.md",
    )

    show_parser = subparsers.add_parser("show", help="Read computed analysis from the terminal.")
    show_parser.add_argument("participant_id", help="Participant id, e.g. P01")
    show_parser.add_argument(
        "--section",
        choices=["overview", "conditions", "groups", "trends", "all"],
        default="overview",
        help="Which analysis section to print.",
    )
    show_parser.add_argument(
        "--condition",
        choices=["C1", "C2", "C3", "C4"],
        help="Optional condition filter for the conditions section.",
    )
    show_parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of formatted text.",
    )

    cohort_parser = subparsers.add_parser("cohort", help="Analyze multiple participants together.")
    cohort_parser.add_argument(
        "--up-to",
        help="Include participants from P01 up to this participant id, e.g. P06.",
    )
    cohort_parser.add_argument(
        "--participants",
        help="Comma-separated participant ids, e.g. P01,P02,P03.",
    )
    cohort_parser.add_argument(
        "--section",
        choices=["overview", "conditions", "groups", "hypotheses", "all"],
        default="all",
        help="Which cohort analysis section to print.",
    )
    cohort_parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of formatted text.",
    )
    cohort_parser.add_argument(
        "--output",
        help="Optional Markdown output path for cohort summary.",
    )

    interactive_parser = subparsers.add_parser("interactive", help="Open an interactive terminal CUI.")
    interactive_parser.add_argument("participant_id", nargs="?", help="Participant id, e.g. P01")

    return parser.parse_args(argv)


def find_condition_code(condition_label: str | None) -> str | None:
    if not isinstance(condition_label, str):
        return None
    trimmed = condition_label.strip()
    if not trimmed:
        return None
    return trimmed.split(":", 1)[0].strip()


def list_available_participants() -> list[str]:
    participants = {
        path.name.split("-", 1)[0]
        for path in INTERACTION_DIR.glob("*-hard-*.jsonl")
        if "-" in path.name
    }
    return sorted(participants)


def resolve_cohort_participants(
    *,
    up_to: str | None = None,
    participants_arg: str | None = None,
) -> list[str]:
    available = list_available_participants()
    if participants_arg:
        requested = [item.strip() for item in participants_arg.split(",") if item.strip()]
        return [item for item in requested if item in available]
    if up_to:
        return [participant for participant in available if participant <= up_to]
    return available


def extract_log_sort_key(path: Path) -> tuple[str, str, str, str, str] | None:
    match = re.match(
        r"^(P\d+)-(C\d+)-(S\d+)-(easy|hard)-(\d{8}-\d{6})\.jsonl$",
        path.name,
    )
    if not match:
        return None
    return (
        match.group(1),
        match.group(2),
        match.group(3),
        match.group(4),
        match.group(5),
    )


def latest_log_paths(participant_id: str, difficulty: str = "hard") -> list[Path]:
    latest: dict[tuple[str, str, str, str], tuple[str, Path]] = {}
    for path in sorted(INTERACTION_DIR.glob(f"{participant_id}-*-{difficulty}-*.jsonl")):
        key = extract_log_sort_key(path)
        if key is None:
            continue
        pid, condition, set_label, task_difficulty, timestamp_key = key
        dedupe_key = (pid, condition, set_label, task_difficulty)
        previous = latest.get(dedupe_key)
        if previous is None or timestamp_key > previous[0]:
            latest[dedupe_key] = (timestamp_key, path)
    return [item[1] for item in sorted(latest.values(), key=lambda item: item[1].name)]


def load_objective_rows(participant_id: str) -> list[dict[str, Any]]:
    module = load_extract_module()
    scenarios = module.load_scenario_catalog()
    gold_references = module.load_gold_references()
    log_paths = latest_log_paths(participant_id, "hard")
    details = [module.analyze_log(path, scenarios, gold_references) for path in log_paths]
    return [detail["summary"] for detail in details]


def load_per_trial_surveys(participant_id: str) -> dict[str, dict[str, Any]]:
    surveys: dict[str, dict[str, Any]] = {}
    for path in sorted(PER_TRIAL_SURVEY_DIR.glob(f"{participant_id}-*.jsonl")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        condition_code = find_condition_code(payload.get("conditionLabel"))
        set_label = payload.get("setLabel")
        if not condition_code or not isinstance(set_label, str):
            continue
        responses = payload.get("responses")
        if not isinstance(responses, dict):
            continue
        surveys[condition_code] = {
            "path": path,
            "condition_code": condition_code,
            "condition_label": payload.get("conditionLabel"),
            "participant_id": payload.get("participantId"),
            "scenario_id": payload.get("scenarioId"),
            "set_label": set_label,
            "responses": responses,
            "comparison_mean": round(mean([responses["C1"], responses["C2"], responses["C3"]]), 2),
            "ubs_mean": round(mean([responses["U1"], responses["U2"], responses["U3"], responses["U4"], responses["U5"]]), 2),
            "pu_mean": round(mean([responses["PU1"], responses["PU2"], responses["PU3"], responses["PU4"]]), 2),
        }
    return surveys


def load_post_study_survey(participant_id: str) -> dict[str, Any] | None:
    matches = sorted(POST_STUDY_SURVEY_DIR.glob(f"{participant_id}-*.jsonl"))
    if not matches:
        return None
    return json.loads(matches[-1].read_text(encoding="utf-8"))


def parse_json_object(raw: str | None) -> dict[str, Any]:
    if not isinstance(raw, str) or not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_float(raw: Any) -> float | None:
    if raw in ("", None):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def attach_surveys(
    objective_rows: list[dict[str, Any]],
    surveys: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in objective_rows:
        condition_code = row.get("condition_label")
        survey = surveys.get(condition_code)
        row_copy = dict(row)
        row_copy["condition_code"] = condition_code
        row_copy["condition_name"] = CONDITION_DISPLAY.get(condition_code, condition_code)
        row_copy["stage_times"] = parse_json_object(row_copy.get("b5_time_spent_per_stage_sec"))
        row_copy["processing_seconds"] = compute_voice_processing_seconds(row_copy.get("log_file"))
        row_copy["agent_processing_seconds"] = compute_agent_processing_seconds(row_copy.get("log_file"))
        row_copy["agent_turn_count"] = compute_agent_turn_count(row_copy.get("log_file"))
        agent_latencies = compute_agent_processing_latencies(row_copy.get("log_file"))
        extraction_latencies = compute_llm_component_latencies(row_copy.get("log_file"), "extractor")
        planning_latencies = compute_llm_component_latencies(row_copy.get("log_file"), "planner")
        row_copy["extraction_latencies"] = extraction_latencies
        row_copy["planning_latencies"] = planning_latencies
        row_copy["agent_processing_sd"] = (
            round(math.sqrt(compute_sample_variance(agent_latencies)), 3)
            if compute_sample_variance(agent_latencies) is not None
            else None
        )
        row_copy["extraction_seconds"] = round(sum(extraction_latencies), 3) if extraction_latencies else None
        row_copy["extraction_turn_count"] = len(extraction_latencies) if extraction_latencies else None
        row_copy["extraction_sd"] = (
            round(math.sqrt(compute_sample_variance(extraction_latencies)), 3)
            if compute_sample_variance(extraction_latencies) is not None
            else None
        )
        row_copy["planning_seconds"] = round(sum(planning_latencies), 3) if planning_latencies else None
        row_copy["planning_turn_count"] = len(planning_latencies) if planning_latencies else None
        row_copy["planning_sd"] = (
            round(math.sqrt(compute_sample_variance(planning_latencies)), 3)
            if compute_sample_variance(planning_latencies) is not None
            else None
        )
        row_copy["survey"] = survey
        row_copy["survey_match_status"] = classify_survey_match(row_copy, survey)
        enriched.append(row_copy)
    return enriched


def compute_voice_processing_seconds(log_file: str | None) -> float | None:
    if not isinstance(log_file, str) or not log_file:
        return None
    log_path = REPO_ROOT / log_file
    if not log_path.exists():
        return None
    entries = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            entries.append(parsed)

    tts_total = 0.0
    stt_total = 0.0
    current_start: float | None = None
    captured_queue: list[float] = []
    for entry in entries:
        entry_type = entry.get("type")
        timestamp = parse_timestamp(entry.get("timestamp"))
        if timestamp is None:
            continue
        if entry_type == "chat.voice_output.started":
            if current_start is None:
                current_start = timestamp
        elif entry_type == "chat.voice_output.completed" and current_start is not None:
            tts_total += max(0.0, timestamp - current_start)
            current_start = None
        elif entry_type == "chat.voice_input.captured":
            captured_queue.append(timestamp)
        elif entry_type == "chat.voice_input.transcribed" and captured_queue:
            captured_at = captured_queue.pop(0)
            stt_total += max(0.0, timestamp - captured_at)
    total = tts_total + stt_total
    return round(total, 3) if total > 0 else None


def parse_timestamp(raw: str | None) -> float | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def load_log_entries(log_file: str | None) -> list[dict[str, Any]]:
    if not isinstance(log_file, str) or not log_file:
        return []
    log_path = REPO_ROOT / log_file
    if not log_path.exists():
        return []
    entries: list[dict[str, Any]] = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
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


def compute_agent_processing_latencies(log_file: str | None) -> list[float]:
    entries = load_log_entries(log_file)
    waiting_inputs: list[float] = []
    latencies: list[float] = []
    for entry in entries:
        entry_type = entry.get("type")
        timestamp = parse_timestamp(entry.get("timestamp"))
        if timestamp is None:
            continue
        if entry_type == "chat.user_input.submitted":
            waiting_inputs.append(timestamp)
            continue

        is_agent_action = False
        if entry_type == "chat.message.rendered":
            message = (entry.get("payload") or {}).get("message") or {}
            is_agent_action = message.get("type") == "agent"
        elif entry_type == "user.gui_action":
            is_agent_action = ((entry.get("payload") or {}).get("source") == "agent")
        elif entry_type == "workflow.selection.committed":
            is_agent_action = ((entry.get("payload") or {}).get("source") == "agent")
        elif entry_type == "stage.entered":
            is_agent_action = ((entry.get("payload") or {}).get("source") == "agent")

        if is_agent_action and waiting_inputs:
            start = waiting_inputs.pop(0)
            latencies.append(max(0.0, timestamp - start))
    return latencies


def compute_agent_processing_seconds(log_file: str | None) -> float | None:
    latencies = compute_agent_processing_latencies(log_file)
    if not latencies:
        return None
    return round(sum(latencies), 3)


def compute_agent_turn_count(log_file: str | None) -> int | None:
    latencies = compute_agent_processing_latencies(log_file)
    return len(latencies) if latencies else None


def compute_sample_variance(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    avg = mean(values)
    return sum((value - avg) ** 2 for value in values) / (len(values) - 1)


def trace_path_from_log_file(log_file: str | None) -> Path | None:
    if not isinstance(log_file, str) or not log_file:
        return None
    interaction_path = Path(log_file)
    trace_name = f"{interaction_path.stem}.llm-trace{interaction_path.suffix}"
    path = REPO_ROOT / "logs" / "trace" / trace_name
    return path if path.exists() else None


def load_trace_entries(log_file: str | None) -> list[dict[str, Any]]:
    path = trace_path_from_log_file(log_file)
    if path is None:
        return []
    entries: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
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


def compute_llm_component_latencies(log_file: str | None, component: str) -> list[float]:
    entries = load_trace_entries(log_file)
    request_starts: dict[str, float] = {}
    latencies: list[float] = []
    request_type = f"llm.{component}.request"
    response_type = f"llm.{component}.response.parsed"
    for entry in entries:
        entry_type = entry.get("type")
        payload = entry.get("payload")
        timestamp = parse_timestamp(entry.get("timestamp"))
        if timestamp is None or not isinstance(payload, dict):
            continue
        request_id = payload.get("requestId")
        if not isinstance(request_id, str) or not request_id:
            continue
        if entry_type == request_type:
            request_starts[request_id] = timestamp
        elif entry_type == response_type and request_id in request_starts:
            latencies.append(max(0.0, timestamp - request_starts.pop(request_id)))
    return latencies


def classify_survey_match(row: dict[str, Any], survey: dict[str, Any] | None) -> str:
    if survey is None:
        return "missing"
    row_set = row.get("set_label")
    survey_set = survey.get("set_label")
    if isinstance(row_set, str) and isinstance(survey_set, str) and row_set != survey_set:
        return "set_mismatch"
    objective_scenario = row.get("scenario_id")
    survey_scenario = survey.get("scenario_id")
    if isinstance(objective_scenario, str) and isinstance(survey_scenario, str) and objective_scenario != survey_scenario:
        return "scenario_mismatch_ignored"
    return "matched"


def average(values: list[float | None]) -> float | None:
    usable = [value for value in values if value is not None]
    if not usable:
        return None
    return mean(usable)


def fmt_number(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "N/A"
    if math.isclose(value, round(value)):
        return str(int(round(value)))
    return f"{value:.{digits}f}"


def fmt_seconds(value: float | None) -> str:
    if value is None:
        return "N/A"
    sign = "-" if value < 0 else ""
    absolute = abs(value)
    minutes = int(absolute // 60)
    seconds = absolute - (minutes * 60)
    return f"{sign}{minutes}m {seconds:04.1f}s"


def objective_metric(row: dict[str, Any], key: str) -> float | None:
    return parse_float(row.get(key))


def seconds_per_step(row: dict[str, Any]) -> float | None:
    total = objective_metric(row, "b4_task_completion_time_sec")
    steps = objective_metric(row, "b6_total_stage_visits")
    if total is None or steps in (None, 0):
        return None
    return total / steps


def no_tts_seconds(row: dict[str, Any]) -> float | None:
    total = objective_metric(row, "b4_task_completion_time_sec")
    processing = parse_float(row.get("processing_seconds"))
    if total is None:
        return None
    if processing is None:
        return total
    return total - processing


def no_tts_seconds_per_step(row: dict[str, Any]) -> float | None:
    adjusted = no_tts_seconds(row)
    steps = objective_metric(row, "b6_total_stage_visits")
    if adjusted is None or steps in (None, 0):
        return None
    return adjusted / steps


def agent_processing_per_turn(row: dict[str, Any]) -> float | None:
    total = parse_float(row.get("agent_processing_seconds"))
    turns = parse_float(row.get("agent_turn_count"))
    if total is None or turns in (None, 0):
        return None
    return total / turns


def extraction_per_turn(row: dict[str, Any]) -> float | None:
    total = parse_float(row.get("extraction_seconds"))
    turns = parse_float(row.get("extraction_turn_count"))
    if total is None or turns in (None, 0):
        return None
    return total / turns


def planning_per_turn(row: dict[str, Any]) -> float | None:
    total = parse_float(row.get("planning_seconds"))
    turns = parse_float(row.get("planning_turn_count"))
    if total is None or turns in (None, 0):
        return None
    return total / turns


def compute_slope(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    xs = list(range(1, len(values) + 1))
    mean_x = mean(xs)
    mean_y = mean(values)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return None
    return numerator / denominator


def average_thirds(values: list[float]) -> tuple[float | None, float | None, float | None]:
    if not values:
        return (None, None, None)
    segment_size = max(1, len(values) // 3)
    first = mean(values[:segment_size])
    last = mean(values[-segment_size:])
    return (first, last, last - first)


def stage_highlights(row: dict[str, Any]) -> tuple[str, str]:
    stage_times = row.get("stage_times") or {}
    if not isinstance(stage_times, dict) or not stage_times:
        return ("N/A", "N/A")
    ordered = sorted(
        (
            (str(stage), float(duration))
            for stage, duration in stage_times.items()
            if isinstance(stage, str) and parse_float(duration) is not None
        ),
        key=lambda item: item[1],
        reverse=True,
    )
    if not ordered:
        return ("N/A", "N/A")
    longest = ordered[0]
    shortest = ordered[-1]
    return (
        f"{longest[0]} ({fmt_seconds(longest[1])})",
        f"{shortest[0]} ({fmt_seconds(shortest[1])})",
    )


def build_objective_table(rows: list[dict[str, Any]]) -> str:
    lines = [
        "| Condition | Set | Success | Violations | Error Rate | Completion | Sec/Step | Processing | Adjusted | Adjusted Sec/Step | Extraction | Extraction/Turn | Extraction SD | Planning | Planning/Turn | Planning SD | Agent Proc | Agent Proc/Turn | Agent Proc SD | Steps | Backtracks | GUI Clicks | GUI-only | Pref Expr | Utterances | Info Req | Conflict Path | Longest Stage |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        longest_stage, _ = stage_highlights(row)
        lines.append(
            "| "
            + " | ".join(
                [
                    row["condition_name"],
                    str(row.get("set_label") or "N/A"),
                    fmt_number(objective_metric(row, "b1_task_success"), 0),
                    fmt_number(objective_metric(row, "b2_requirement_violation_count"), 0),
                    fmt_number(objective_metric(row, "b3_stage_level_choice_error_rate"), 4),
                    fmt_seconds(objective_metric(row, "b4_task_completion_time_sec")),
                    fmt_seconds(seconds_per_step(row)),
                    fmt_seconds(parse_float(row.get("processing_seconds"))) if parse_float(row.get("processing_seconds")) else "N/A",
                    fmt_seconds(no_tts_seconds(row)) if parse_float(row.get("processing_seconds")) else "N/A",
                    fmt_seconds(no_tts_seconds_per_step(row)) if parse_float(row.get("processing_seconds")) else "N/A",
                    fmt_seconds(parse_float(row.get("extraction_seconds"))) if parse_float(row.get("extraction_seconds")) else "N/A",
                    fmt_seconds(extraction_per_turn(row)) if extraction_per_turn(row) else "N/A",
                    fmt_seconds(parse_float(row.get("extraction_sd"))) if parse_float(row.get("extraction_sd")) else "N/A",
                    fmt_seconds(parse_float(row.get("planning_seconds"))) if parse_float(row.get("planning_seconds")) else "N/A",
                    fmt_seconds(planning_per_turn(row)) if planning_per_turn(row) else "N/A",
                    fmt_seconds(parse_float(row.get("planning_sd"))) if parse_float(row.get("planning_sd")) else "N/A",
                    fmt_seconds(parse_float(row.get("agent_processing_seconds"))) if parse_float(row.get("agent_processing_seconds")) else "N/A",
                    fmt_seconds(agent_processing_per_turn(row)) if agent_processing_per_turn(row) else "N/A",
                    fmt_seconds(parse_float(row.get("agent_processing_sd"))) if parse_float(row.get("agent_processing_sd")) else "N/A",
                    fmt_number(objective_metric(row, "b6_total_stage_visits"), 0),
                    fmt_number(objective_metric(row, "b7_backtrack_count"), 0),
                    fmt_number(objective_metric(row, "b8_gui_interaction_count"), 0),
                    fmt_number(objective_metric(row, "b9_gui_only_selection_rate"), 4),
                    fmt_number(objective_metric(row, "b10_nl_preference_expression_count"), 0),
                    fmt_number(objective_metric(row, "b11_message_utterance_count"), 0),
                    fmt_number(objective_metric(row, "b12_information_request_count"), 0),
                    str(row.get("b13_conflict_discovery_path") or "N/A"),
                    longest_stage,
                ]
            )
            + " |"
        )
    return "\n".join(lines)


def build_survey_table(rows: list[dict[str, Any]]) -> str:
    lines = [
        "| Condition | Set | Match Status | Comparison | UBS | PU | C1 | C2 | C3 | U1 | U2 | U3 | U4 | U5 | PU1 | PU2 | PU3 | PU4 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        survey = row.get("survey")
        if not survey:
            lines.append(
                f"| {row['condition_name']} | {row.get('set_label') or 'N/A'} | missing | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |"
            )
            continue
        responses = survey["responses"]
        lines.append(
            "| "
            + " | ".join(
                [
                    row["condition_name"],
                    str(row.get("set_label") or "N/A"),
                    row["survey_match_status"],
                    fmt_number(survey["comparison_mean"]),
                    fmt_number(survey["ubs_mean"]),
                    fmt_number(survey["pu_mean"]),
                    fmt_number(parse_float(responses.get("C1")), 0),
                    fmt_number(parse_float(responses.get("C2")), 0),
                    fmt_number(parse_float(responses.get("C3")), 0),
                    fmt_number(parse_float(responses.get("U1")), 0),
                    fmt_number(parse_float(responses.get("U2")), 0),
                    fmt_number(parse_float(responses.get("U3")), 0),
                    fmt_number(parse_float(responses.get("U4")), 0),
                    fmt_number(parse_float(responses.get("U5")), 0),
                    fmt_number(parse_float(responses.get("PU1")), 0),
                    fmt_number(parse_float(responses.get("PU2")), 0),
                    fmt_number(parse_float(responses.get("PU3")), 0),
                    fmt_number(parse_float(responses.get("PU4")), 0),
                ]
            )
            + " |"
        )
    return "\n".join(lines)


def build_stage_time_table(rows: list[dict[str, Any]]) -> str:
    stage_order = ["movie", "theater", "date", "time", "seat", "confirm"]
    lines = [
        "| Condition | Movie | Theater | Date | Time | Seat | Confirm |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        stage_times = row.get("stage_times") or {}
        values = [fmt_seconds(parse_float(stage_times.get(stage))) for stage in stage_order]
        lines.append("| " + " | ".join([row["condition_name"], *values]) + " |")
    return "\n".join(lines)


def compute_group_summary(rows: list[dict[str, Any]], condition_codes: list[str]) -> dict[str, float | None]:
    selected = [row for row in rows if row.get("condition_code") in condition_codes]
    return {
        "success": average([objective_metric(row, "b1_task_success") for row in selected]),
        "violations": average([objective_metric(row, "b2_requirement_violation_count") for row in selected]),
        "error_rate": average([objective_metric(row, "b3_stage_level_choice_error_rate") for row in selected]),
        "completion_sec": average([objective_metric(row, "b4_task_completion_time_sec") for row in selected]),
        "seconds_per_step": average([seconds_per_step(row) for row in selected]),
        "processing_sec": average([parse_float(row.get("processing_seconds")) for row in selected]),
        "adjusted_sec": average([no_tts_seconds(row) for row in selected if parse_float(row.get("processing_seconds")) is not None]),
        "adjusted_seconds_per_step": average([no_tts_seconds_per_step(row) for row in selected if parse_float(row.get("processing_seconds")) is not None]),
        "extraction_sec": average([parse_float(row.get("extraction_seconds")) for row in selected]),
        "extraction_per_turn": average([extraction_per_turn(row) for row in selected]),
        "extraction_sd": average([parse_float(row.get("extraction_sd")) for row in selected]),
        "planning_sec": average([parse_float(row.get("planning_seconds")) for row in selected]),
        "planning_per_turn": average([planning_per_turn(row) for row in selected]),
        "planning_sd": average([parse_float(row.get("planning_sd")) for row in selected]),
        "agent_processing_sec": average([parse_float(row.get("agent_processing_seconds")) for row in selected]),
        "agent_processing_per_turn": average([agent_processing_per_turn(row) for row in selected]),
        "agent_processing_sd": average([parse_float(row.get("agent_processing_sd")) for row in selected]),
        "steps": average([objective_metric(row, "b6_total_stage_visits") for row in selected]),
        "backtracks": average([objective_metric(row, "b7_backtrack_count") for row in selected]),
        "gui_clicks": average([objective_metric(row, "b8_gui_interaction_count") for row in selected]),
        "gui_only_rate": average([objective_metric(row, "b9_gui_only_selection_rate") for row in selected]),
        "pref_expr": average([objective_metric(row, "b10_nl_preference_expression_count") for row in selected]),
        "utterances": average([objective_metric(row, "b11_message_utterance_count") for row in selected]),
        "info_requests": average([objective_metric(row, "b12_information_request_count") for row in selected]),
        "comparison": average([
            row["survey"]["comparison_mean"] for row in selected if isinstance(row.get("survey"), dict)
        ]),
        "ubs": average([
            row["survey"]["ubs_mean"] for row in selected if isinstance(row.get("survey"), dict)
        ]),
        "pu": average([
            row["survey"]["pu_mean"] for row in selected if isinstance(row.get("survey"), dict)
        ]),
    }


def build_group_table(rows: list[dict[str, Any]], axis_name: str, groups: dict[str, list[str]]) -> str:
    lines = [
        f"| {axis_name} | Success | Violations | Error Rate | Completion | Sec/Step | Processing | Adjusted | Adjusted Sec/Step | Extraction | Extraction/Turn | Extraction SD | Planning | Planning/Turn | Planning SD | Agent Proc | Agent Proc/Turn | Agent Proc SD | Steps | Backtracks | GUI Clicks | Pref Expr | Utterances | Comparison | UBS | PU |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for label, condition_codes in groups.items():
        summary = compute_group_summary(rows, condition_codes)
        lines.append(
            "| "
            + " | ".join(
                [
                    label,
                    fmt_number(summary["success"], 2),
                    fmt_number(summary["violations"], 2),
                    fmt_number(summary["error_rate"], 4),
                    fmt_seconds(summary["completion_sec"]),
                    fmt_seconds(summary["seconds_per_step"]),
                    fmt_seconds(summary["processing_sec"]) if summary["processing_sec"] is not None else "N/A",
                    fmt_seconds(summary["adjusted_sec"]) if summary["adjusted_sec"] is not None else "N/A",
                    fmt_seconds(summary["adjusted_seconds_per_step"]) if summary["adjusted_seconds_per_step"] is not None else "N/A",
                    fmt_seconds(summary["extraction_sec"]) if summary["extraction_sec"] is not None else "N/A",
                    fmt_seconds(summary["extraction_per_turn"]) if summary["extraction_per_turn"] is not None else "N/A",
                    fmt_seconds(summary["extraction_sd"]) if summary["extraction_sd"] is not None else "N/A",
                    fmt_seconds(summary["planning_sec"]) if summary["planning_sec"] is not None else "N/A",
                    fmt_seconds(summary["planning_per_turn"]) if summary["planning_per_turn"] is not None else "N/A",
                    fmt_seconds(summary["planning_sd"]) if summary["planning_sd"] is not None else "N/A",
                    fmt_seconds(summary["agent_processing_sec"]) if summary["agent_processing_sec"] is not None else "N/A",
                    fmt_seconds(summary["agent_processing_per_turn"]) if summary["agent_processing_per_turn"] is not None else "N/A",
                    fmt_seconds(summary["agent_processing_sd"]) if summary["agent_processing_sd"] is not None else "N/A",
                    fmt_number(summary["steps"], 2),
                    fmt_number(summary["backtracks"], 2),
                    fmt_number(summary["gui_clicks"], 2),
                    fmt_number(summary["pref_expr"], 2),
                    fmt_number(summary["utterances"], 2),
                    fmt_number(summary["comparison"], 2),
                    fmt_number(summary["ubs"], 2),
                    fmt_number(summary["pu"], 2),
                ]
            )
            + " |"
        )
    return "\n".join(lines)


def build_key_observations(rows: list[dict[str, Any]]) -> list[str]:
    observations: list[str] = []
    successful = [row for row in rows if objective_metric(row, "b1_task_success") == 1]
    if successful:
        labels = ", ".join(row["condition_name"] for row in successful)
        observations.append(f"Hard-task success occurred in {labels}.")
    fastest = min(rows, key=lambda row: objective_metric(row, "b4_task_completion_time_sec") or float("inf"))
    slowest = max(rows, key=lambda row: objective_metric(row, "b4_task_completion_time_sec") or float("-inf"))
    observations.append(
        f"Fastest completion was {fastest['condition_name']} at {fmt_seconds(objective_metric(fastest, 'b4_task_completion_time_sec'))}, while the slowest was {slowest['condition_name']} at {fmt_seconds(objective_metric(slowest, 'b4_task_completion_time_sec'))}."
    )
    most_errors = max(rows, key=lambda row: objective_metric(row, "b3_stage_level_choice_error_rate") or float("-inf"))
    least_errors = min(rows, key=lambda row: objective_metric(row, "b3_stage_level_choice_error_rate") or float("inf"))
    observations.append(
        f"Choice error rate ranged from {fmt_number(objective_metric(least_errors, 'b3_stage_level_choice_error_rate'), 4)} in {least_errors['condition_name']} to {fmt_number(objective_metric(most_errors, 'b3_stage_level_choice_error_rate'), 4)} in {most_errors['condition_name']}."
    )
    survey_mismatches = [row for row in rows if row.get("survey_match_status") == "scenario_mismatch_ignored"]
    if survey_mismatches:
        labels = ", ".join(row["condition_name"] for row in survey_mismatches)
        observations.append(
            f"Survey linkage ignored scenarioId mismatches for {labels} and matched by participant + condition + set instead."
        )
    return observations


def build_post_study_section(post_study: dict[str, Any] | None) -> str:
    if not post_study:
        return "No post-study survey found."
    rankings = post_study.get("rankings")
    ranking_reason = post_study.get("rankingReason")
    responses = post_study.get("responses")
    lines = []
    if isinstance(rankings, dict):
        ordered = sorted(
            (
                (condition, rank)
                for condition, rank in rankings.items()
                if condition in CONDITION_DISPLAY and isinstance(rank, int)
            ),
            key=lambda item: item[1],
        )
        if ordered:
            ranking_text = ", ".join(f"{CONDITION_DISPLAY[condition]} ({rank})" for condition, rank in ordered)
            lines.append(f"Ranking: {ranking_text}.")
    if isinstance(responses, dict):
        p3 = responses.get("P3")
        p4 = responses.get("P4")
        if p3 is not None or p4 is not None:
            lines.append(f"Post-study items: P3={p3}, P4={p4}.")
    if isinstance(ranking_reason, str) and ranking_reason.strip():
        lines.append("Participant rationale:")
        lines.append("")
        lines.append("> " + ranking_reason.strip().replace("\n", "\n> "))
    return "\n".join(lines) if lines else "Post-study survey found, but no readable fields were available."


def build_analysis_bundle(participant_id: str) -> dict[str, Any]:
    objective_rows = load_objective_rows(participant_id)
    if not objective_rows:
        raise SystemExit(f"No hard-task interaction logs found for {participant_id}")
    objective_rows.sort(key=lambda row: row.get("condition_label") or "")
    surveys = load_per_trial_surveys(participant_id)
    post_study = load_post_study_survey(participant_id)
    rows = attach_surveys(objective_rows, surveys)

    conditions = []
    row_by_code: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = row["condition_code"]
        row_by_code[code] = row
        planning_latencies = row.get("planning_latencies") or []
        extraction_latencies = row.get("extraction_latencies") or []
        planning_first, planning_last, planning_delta = average_thirds(planning_latencies)
        conditions.append(
            {
                "condition_code": code,
                "condition_name": row["condition_name"],
                "set_label": row.get("set_label"),
                "success": objective_metric(row, "b1_task_success"),
                "completion_sec": objective_metric(row, "b4_task_completion_time_sec"),
                "steps": objective_metric(row, "b6_total_stage_visits"),
                "processing_sec": parse_float(row.get("processing_seconds")),
                "adjusted_sec": no_tts_seconds(row),
                "extraction_sec": parse_float(row.get("extraction_seconds")),
                "extraction_per_turn": extraction_per_turn(row),
                "planning_sec": parse_float(row.get("planning_seconds")),
                "planning_per_turn": planning_per_turn(row),
                "agent_processing_sec": parse_float(row.get("agent_processing_seconds")),
                "agent_processing_per_turn": agent_processing_per_turn(row),
                "agent_processing_sd": parse_float(row.get("agent_processing_sd")),
                "planning_turns": len(planning_latencies),
                "planning_first_third_avg_sec": planning_first,
                "planning_last_third_avg_sec": planning_last,
                "planning_delta_sec": planning_delta,
                "planning_slope_sec_per_turn": compute_slope(planning_latencies),
                "planning_series_sec": planning_latencies,
                "extraction_turns": len(extraction_latencies),
                "extraction_series_sec": extraction_latencies,
            }
        )

    groups = {
        "interface": {
            label: compute_group_summary(rows, condition_codes)
            for label, condition_codes in INTERFACE_GROUPS.items()
        },
        "mode": {
            label: compute_group_summary(rows, condition_codes)
            for label, condition_codes in MODE_GROUPS.items()
        },
    }

    trends = {
        "baseline": {
            code: next((item for item in conditions if item["condition_code"] == code), None)
            for code in ["C1", "C3"]
        },
        "maestro": {
            code: next((item for item in conditions if item["condition_code"] == code), None)
            for code in ["C2", "C4"]
        },
    }

    return {
        "participant_id": participant_id,
        "rows": rows,
        "conditions": conditions,
        "groups": groups,
        "trends": trends,
        "post_study": post_study,
    }


def mean_or_none(values: list[float | None]) -> float | None:
    usable = [value for value in values if value is not None]
    return mean(usable) if usable else None


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def condition_summary_from_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "n": len(rows),
        "success": mean_or_none([objective_metric(row, "b1_task_success") for row in rows]),
        "violations": mean_or_none([objective_metric(row, "b2_requirement_violation_count") for row in rows]),
        "error_rate": mean_or_none([objective_metric(row, "b3_stage_level_choice_error_rate") for row in rows]),
        "completion_sec": mean_or_none([objective_metric(row, "b4_task_completion_time_sec") for row in rows]),
        "steps": mean_or_none([objective_metric(row, "b6_total_stage_visits") for row in rows]),
        "backtracks": mean_or_none([objective_metric(row, "b7_backtrack_count") for row in rows]),
        "gui_clicks": mean_or_none([objective_metric(row, "b8_gui_interaction_count") for row in rows]),
        "gui_only_rate": mean_or_none([objective_metric(row, "b9_gui_only_selection_rate") for row in rows]),
        "pref_expr": mean_or_none([objective_metric(row, "b10_nl_preference_expression_count") for row in rows]),
        "utterances": mean_or_none([objective_metric(row, "b11_message_utterance_count") for row in rows]),
        "info_requests": mean_or_none([objective_metric(row, "b12_information_request_count") for row in rows]),
        "pref_restatement": mean_or_none([objective_metric(row, "b14_preference_restatement_count") for row in rows]),
        "comparison": mean_or_none([
            row["survey"]["comparison_mean"] if isinstance(row.get("survey"), dict) else None for row in rows
        ]),
        "ubs": mean_or_none([
            row["survey"]["ubs_mean"] if isinstance(row.get("survey"), dict) else None for row in rows
        ]),
        "pu": mean_or_none([
            row["survey"]["pu_mean"] if isinstance(row.get("survey"), dict) else None for row in rows
        ]),
        "processing_sec": mean_or_none([parse_float(row.get("processing_seconds")) for row in rows]),
        "adjusted_sec": mean_or_none([no_tts_seconds(row) for row in rows]),
        "planning_per_turn": mean_or_none([planning_per_turn(row) for row in rows]),
        "extraction_per_turn": mean_or_none([extraction_per_turn(row) for row in rows]),
        "agent_processing_per_turn": mean_or_none([agent_processing_per_turn(row) for row in rows]),
        "survey_C1_compare": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("C1")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_C2_conflict_awareness": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("C2")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_C3_conflict_support": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("C3")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_U1_mental_effort": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("U1")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_U2_took_too_long": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("U2")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_U3_difficult_to_learn": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("U3")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_U4_remember_too_much": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("U4")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_U5_too_much_info": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("U5")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_PU1_quicker": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("PU1")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_PU2_effective": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("PU2")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_PU3_easier": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("PU3")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
        "survey_PU4_useful": mean_or_none([
            parse_float((row.get("survey") or {}).get("responses", {}).get("PU4")) if isinstance(row.get("survey"), dict) else None
            for row in rows
        ]),
    }


def build_cohort_post_study_summary(participant_bundles: list[dict[str, Any]]) -> dict[str, Any]:
    rankings_by_participant: dict[str, dict[str, int]] = {}
    for bundle in participant_bundles:
        participant_id = bundle["participant_id"]
        post_study = bundle.get("post_study")
        if not isinstance(post_study, dict):
            continue
        rankings = post_study.get("rankings")
        if not isinstance(rankings, dict):
            continue
        usable = {
            condition: rank
            for condition, rank in rankings.items()
            if condition in CONDITION_DISPLAY and isinstance(rank, int)
        }
        if usable:
            rankings_by_participant[participant_id] = usable

    average_rank: dict[str, float | None] = {}
    first_place_count: dict[str, int] = {}
    borda_score: dict[str, int] = {}
    for condition in CONDITION_DISPLAY:
        values = [
            rankings[condition]
            for rankings in rankings_by_participant.values()
            if condition in rankings
        ]
        average_rank[condition] = mean(values) if values else None
        first_place_count[condition] = sum(1 for value in values if value == 1)
        borda_score[condition] = sum(5 - value for value in values)

    return {
        "participant_count": len(rankings_by_participant),
        "rankings_by_participant": rankings_by_participant,
        "average_rank": average_rank,
        "first_place_count": first_place_count,
        "borda_score": borda_score,
    }


def summarize_hypothesis_result(key: str, payload: dict[str, Any]) -> str:
    if key == "H1a_comparison_support":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"MAESTRO is {'higher' if maestro > baseline else 'lower or tied'} "
            f"on comparison support ({fmt_number(maestro, 3)} vs {fmt_number(baseline, 3)})."
        )
    if key == "H1b_choice_error_rate":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"MAESTRO has {'lower' if maestro < baseline else 'higher or tied'} "
            f"choice error ({fmt_number(maestro, 4)} vs {fmt_number(baseline, 4)})."
        )
    if key == "H1c_efficiency_time":
        baseline = payload["baseline_completion_sec"]
        maestro = payload["maestro_completion_sec"]
        return (
            f"MAESTRO is {'faster' if maestro < baseline else 'slower or tied'} "
            f"on completion time ({fmt_seconds(maestro)} vs {fmt_seconds(baseline)})."
        )
    if key == "H2a_task_success":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"Task success is {'higher for MAESTRO' if maestro > baseline else 'tied or lower for MAESTRO'} "
            f"({fmt_number(maestro, 3)} vs {fmt_number(baseline, 3)})."
        )
    if key == "H2b_conflict_support":
        return (
            "Conflict awareness/support favors MAESTRO "
            f"(awareness {fmt_number(payload['maestro_conflict_awareness'], 3)} vs {fmt_number(payload['baseline_conflict_awareness'], 3)}, "
            f"support {fmt_number(payload['maestro_conflict_support'], 3)} vs {fmt_number(payload['baseline_conflict_support'], 3)})."
        )
    if key == "H2c_step_count":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"MAESTRO uses {'fewer' if maestro < baseline else 'more or equal'} "
            f"visited steps ({fmt_number(maestro, 3)} vs {fmt_number(baseline, 3)})."
        )
    if key == "H2d_memory_burden":
        return (
            "Memory burden is summarized from UBS and U4: "
            f"UBS {fmt_number(payload['maestro_ubs'], 3)} vs {fmt_number(payload['baseline_ubs'], 3)}, "
            f"U4 {fmt_number(payload['maestro_u4'], 3)} vs {fmt_number(payload['baseline_u4'], 3)}."
        )
    if key == "H3a_perceived_usefulness":
        return (
            "Perceived usefulness is summarized from PU mean plus PU2/PU3: "
            f"PU {fmt_number(payload['maestro_pu'], 3)} vs {fmt_number(payload['baseline_pu'], 3)}, "
            f"PU3 {fmt_number(payload['maestro_pu3'], 3)} vs {fmt_number(payload['baseline_pu3'], 3)}."
        )
    if key == "H3b_difficulty":
        return (
            "Difficulty / effort is summarized from UBS and U1: "
            f"UBS {fmt_number(payload['maestro_ubs'], 3)} vs {fmt_number(payload['baseline_ubs'], 3)}, "
            f"U1 {fmt_number(payload['maestro_u1'], 3)} vs {fmt_number(payload['baseline_u1'], 3)}."
        )
    if key == "H4a_preference_expression":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"MAESTRO shows {'more' if maestro > baseline else 'less or equal'} "
            f"natural-language preference expression ({fmt_number(maestro, 3)} vs {fmt_number(baseline, 3)})."
        )
    if key == "H4b_gui_only_selection":
        baseline = payload["baseline"]
        maestro = payload["maestro"]
        return (
            f"MAESTRO has {'lower' if maestro < baseline else 'higher or tied'} "
            f"GUI-only rate ({fmt_number(maestro, 4)} vs {fmt_number(baseline, 4)})."
        )
    if key == "modality_text_vs_voice":
        return (
            "Voice has "
            f"success {fmt_number(payload['voice_success'], 3)} vs {fmt_number(payload['text_success'], 3)} "
            f"and completion {fmt_seconds(payload['voice_completion_sec'])} vs {fmt_seconds(payload['text_completion_sec'])}."
        )
    if key == "system_overhead":
        return (
            "MAESTRO planning overhead remains higher: "
            f"planning/turn {fmt_seconds(payload['maestro_planning_per_turn'])} vs {fmt_seconds(payload['baseline_planning_per_turn'])}, "
            f"extraction/turn {fmt_seconds(payload['maestro_extraction_per_turn'])}."
        )
    return json.dumps(payload, ensure_ascii=False)


def build_cohort_bundle(participant_ids: list[str]) -> dict[str, Any]:
    participant_bundles = [build_analysis_bundle(participant_id) for participant_id in participant_ids]
    rows: list[dict[str, Any]] = []
    for participant_id, bundle in zip(participant_ids, participant_bundles):
        for row in bundle["rows"]:
            row_copy = dict(row)
            row_copy["participant_id"] = participant_id
            rows.append(row_copy)

    conditions = {
        code: condition_summary_from_rows([row for row in rows if row.get("condition_code") == code])
        for code in ["C1", "C2", "C3", "C4"]
    }
    groups = {
        "interface": {
            label: condition_summary_from_rows([row for row in rows if row.get("condition_code") in codes])
            for label, codes in INTERFACE_GROUPS.items()
        },
        "mode": {
            label: condition_summary_from_rows([row for row in rows if row.get("condition_code") in codes])
            for label, codes in MODE_GROUPS.items()
        },
    }

    baseline = groups["interface"]["Baseline"]
    maestro = groups["interface"]["MAESTRO"]
    text = groups["mode"]["Text"]
    voice = groups["mode"]["Voice"]
    hypotheses = {
        "H1a_comparison_support": {
            "baseline": baseline["survey_C1_compare"],
            "maestro": maestro["survey_C1_compare"],
            "direction": "MAESTRO > Baseline",
        },
        "H1b_choice_error_rate": {
            "baseline": baseline["error_rate"],
            "maestro": maestro["error_rate"],
            "direction": "MAESTRO < Baseline",
        },
        "H1c_efficiency_time": {
            "baseline_completion_sec": baseline["completion_sec"],
            "maestro_completion_sec": maestro["completion_sec"],
            "direction": "MAESTRO < Baseline",
        },
        "H2a_task_success": {
            "baseline": baseline["success"],
            "maestro": maestro["success"],
            "direction": "MAESTRO > Baseline",
        },
        "H2b_conflict_support": {
            "baseline_conflict_awareness": baseline["survey_C2_conflict_awareness"],
            "maestro_conflict_awareness": maestro["survey_C2_conflict_awareness"],
            "baseline_conflict_support": baseline["survey_C3_conflict_support"],
            "maestro_conflict_support": maestro["survey_C3_conflict_support"],
            "direction": "MAESTRO > Baseline",
        },
        "H2c_step_count": {
            "baseline": baseline["steps"],
            "maestro": maestro["steps"],
            "direction": "MAESTRO < Baseline",
        },
        "H2d_memory_burden": {
            "baseline_ubs": baseline["ubs"],
            "maestro_ubs": maestro["ubs"],
            "baseline_u4": baseline["survey_U4_remember_too_much"],
            "maestro_u4": maestro["survey_U4_remember_too_much"],
            "direction": "MAESTRO < Baseline",
        },
        "H3a_perceived_usefulness": {
            "baseline_pu": baseline["pu"],
            "maestro_pu": maestro["pu"],
            "baseline_pu2": baseline["survey_PU2_effective"],
            "maestro_pu2": maestro["survey_PU2_effective"],
            "baseline_pu3": baseline["survey_PU3_easier"],
            "maestro_pu3": maestro["survey_PU3_easier"],
            "direction": "MAESTRO > Baseline",
        },
        "H3b_difficulty": {
            "baseline_ubs": baseline["ubs"],
            "maestro_ubs": maestro["ubs"],
            "baseline_u1": baseline["survey_U1_mental_effort"],
            "maestro_u1": maestro["survey_U1_mental_effort"],
            "direction": "MAESTRO < Baseline",
        },
        "H4a_preference_expression": {
            "baseline": baseline["pref_expr"],
            "maestro": maestro["pref_expr"],
            "direction": "MAESTRO > Baseline",
        },
        "H4b_gui_only_selection": {
            "baseline": baseline["gui_only_rate"],
            "maestro": maestro["gui_only_rate"],
            "direction": "MAESTRO > Baseline",
        },
        "modality_text_vs_voice": {
            "text_success": text["success"],
            "voice_success": voice["success"],
            "text_completion_sec": text["completion_sec"],
            "voice_completion_sec": voice["completion_sec"],
        },
        "system_overhead": {
            "baseline_planning_per_turn": baseline["planning_per_turn"],
            "maestro_planning_per_turn": maestro["planning_per_turn"],
            "maestro_extraction_per_turn": maestro["extraction_per_turn"],
        },
    }
    post_study = build_cohort_post_study_summary(participant_bundles)

    return {
        "participant_ids": participant_ids,
        "participant_count": len(participant_ids),
        "rows": rows,
        "conditions": conditions,
        "groups": groups,
        "hypotheses": hypotheses,
        "post_study": post_study,
    }


def format_show_output(bundle: dict[str, Any], section: str, condition: str | None) -> str:
    participant_id = bundle["participant_id"]
    lines: list[str] = []

    if section in {"overview", "all"}:
        lines.append(f"Participant: {participant_id}")
        lines.append("Conditions:")
        for item in bundle["conditions"]:
            lines.append(
                f"- {item['condition_code']} {item['condition_name']}: "
                f"success={fmt_number(item['success'], 0)}, "
                f"completion={fmt_seconds(item['completion_sec'])}, "
                f"planning/turn={fmt_seconds(item['planning_per_turn'])}, "
                f"extraction/turn={fmt_seconds(item['extraction_per_turn'])}, "
                f"agent/turn={fmt_seconds(item['agent_processing_per_turn'])}"
            )
        if section == "overview":
            return "\n".join(lines)

    if section in {"conditions", "all"}:
        if lines:
            lines.append("")
        lines.append("Condition Details:")
        for item in bundle["conditions"]:
            if condition and item["condition_code"] != condition:
                continue
            lines.append(
                f"- {item['condition_code']} {item['condition_name']}: "
                f"planning_total={fmt_seconds(item['planning_sec'])}, "
                f"planning_per_turn={fmt_seconds(item['planning_per_turn'])}, "
                f"planning_sd={fmt_seconds(parse_float(next(row for row in bundle['rows'] if row['condition_code'] == item['condition_code']).get('planning_sd')))}, "
                f"extraction_total={fmt_seconds(item['extraction_sec'])}, "
                f"extraction_per_turn={fmt_seconds(item['extraction_per_turn'])}, "
                f"processing={fmt_seconds(item['processing_sec'])}, "
                f"adjusted={fmt_seconds(item['adjusted_sec'])}"
            )

    if section in {"groups", "all"}:
        if lines:
            lines.append("")
        lines.append("Grouped Comparison:")
        for axis_name, groups in bundle["groups"].items():
            lines.append(f"{axis_name}:")
            for label, summary in groups.items():
                lines.append(
                    f"- {label}: completion={fmt_seconds(summary['completion_sec'])}, "
                    f"planning/turn={fmt_seconds(summary['planning_per_turn'])}, "
                    f"extraction/turn={fmt_seconds(summary['extraction_per_turn'])}, "
                    f"agent/turn={fmt_seconds(summary['agent_processing_per_turn'])}"
                )

    if section in {"trends", "all"}:
        if lines:
            lines.append("")
        lines.append("Planning Trends:")
        for family_name, family in bundle["trends"].items():
            lines.append(f"{family_name}:")
            for code, item in family.items():
                if item is None:
                    continue
                lines.append(
                    f"- {code} {item['condition_name']}: "
                    f"first_third={fmt_seconds(item['planning_first_third_avg_sec'])}, "
                    f"last_third={fmt_seconds(item['planning_last_third_avg_sec'])}, "
                    f"delta={fmt_seconds(item['planning_delta_sec'])}, "
                    f"slope={fmt_number(item['planning_slope_sec_per_turn'], 4)} sec/turn"
                )

    return "\n".join(lines)


def format_cohort_output(bundle: dict[str, Any], section: str) -> str:
    lines: list[str] = []
    participant_text = ", ".join(bundle["participant_ids"])

    if section in {"overview", "all"}:
        lines.append(f"Cohort participants ({bundle['participant_count']}): {participant_text}")
        if section == "overview":
            return "\n".join(lines)

    if section in {"conditions", "all"}:
        if lines:
            lines.append("")
        lines.append("Condition Summaries:")
        for code in ["C1", "C2", "C3", "C4"]:
            summary = bundle["conditions"][code]
            lines.append(
                f"- {code}: n={summary['n']}, success={fmt_number(summary['success'], 3)}, "
                f"completion={fmt_seconds(summary['completion_sec'])}, "
                f"error_rate={fmt_number(summary['error_rate'], 4)}, "
                f"comparison={fmt_number(summary['comparison'], 3)}, "
                f"ubs={fmt_number(summary['ubs'], 3)}, pu={fmt_number(summary['pu'], 3)}"
            )

    if section in {"groups", "all"}:
        if lines:
            lines.append("")
        lines.append("Grouped Comparison:")
        for axis_name, groups in bundle["groups"].items():
            lines.append(f"{axis_name}:")
            for label, summary in groups.items():
                lines.append(
                    f"- {label}: success={fmt_number(summary['success'], 3)}, "
                    f"violations={fmt_number(summary['violations'], 3)}, "
                    f"completion={fmt_seconds(summary['completion_sec'])}, "
                    f"comparison={fmt_number(summary['comparison'], 3)}, "
                    f"ubs={fmt_number(summary['ubs'], 3)}, pu={fmt_number(summary['pu'], 3)}, "
                    f"planning/turn={fmt_seconds(summary['planning_per_turn'])}, "
                    f"extraction/turn={fmt_seconds(summary['extraction_per_turn'])}"
                )

    if section in {"hypotheses", "all"}:
        if lines:
            lines.append("")
        lines.append("Hypothesis-Oriented Summary:")
        for key, payload in bundle["hypotheses"].items():
            lines.append(f"- {key}: {json.dumps(payload, ensure_ascii=False)}")

    return "\n".join(lines)


def generate_cohort_markdown(bundle: dict[str, Any]) -> str:
    lines = [
        "# Cohort User Study Summary",
        "",
        f"Participants ({bundle['participant_count']}): {', '.join(bundle['participant_ids'])}",
        "",
        "## Condition Summaries",
        "",
        "| Condition | N | Success | Violations | Error Rate | Completion | Steps | Comparison | UBS | PU | Planning/Turn | Extraction/Turn |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for code in ["C1", "C2", "C3", "C4"]:
        summary = bundle["conditions"][code]
        lines.append(
            "| "
            + " | ".join(
                [
                    code,
                    fmt_number(summary["n"], 0),
                    fmt_number(summary["success"], 3),
                    fmt_number(summary["violations"], 3),
                    fmt_number(summary["error_rate"], 4),
                    fmt_seconds(summary["completion_sec"]),
                    fmt_number(summary["steps"], 3),
                    fmt_number(summary["comparison"], 3),
                    fmt_number(summary["ubs"], 3),
                    fmt_number(summary["pu"], 3),
                    fmt_seconds(summary["planning_per_turn"]),
                    fmt_seconds(summary["extraction_per_turn"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Grouped Comparison",
            "",
            "| Group | Success | Violations | Error Rate | Completion | Comparison | UBS | PU | Planning/Turn | Extraction/Turn |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for axis_name, groups in bundle["groups"].items():
        for label, summary in groups.items():
            lines.append(
                "| "
                + " | ".join(
                    [
                        f"{axis_name}:{label}",
                        fmt_number(summary["success"], 3),
                        fmt_number(summary["violations"], 3),
                        fmt_number(summary["error_rate"], 4),
                        fmt_seconds(summary["completion_sec"]),
                        fmt_number(summary["comparison"], 3),
                        fmt_number(summary["ubs"], 3),
                        fmt_number(summary["pu"], 3),
                        fmt_seconds(summary["planning_per_turn"]),
                        fmt_seconds(summary["extraction_per_turn"]),
                    ]
                )
                + " |"
            )
    lines.extend(["", "## Hypotheses", ""])
    lines.extend(
        [
            "| Hypothesis | Current Result | Evidence Used | Source | Raw Values |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    for key, payload in bundle["hypotheses"].items():
        meta = HYPOTHESIS_METADATA.get(
            key,
            {"label": key, "evidence": "N/A", "source": "N/A"},
        )
        lines.append(
            "| "
            + " | ".join(
                [
                    meta["label"],
                    summarize_hypothesis_result(key, payload).replace("|", "\\|"),
                    meta["evidence"].replace("|", "\\|"),
                    meta["source"].replace("|", "\\|"),
                    json.dumps(payload, ensure_ascii=False).replace("|", "\\|"),
                ]
            )
            + " |"
        )

    post_study = bundle.get("post_study") or {}
    average_rank = post_study.get("average_rank") or {}
    first_place_count = post_study.get("first_place_count") or {}
    borda_score = post_study.get("borda_score") or {}
    if average_rank:
        lines.extend(
            [
                "",
                "## Post-Study Ranking",
                "",
                f"Participants with usable post-study rankings: {post_study.get('participant_count', 0)}",
                "",
                "| Condition | Avg Rank | First-Place Votes | Borda Score |",
                "| --- | --- | --- | --- |",
            ]
        )
        for code in ["C1", "C2", "C3", "C4"]:
            lines.append(
                "| "
                + " | ".join(
                    [
                        f"{code} {CONDITION_DISPLAY[code]}",
                        fmt_number(average_rank.get(code), 3),
                        fmt_number(first_place_count.get(code), 0),
                        fmt_number(borda_score.get(code), 0),
                    ]
                )
                + " |"
            )
        rankings_by_participant = post_study.get("rankings_by_participant") or {}
        if rankings_by_participant:
            lines.extend(["", "Participant-wise ranking order:"])
            for participant_id in sorted(rankings_by_participant):
                ordered = sorted(
                    rankings_by_participant[participant_id].items(),
                    key=lambda item: item[1],
                )
                ordering = ", ".join(f"{condition} ({rank})" for condition, rank in ordered)
                lines.append(f"- `{participant_id}`: {ordering}")
    lines.append("")
    return "\n".join(lines)


def find_condition(bundle: dict[str, Any], condition_code: str) -> dict[str, Any] | None:
    return next((item for item in bundle["conditions"] if item["condition_code"] == condition_code), None)


def format_condition_detail(item: dict[str, Any]) -> str:
    lines = [
        f"{item['condition_code']} {item['condition_name']} ({item['set_label']})",
        f"success={fmt_number(item['success'], 0)} completion={fmt_seconds(item['completion_sec'])} steps={fmt_number(item['steps'], 0)}",
        f"processing={fmt_seconds(item['processing_sec'])} adjusted={fmt_seconds(item['adjusted_sec'])}",
        f"extraction_total={fmt_seconds(item['extraction_sec'])} extraction_per_turn={fmt_seconds(item['extraction_per_turn'])}",
        f"planning_total={fmt_seconds(item['planning_sec'])} planning_per_turn={fmt_seconds(item['planning_per_turn'])}",
        f"agent_total={fmt_seconds(item['agent_processing_sec'])} agent_per_turn={fmt_seconds(item['agent_processing_per_turn'])} agent_sd={fmt_seconds(item['agent_processing_sd'])}",
        f"planning_first_third={fmt_seconds(item['planning_first_third_avg_sec'])} planning_last_third={fmt_seconds(item['planning_last_third_avg_sec'])}",
        f"planning_delta={fmt_seconds(item['planning_delta_sec'])} planning_slope={fmt_number(item['planning_slope_sec_per_turn'], 4)} sec/turn",
    ]
    return "\n".join(lines)


def print_interactive_help() -> None:
    print("Commands:")
    print("  1 / overview     Show participant overview")
    print("  2 / conditions   List condition summaries")
    print("  3 / groups       Show interface/mode grouped comparison")
    print("  4 / trends       Show planning trend summaries")
    print("  c <C1|C2|C3|C4>  Show one condition in detail")
    print("  j <C1|C2|C3|C4>  Show one condition as JSON")
    print("  r / report       Regenerate Markdown report")
    print("  h / help         Show help")
    print("  q / quit         Exit")


def wrap_lines(text: str, width: int) -> list[str]:
    lines: list[str] = []
    safe_width = max(20, width)
    for raw_line in text.splitlines():
        if not raw_line:
            lines.append("")
            continue
        wrapped = textwrap.wrap(raw_line, width=safe_width, replace_whitespace=False, drop_whitespace=False)
        lines.extend(wrapped or [""])
    return lines


def draw_menu_screen(
    stdscr: Any,
    title: str,
    items: list[str],
    selected_index: int,
    footer: str = "Up/Down: move  Enter: select  q: quit  Backspace/Esc: back",
) -> None:
    stdscr.erase()
    height, width = stdscr.getmaxyx()
    title_attr = curses.A_BOLD
    stdscr.addnstr(0, 0, title, width - 1, title_attr)
    stdscr.addnstr(1, 0, "-" * max(1, min(width - 1, len(title))), width - 1)
    visible_rows = max(1, height - 4)
    start = 0
    if selected_index >= visible_rows:
        start = selected_index - visible_rows + 1
    end = min(len(items), start + visible_rows)
    for idx, item in enumerate(items[start:end], start=start):
        y = 2 + idx - start
        attr = curses.A_REVERSE if idx == selected_index else curses.A_NORMAL
        stdscr.addnstr(y, 0, item, width - 1, attr)
    stdscr.addnstr(height - 1, 0, footer, width - 1, curses.A_DIM)
    stdscr.refresh()


def draw_text_screen(
    stdscr: Any,
    title: str,
    text: str,
    scroll_offset: int,
    footer: str = "Up/Down/PgUp/PgDn: scroll  Backspace/Esc: back  q: quit",
) -> None:
    stdscr.erase()
    height, width = stdscr.getmaxyx()
    stdscr.addnstr(0, 0, title, width - 1, curses.A_BOLD)
    stdscr.addnstr(1, 0, "-" * max(1, min(width - 1, len(title))), width - 1)
    body_lines = wrap_lines(text, width - 1)
    visible_rows = max(1, height - 4)
    max_offset = max(0, len(body_lines) - visible_rows)
    offset = max(0, min(scroll_offset, max_offset))
    for row_index in range(visible_rows):
        line_index = offset + row_index
        if line_index >= len(body_lines):
            break
        stdscr.addnstr(2 + row_index, 0, body_lines[line_index], width - 1)
    position = f"{offset + 1}-{min(offset + visible_rows, len(body_lines))}/{len(body_lines)}"
    footer_text = f"{footer}  [{position}]"
    stdscr.addnstr(height - 1, 0, footer_text, width - 1, curses.A_DIM)
    stdscr.refresh()


def run_curses_interactive(bundle: dict[str, Any], participant_id: str) -> int:
    main_items = [
        "Overview",
        "Conditions",
        "Groups",
        "Trends",
        "Regenerate Report",
        "Quit",
    ]

    condition_codes = [item["condition_code"] for item in bundle["conditions"]]
    condition_items = [
        f"{item['condition_code']}  {item['condition_name']}  ({item['set_label']})"
        for item in bundle["conditions"]
    ]

    def curses_main(stdscr: Any) -> int:
        curses.curs_set(0)
        stdscr.keypad(True)
        current_view = "main"
        selected_main = 0
        selected_condition = 0
        text_title = ""
        text_body = ""
        text_scroll = 0

        while True:
            if current_view == "main":
                draw_menu_screen(stdscr, f"Study Analysis: {participant_id}", main_items, selected_main)
                key = stdscr.getch()
                if key in (ord("q"), ord("Q")):
                    return 0
                if key == curses.KEY_UP:
                    selected_main = (selected_main - 1) % len(main_items)
                    continue
                if key == curses.KEY_DOWN:
                    selected_main = (selected_main + 1) % len(main_items)
                    continue
                if key in (curses.KEY_ENTER, 10, 13):
                    choice = main_items[selected_main]
                    if choice == "Overview":
                        text_title = f"{participant_id} Overview"
                        text_body = format_show_output(bundle, "overview", None)
                        text_scroll = 0
                        current_view = "text"
                    elif choice == "Conditions":
                        current_view = "conditions"
                    elif choice == "Groups":
                        text_title = f"{participant_id} Groups"
                        text_body = format_show_output(bundle, "groups", None)
                        text_scroll = 0
                        current_view = "text"
                    elif choice == "Trends":
                        text_title = f"{participant_id} Trends"
                        text_body = format_show_output(bundle, "trends", None)
                        text_scroll = 0
                        current_view = "text"
                    elif choice == "Regenerate Report":
                        output_path = REPO_ROOT / "docs" / "scenarios" / "user_study" / f"{participant_id}_summary.md"
                        markdown = generate_markdown(participant_id, bundle["rows"], bundle["post_study"])
                        output_path.parent.mkdir(parents=True, exist_ok=True)
                        output_path.write_text(markdown, encoding="utf-8")
                        text_title = "Report Generated"
                        text_body = str(output_path)
                        text_scroll = 0
                        current_view = "text"
                    elif choice == "Quit":
                        return 0
                continue

            if current_view == "conditions":
                draw_menu_screen(stdscr, f"{participant_id} Conditions", condition_items, selected_condition)
                key = stdscr.getch()
                if key in (ord("q"), ord("Q")):
                    return 0
                if key in (27, curses.KEY_BACKSPACE, 127):
                    current_view = "main"
                    continue
                if key == curses.KEY_UP:
                    selected_condition = (selected_condition - 1) % len(condition_items)
                    continue
                if key == curses.KEY_DOWN:
                    selected_condition = (selected_condition + 1) % len(condition_items)
                    continue
                if key in (curses.KEY_ENTER, 10, 13):
                    code = condition_codes[selected_condition]
                    item = find_condition(bundle, code)
                    if item is not None:
                        text_title = f"{code} Detail"
                        text_body = format_condition_detail(item)
                        text_scroll = 0
                        current_view = "text"
                continue

            if current_view == "text":
                draw_text_screen(stdscr, text_title, text_body, text_scroll)
                key = stdscr.getch()
                if key in (ord("q"), ord("Q")):
                    return 0
                if key in (27, curses.KEY_BACKSPACE, 127):
                    current_view = "main"
                    continue
                if key == curses.KEY_UP:
                    text_scroll = max(0, text_scroll - 1)
                    continue
                if key == curses.KEY_DOWN:
                    text_scroll += 1
                    continue
                if key == curses.KEY_PPAGE:
                    text_scroll = max(0, text_scroll - 10)
                    continue
                if key == curses.KEY_NPAGE:
                    text_scroll += 10
                    continue
                continue

        return 0

    return curses.wrapper(curses_main)


def choose_participant_interactive(initial_participant_id: str | None = None) -> str | None:
    participants = list_available_participants()
    if not participants:
        print("No participants found in logs/interaction.")
        return None
    if initial_participant_id and initial_participant_id in participants:
        return initial_participant_id

    term = os.environ.get("TERM", "").strip().lower()
    if sys.stdin.isatty() and sys.stdout.isatty() and term and term != "dumb":
        try:
            def chooser(stdscr: Any) -> str | None:
                curses.curs_set(0)
                stdscr.keypad(True)
                selected = 0
                items = [f"{participant}" for participant in participants]
                while True:
                    draw_menu_screen(
                        stdscr,
                        "Select Participant",
                        items,
                        selected,
                        footer="Up/Down: move  Enter: select  q: quit",
                    )
                    key = stdscr.getch()
                    if key in (ord("q"), ord("Q")):
                        return None
                    if key == curses.KEY_UP:
                        selected = (selected - 1) % len(items)
                        continue
                    if key == curses.KEY_DOWN:
                        selected = (selected + 1) % len(items)
                        continue
                    if key in (curses.KEY_ENTER, 10, 13):
                        return participants[selected]
                return None

            return curses.wrapper(chooser)
        except curses.error:
            pass

    print("Available participants:")
    for idx, participant in enumerate(participants, start=1):
        print(f"  {idx}. {participant}")
    while True:
        try:
            raw = input("Choose participant number (or q to quit): ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return None
        if not raw:
            continue
        if raw.lower() in {"q", "quit", "exit"}:
            return None
        if raw.isdigit():
            index = int(raw) - 1
            if 0 <= index < len(participants):
                return participants[index]
        print("Invalid selection.")


def run_interactive_mode(bundle: dict[str, Any], participant_id: str) -> int:
    term = os.environ.get("TERM", "").strip().lower()
    if sys.stdin.isatty() and sys.stdout.isatty() and term and term != "dumb":
        try:
            return run_curses_interactive(bundle, participant_id)
        except curses.error:
            pass

    print(f"Interactive Study Analysis: {participant_id}")
    print_interactive_help()
    while True:
        try:
            raw = input("\nanalysis> ").strip()
        except EOFError:
            print()
            return 0
        except KeyboardInterrupt:
            print()
            return 0

        if not raw:
            continue
        lower = raw.lower()

        if lower in {"q", "quit", "exit"}:
            return 0
        if lower in {"h", "help", "?"}:
            print_interactive_help()
            continue
        if lower in {"1", "overview"}:
            print(format_show_output(bundle, "overview", None))
            continue
        if lower in {"2", "conditions"}:
            print(format_show_output(bundle, "conditions", None))
            continue
        if lower in {"3", "groups"}:
            print(format_show_output(bundle, "groups", None))
            continue
        if lower in {"4", "trends"}:
            print(format_show_output(bundle, "trends", None))
            continue
        if lower in {"r", "report"}:
            output_path = REPO_ROOT / "docs" / "scenarios" / "user_study" / f"{participant_id}_summary.md"
            markdown = generate_markdown(participant_id, bundle["rows"], bundle["post_study"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(markdown, encoding="utf-8")
            print(output_path)
            continue
        if lower.startswith("c "):
            condition_code = raw.split(None, 1)[1].strip().upper()
            item = find_condition(bundle, condition_code)
            if not item:
                print(f"Unknown condition: {condition_code}")
                continue
            print(format_condition_detail(item))
            continue
        if lower.startswith("j "):
            condition_code = raw.split(None, 1)[1].strip().upper()
            item = find_condition(bundle, condition_code)
            if not item:
                print(f"Unknown condition: {condition_code}")
                continue
            print(json.dumps(item, indent=2))
            continue

        print("Unknown command. Type `help` to see available commands.")


def generate_markdown(
    participant_id: str,
    rows: list[dict[str, Any]],
    post_study: dict[str, Any] | None,
) -> str:
    observations = build_key_observations(rows)
    sections = [
        f"# {participant_id} User Study Summary",
        "",
        "This report summarizes the protocol-aligned measures for the hard task in each condition. Survey matching intentionally ignores `scenarioId` mismatches and instead uses the participant/condition/set alignment.",
        "",
        "## Key Observations",
        "",
        *[f"- {item}" for item in observations],
        "",
        "## Objective Measures",
        "",
        build_objective_table(rows),
        "",
        "## Stage Time Breakdown",
        "",
        build_stage_time_table(rows),
        "",
        "## Per-Cell Survey",
        "",
        build_survey_table(rows),
        "",
        "## Grouped Comparison",
        "",
        "### Interface",
        "",
        build_group_table(rows, "Interface", INTERFACE_GROUPS),
        "",
        "### Mode",
        "",
        build_group_table(rows, "Mode", MODE_GROUPS),
        "",
        "## Post-Study Survey",
        "",
        build_post_study_section(post_study),
        "",
    ]
    return "\n".join(sections)


def main() -> int:
    args = parse_args()
    participant_id = getattr(args, "participant_id", None)

    if args.command == "interactive":
        chosen_participant = choose_participant_interactive(participant_id)
        if not chosen_participant:
            return 0
        bundle = build_analysis_bundle(chosen_participant)
        return run_interactive_mode(bundle, chosen_participant)

    if args.command == "cohort":
        participant_ids = resolve_cohort_participants(up_to=args.up_to, participants_arg=args.participants)
        if not participant_ids:
            raise SystemExit("No matching participants found for cohort analysis.")
        cohort_bundle = build_cohort_bundle(participant_ids)
        if args.output:
            output_path = Path(args.output)
            if not output_path.is_absolute():
                output_path = (REPO_ROOT / output_path).resolve()
            markdown = generate_cohort_markdown(cohort_bundle)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(markdown, encoding="utf-8")
            print(output_path)
            return 0
        if args.json:
            payload = cohort_bundle
            if args.section == "overview":
                payload = {
                    "participant_ids": cohort_bundle["participant_ids"],
                    "participant_count": cohort_bundle["participant_count"],
                }
            elif args.section == "conditions":
                payload = {"conditions": cohort_bundle["conditions"]}
            elif args.section == "groups":
                payload = {"groups": cohort_bundle["groups"]}
            elif args.section == "hypotheses":
                payload = {"hypotheses": cohort_bundle["hypotheses"]}
            print(json.dumps(payload, indent=2))
        else:
            print(format_cohort_output(cohort_bundle, args.section))
        return 0

    bundle = build_analysis_bundle(participant_id)

    if args.command == "report":
        output_path = Path(args.output) if args.output else REPO_ROOT / "docs" / "scenarios" / "user_study" / f"{participant_id}_summary.md"
        if not output_path.is_absolute():
            output_path = (REPO_ROOT / output_path).resolve()
        markdown = generate_markdown(participant_id, bundle["rows"], bundle["post_study"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(markdown, encoding="utf-8")
        print(output_path)
        return 0

    if args.command == "show":
        if args.json:
            payload = dict(bundle)
            if args.section == "overview":
                payload = {
                    "participant_id": participant_id,
                    "conditions": bundle["conditions"],
                }
            elif args.section == "conditions":
                conditions = bundle["conditions"]
                if args.condition:
                    conditions = [item for item in conditions if item["condition_code"] == args.condition]
                payload = {"participant_id": participant_id, "conditions": conditions}
            elif args.section == "groups":
                payload = {"participant_id": participant_id, "groups": bundle["groups"]}
            elif args.section == "trends":
                payload = {"participant_id": participant_id, "trends": bundle["trends"]}
            print(json.dumps(payload, indent=2))
        else:
            print(format_show_output(bundle, args.section, args.condition))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
