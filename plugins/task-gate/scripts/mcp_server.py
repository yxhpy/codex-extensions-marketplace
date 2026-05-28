#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(PLUGIN_ROOT))

from scripts.task_gate import PlanError, TaskPlanner  # noqa: E402


class TaskGateMcpServer:
    def __init__(self, planner: TaskPlanner | None = None) -> None:
        self.planner = planner or TaskPlanner()

    def handle(self, request: dict[str, Any]) -> dict[str, Any] | None:
        method = request.get("method")
        request_id = request.get("id")

        try:
            if method == "initialize":
                return self._result(
                    request_id,
                    {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "task-gate", "version": "0.1.0"},
                    },
                )
            if method == "notifications/initialized":
                return None
            if method == "tools/list":
                return self._result(request_id, {"tools": [self._plan_prompt_tool()]})
            if method == "tools/call":
                return self._handle_tool_call(request_id, request.get("params") or {})
            return self._error(request_id, -32601, f"unknown method: {method}")
        except PlanError as exc:
            return self._error(request_id, -32000, str(exc))
        except Exception as exc:  # pragma: no cover - final safety net for MCP clients.
            return self._error(request_id, -32603, f"internal error: {exc}")

    def _handle_tool_call(
        self,
        request_id: Any,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if name != "plan_prompt":
            return self._error(request_id, -32602, f"unknown tool: {name}")

        prompt = str(arguments.get("prompt") or "")
        max_tasks = int(arguments.get("max_tasks") or self.planner.max_tasks)
        planner = TaskPlanner(thinker=self.planner.thinker, max_tasks=max_tasks)
        plan = planner.plan(prompt)
        payload = plan.to_dict()
        return self._result(
            request_id,
            {
                "content": [{"type": "text", "text": plan.to_json()}],
                "structuredContent": payload,
            },
        )

    def _plan_prompt_tool(self) -> dict[str, Any]:
        return {
            "name": "plan_prompt",
            "description": (
                "Convert a raw user prompt into a numbered executable task list "
                "before Codex performs implementation work."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Raw user prompt to decompose into tasks.",
                    },
                    "max_tasks": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "default": self.planner.max_tasks,
                    },
                },
                "required": ["prompt"],
                "additionalProperties": False,
            },
        }

    def _result(self, request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _error(self, request_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }


def main() -> int:
    server = TaskGateMcpServer()
    for line in sys.stdin:
        if not line.strip():
            continue
        response = server.handle(json.loads(line))
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
