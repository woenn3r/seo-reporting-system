from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import yaml
from jinja2 import Environment

from app.core.manifest import actions_rules_path


@dataclass(frozen=True)
class ActionRule:
    id: str
    priority: int
    severity: str
    conditions: list[dict[str, Any]]
    title: dict[str, str]
    reason: dict[str, str]
    data_refs: list[str]


def _load_rules(manifest: dict[str, Any]) -> tuple[list[ActionRule], dict[str, Any]]:
    path = actions_rules_path(manifest)
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    limits = raw.get("limits", {"min_actions": 5, "max_actions": 8})
    rules = []
    for r in raw.get("rules", []):
        rules.append(
            ActionRule(
                id=r["id"],
                priority=int(r.get("priority", 0)),
                severity=r.get("severity", "info"),
                conditions=r.get("conditions", []),
                title=r.get("title", {}),
                reason=r.get("reason", {}),
                data_refs=r.get("data_refs", []),
            )
        )
    return rules, limits


def build_actions(
    payload: dict[str, Any],
    project: dict[str, Any],
    manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    actions, _trace = build_actions_with_trace(payload, project, manifest)
    return actions


def build_actions_with_trace(
    payload: dict[str, Any],
    project: dict[str, Any],
    manifest: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rules, limits = _load_rules(manifest)
    rules = sorted(rules, key=lambda r: r.priority, reverse=True)

    env = Environment(autoescape=False)
    language = payload.get("meta", {}).get("report_language", "de")
    actions: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    trace: list[dict[str, Any]] = []

    for rule in rules:
        met, details = _evaluate_conditions(rule.conditions, payload, project)
        trace_entry = {
            "rule_id": rule.id,
            "conditions": rule.conditions,
            "values": details,
            "eval_result": met,
            "included": False,
            "severity_final": rule.severity,
            "source": "rule",
        }
        if met:
            if rule.id in seen_ids:
                trace.append(trace_entry)
                continue
            actions.append(_render_action(rule, payload, env, language))
            seen_ids.add(rule.id)
            trace_entry["included"] = True
            trace.append(trace_entry)
            if len(actions) >= limits.get("max_actions", 8):
                break
        else:
            trace.append(trace_entry)

    min_actions = limits.get("min_actions", 5)
    if len(actions) < min_actions:
        fallback_ids = [
            "ACT_TECH_HYGIENE",
            "ACT_INDEX_COVERAGE",
            "ACT_INTERNAL_LINKS",
            "ACT_CONTENT_REFRESH",
            "ACT_SCHEMA_CHECK",
        ]
        for fid in fallback_ids:
            if len(actions) >= min_actions:
                break
            if fid in seen_ids:
                continue
            fallback = next((r for r in rules if r.id == fid), None)
            if not fallback:
                continue
            actions.append(_render_action(fallback, payload, env, language))
            seen_ids.add(fid)
            trace.append(
                {
                    "rule_id": fid,
                    "conditions": [],
                    "values": [],
                    "eval_result": True,
                    "included": True,
                    "severity_final": fallback.severity,
                    "source": "fallback",
                }
            )

    return actions[: limits.get("max_actions", 8)], trace


def _render_action(rule: ActionRule, payload: dict[str, Any], env: Environment, language: str) -> dict[str, Any]:
    title_tpl = rule.title.get(language) or rule.title.get("de") or ""
    reason_tpl = rule.reason.get(language) or rule.reason.get("de") or ""
    title = env.from_string(title_tpl).render(**payload)
    reason = env.from_string(reason_tpl).render(**payload)
    return {
        "id": rule.id,
        "title": title,
        "reason": reason,
        "severity": rule.severity,
        "data_refs": rule.data_refs,
    }


def _conditions_met(conditions: list[dict[str, Any]], payload: dict[str, Any], project: dict[str, Any]) -> bool:
    met, _details = _evaluate_conditions(conditions, payload, project)
    return met


def _evaluate_conditions(
    conditions: list[dict[str, Any]],
    payload: dict[str, Any],
    project: dict[str, Any],
) -> tuple[bool, list[dict[str, Any]]]:
    details: list[dict[str, Any]] = []
    for cond in conditions:
        op = cond.get("op")
        field = cond.get("field")
        value = cond.get("value")
        threshold_key = cond.get("threshold_key")

        current = _get(payload, field) if field else None
        threshold = project.get("thresholds", {}).get(threshold_key) if threshold_key else None

        passed = True
        if op == "exists":
            if current is None:
                passed = False
        elif op == "neq":
            if current == value:
                passed = False
        elif op == "lt":
            if current is None or not (current < value):
                passed = False
        elif op == "gt":
            if current is None or not (current > value):
                passed = False
        elif op == "gte":
            if current is None or not (current >= value):
                passed = False
        elif op == "lte":
            if current is None or not (current <= value):
                passed = False
        elif op == "len_gt":
            if not isinstance(current, list) or not (len(current) > value):
                passed = False
        elif op == "lte_neg_threshold":
            if current is None or threshold is None or not (current <= -threshold):
                passed = False
        elif op == "gte_pos_threshold":
            if current is None or threshold is None or not (current >= threshold):
                passed = False
        else:
            passed = False

        details.append(
            {
                "field": field,
                "op": op,
                "value": value,
                "threshold_key": threshold_key,
                "current": current,
                "threshold": threshold,
                "passed": passed,
            }
        )
        if not passed:
            return False, details
    return True, details


def _get(obj: dict[str, Any], path: str | None) -> Any:
    if not path:
        return None
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur
