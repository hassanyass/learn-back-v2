import asyncio
import json
import random
import string
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import websockets

BASE_URL = "http://localhost:8000"
WS_BASE_URL = "ws://localhost:8000"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return response.text


def _rand_suffix(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def _new_step(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "ok": False,
        "status_code": None,
        "duration_ms": 0.0,
        "details": "",
        "request_payload": None,
        "response_payload": None,
    }


async def run_e2e() -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    context: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=90.0) as client:
        # Step 1: Auth
        step = _new_step("Step 1 (Auth): Register + Login")
        started = time.perf_counter()
        try:
            suffix = _rand_suffix()
            email = f"e2e_{suffix}@learnbackqa.com"
            username = f"e2e_{suffix}"
            password = "SecurePass123!"

            reg_payload = {"email": email, "username": username, "password": password}
            reg_resp = await client.post(f"{BASE_URL}/auth/register", json=reg_payload)

            login_payload = {"email": email, "password": password}
            login_resp = await client.post(f"{BASE_URL}/auth/login", json=login_payload)

            token = _safe_json(login_resp).get("access_token") if login_resp.status_code == 200 else None
            context["token"] = token

            step["status_code"] = login_resp.status_code
            step["request_payload"] = {"register": reg_payload, "login": login_payload}
            step["response_payload"] = {
                "register_status": reg_resp.status_code,
                "register_body": _safe_json(reg_resp),
                "login_status": login_resp.status_code,
                "login_body": _safe_json(login_resp),
            }
            step["ok"] = reg_resp.status_code in (200, 201) and login_resp.status_code == 200 and bool(token)
            if not step["ok"]:
                step["details"] = "Failed to register/login or token missing."
        except Exception as exc:
            step["details"] = f"Exception: {exc}"
        step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(step)

        # Step 2: Dashboard
        step = _new_step("Step 2 (Dashboard): GET dashboard")
        started = time.perf_counter()
        try:
            token = context.get("token")
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            resp = await client.get(f"{BASE_URL}/dashboard/", headers=headers, params={"timezone": "UTC"})
            body = _safe_json(resp)

            has_fields = isinstance(body, dict) and "current_streak_days" in body and "unlocked_milestones" in body
            step["status_code"] = resp.status_code
            step["request_payload"] = {"headers": {"Authorization": "Bearer <token>" if token else None}}
            step["response_payload"] = body
            step["ok"] = resp.status_code == 200 and has_fields
            if not step["ok"]:
                step["details"] = "Dashboard response missing expected streak/milestone fields or non-200 status."
        except Exception as exc:
            step["details"] = f"Exception: {exc}"
        step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(step)

        # Step 3: Ingestion
        step = _new_step("Step 3 (Ingestion): Upload slides")
        started = time.perf_counter()
        try:
            token = context.get("token")
            headers = {"Authorization": f"Bearer {token}"} if token else {}

            # Requested mock text upload (app currently enforces PDF/PPTX).
            files = {"file": ("slides.txt", b"Topic: Neural Networks\nConcept: Backpropagation", "text/plain")}
            resp = await client.post(f"{BASE_URL}/ingestion/upload-slides/", headers=headers, files=files)

            body = _safe_json(resp)
            step["status_code"] = resp.status_code
            step["request_payload"] = {"endpoint": "/ingestion/upload-slides/"}
            step["response_payload"] = body

            has_segmentation = isinstance(body, dict) and "segmentation" in body
            step["ok"] = resp.status_code == 200 and has_segmentation
            if not step["ok"]:
                step["details"] = (
                    "Ingestion did not return segmentation JSON. "
                    "Likely due to file type restriction (PDF/PPTX only) or endpoint mismatch."
                )

            # Try to extract session id for Step 4
            if isinstance(body, dict):
                context["session_id"] = body.get("session_id") or body.get("id")
        except Exception as exc:
            step["details"] = f"Exception: {exc}"
        step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(step)

    # Step 4: Session WebSocket
    step = _new_step("Step 4 (Session WebSocket): Send 'Hello Kido'")
    started = time.perf_counter()
    try:
        session_id = context.get("session_id")
        if not session_id:
            step["details"] = "No session_id found from ingestion response; cannot open session websocket."
        else:
            ws_url = f"{WS_BASE_URL}/ws/session/{session_id}"
            async with websockets.connect(ws_url, open_timeout=20) as websocket:
                await websocket.send("Hello Kido")
                raw_reply = await asyncio.wait_for(websocket.recv(), timeout=45)
                parsed = json.loads(raw_reply) if isinstance(raw_reply, str) else raw_reply
                step["status_code"] = 101
                step["response_payload"] = parsed
                step["ok"] = True
    except Exception as exc:
        step["details"] = f"Exception: {exc}"
    step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
    results.append(step)

    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    return {
        "ran_at": _now_iso(),
        "base_url": BASE_URL,
        "passed": passed,
        "failed": failed,
        "steps": results,
    }


def write_markdown_report(report: dict[str, Any]) -> Path:
    root = Path(__file__).resolve().parents[1]
    out_path = root / "backend" / "Architecture" / "latest_test_results.md"

    lines: list[str] = []
    lines.append("# Latest E2E Test Results")
    lines.append("")
    lines.append(f"- Run Timestamp (UTC): `{report['ran_at']}`")
    lines.append(f"- Base URL: `{report['base_url']}`")
    lines.append(f"- Passed: `{report['passed']}`")
    lines.append(f"- Failed: `{report['failed']}`")
    lines.append("")
    lines.append("## Step Results")
    lines.append("")

    for step in report["steps"]:
        status = "PASS" if step["ok"] else "FAIL"
        lines.append(f"### {step['name']} — {status}")
        lines.append(f"- HTTP/WS Status: `{step['status_code']}`")
        lines.append(f"- Duration: `{step['duration_ms']} ms`")
        if step["details"]:
            lines.append(f"- Notes: {step['details']}")
        lines.append("- Request Payload:")
        lines.append("```json")
        lines.append(json.dumps(step["request_payload"], indent=2, ensure_ascii=True))
        lines.append("```")
        lines.append("- Response Payload:")
        lines.append("```json")
        lines.append(json.dumps(step["response_payload"], indent=2, ensure_ascii=True, default=str))
        lines.append("```")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


async def main() -> None:
    report = await run_e2e()
    report_path = write_markdown_report(report)

    print("\n=== LearnBack E2E Simulation Complete ===")
    print(f"Passed: {report['passed']}, Failed: {report['failed']}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
