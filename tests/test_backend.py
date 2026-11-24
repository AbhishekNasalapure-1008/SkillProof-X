import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
from fastapi.testclient import TestClient

from backend import analysis, main


CLIP = main.ROOT / "public" / "media" / "workshop-sample.webm"


class WorkflowRules(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        for context in (patch.object(main, "DATA", Path(temp.name)),
                        patch.object(main, "MEDIA", Path(temp.name) / "media"),
                        patch.dict(os.environ, {"GEMINI_API_KEY": ""})):
            self.enterContext(context)
        self.client = self.enterContext(TestClient(main.app))

    def upload(self):
        response = self.client.post("/api/assessments?filename=training.webm", content=CLIP.read_bytes())
        self.assertEqual(response.status_code, 201)
        return "/api/assessments/" + response.json()["id"]

    def test_upload_validation_cleans_incomplete_records(self):
        for filename, contents, status in [("bad.txt", b"text", 415), ("empty.mp4", b"", 422),
                                           ("renamed.webm", b"not a video", 422)]:
            result = self.client.post("/api/assessments", params={"filename": filename}, content=contents)
            self.assertEqual(result.status_code, status)
        with patch.object(main, "MAX_SIZE", 32):
            self.assertEqual(self.client.post("/api/assessments?filename=large.webm", content=b"x"*33).status_code, 413)
        self.assertEqual(list(main.MEDIA.iterdir()), [])
        self.assertEqual(self.client.get("/api/workspace").json()["assessments"], [])

    def test_issuance_rules_and_repeat_requests(self):
        url = self.upload()
        self.assertEqual(self.client.post(url + "/submit").status_code, 409)
        result = self.client.post(url + "/analyse?demo=true").json()
        self.assertEqual(result["mode"], "demo")
        self.assertEqual(len(result["findings"]), 5)
        self.assertEqual(self.client.post(url + "/analyse").json(), result)
        body = {"action": "issue", "decisions": {}, "confirmed": True}
        self.assertEqual(self.client.post(url + "/review", json=body).status_code, 409)
        self.client.post(url + "/submit").raise_for_status()
        self.assertEqual(self.client.post(url + "/review", json=body).status_code, 422)
        body["decisions"] = {name: "rejected" for name in analysis.COMPETENCIES}
        self.assertEqual(self.client.post(url + "/review", json=body).status_code, 422)
        body["decisions"][analysis.COMPETENCIES[0]] = "approved"
        self.assertEqual(self.client.post(url + "/review", json={**body, "confirmed": False}).status_code, 422)
        issued = self.client.post(url + "/review", json=body).json()
        self.assertEqual(self.client.post(url + "/review", json=body).status_code, 409)
        passport = self.client.get("/api/verify/" + issued["credentialId"]).json()
        self.assertEqual(passport["competencies"], analysis.COMPETENCIES[:1])
        self.assertEqual(len(self.client.get("/api/workspace").json()["credentials"]), 1)

    def test_frame_request_and_validated_mock_response(self):
        url = self.upload()

        def provider_reply(endpoint, headers, json, timeout):
            self.assertIn(":generateContent", endpoint)
            self.assertEqual(headers["x-goog-api-key"], "test-only")
            parts = json["contents"][0]["parts"]
            frames = [p["inlineData"] for p in parts if "inlineData" in p]
            self.assertEqual(len(frames), 12)
            self.assertTrue(all(p["mimeType"] == "image/jpeg" and p["data"].startswith("/9j/") for p in frames))
            return Mock(json=lambda: {"candidates": [{"content": {"parts": [{"text": response_text}]}}]})

        rows = [dict(competency=name, description="Test observation", limitations="Test limitation",
                     status="Evidence Found", timestamp=0, improvement="Keep the tool visible.")
                for name in analysis.COMPETENCIES]
        response_text = json.dumps(rows)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only"}), patch.object(analysis.httpx, "post", side_effect=provider_reply):
            result = self.client.post(url + "/analyse")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["findings"], rows)
        self.assertEqual(len(result.json()["frames"]), 12)
        self.assertEqual(self.client.get("/api/workspace").json()["credentials"], [])

    def test_provider_failure_preserves_upload_for_explicit_demo_retry(self):
        url = self.upload()
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only"}), patch.object(analysis.httpx, "post", side_effect=httpx.ConnectError("test")):
            self.assertEqual(self.client.post(url + "/analyse").status_code, 502)
            self.assertEqual(self.client.get("/api/workspace").json()["assessments"][0]["status"], "uploaded")
            self.assertEqual(self.client.post(url + "/analyse?demo=true").json()["mode"], "demo")

    def test_unobserved_timestamps_and_incomplete_coverage_are_rejected(self):
        rows = analysis.sample_findings(12)
        with self.assertRaises(ValueError):
            analysis.validate_findings(rows, [0.0, 2.0])
        with self.assertRaises(ValueError):
            analysis.validate_findings(rows[:-1], [0.0])

    def test_provider_http_errors_reach_the_client_and_preserve_the_upload(self):
        url = self.upload()
        retry = {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "7.5s"}
        auth = {"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID"}
        cases = [
            (400, "backend-test-secret", [auth], 400, "API key"),
            (401, "unauthenticated", [], 401, "API key"),
            (403, "permission denied", [], 403, "denied access"),
            (404, "model not found", [], 404, "generateContent"),
            (429, "quota exceeded", [retry], 429, "8 seconds"),
            (429, "quota exceeded, limit: 0", [], 429, "zero quota"),
            (503, "currently experiencing high demand", [], 503, "high demand"),
            (400, "invalid schema", [], 502, "structured-output"),
        ]
        with patch.dict(os.environ, {"GEMINI_API_KEY": "backend-test-secret"}), patch.object(analysis, "extract_frames", return_value=([], [0])):
            for upstream, message, details, expected, clue in cases:
                with self.subTest(upstream=upstream, message=message):
                    reply = httpx.Response(upstream, json={"error": {"message": message, "details": details}})
                    with patch.object(analysis.httpx, "post", return_value=reply) as request, patch.object(analysis.time, "sleep"), self.assertLogs("uvicorn.error") as logs:
                        response = self.client.post(url + "/analyse")
                    self.assertEqual(request.call_count, 2 if upstream == 503 else 1)
                    self.assertEqual(response.status_code, expected)
                    self.assertIn(clue, response.json()["detail"])
                    self.assertNotIn("backend-test-secret", response.text + str(logs.output))
                    if details == [retry]:
                        self.assertEqual(response.headers["Retry-After"], "8")
        item = self.client.get("/api/workspace").json()["assessments"][0]
        self.assertEqual((item["status"], item["mode"], item["findings"]), ("uploaded", None, []))

    def test_missing_key_and_timeout_do_not_generate_demo_findings(self):
        url = self.upload()
        self.assertEqual(self.client.post(url + "/analyse").status_code, 503)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only"}), patch.object(analysis.httpx, "post", side_effect=httpx.ReadTimeout("test")):
            self.assertEqual(self.client.post(url + "/analyse").status_code, 504)
        self.assertEqual(self.client.get("/api/workspace").json()["assessments"][0]["findings"], [])

    def test_response_envelope_blocking_truncation_and_json(self):
        rows = analysis.sample_findings(12)
        times = [r["timestamp"] for r in rows if r["timestamp"] is not None]
        def generation(parts, finish="STOP"):
            return {"candidates": [{"finishReason": finish, "content": {"parts": parts}}]}
        fenced = "```json\n" + json.dumps(rows) + "\n```"
        parts = [{"thought": True, "text": "internal"}, {"text": fenced[:50]}, {"text": fenced[50:]}]
        self.assertEqual(analysis.parse_generation(generation(parts), times), rows)
        for response, reason in [
            ({"promptFeedback": {"blockReason": "SAFETY"}}, "blocked the input"),
            (generation([], "SAFETY"), "blocked its response"),
            (generation([], "MAX_TOKENS"), "token limit"),
            (generation([{"text": "invalid"}]), "malformed findings JSON"),
            ({"candidates": []}, "no candidate"),
            (generation([]), "no findings text"),
        ]:
            with self.subTest(reason=reason), self.assertRaisesRegex(ValueError, reason):
                analysis.parse_generation(response, times)

    def test_short_capacity_error_retries_once_using_the_same_live_model(self):
        url = self.upload()
        rows = analysis.sample_findings(12)
        times = [r["timestamp"] for r in rows if r["timestamp"] is not None]
        good = httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {
            "parts": [{"text": json.dumps(rows)}]}}]})
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only"}), patch.object(analysis, "extract_frames", return_value=([], times)), patch.object(analysis.time, "sleep") as sleep:
            long_delay = httpx.Response(503, headers={"Retry-After": "120"})
            with patch.object(analysis.httpx, "post", return_value=long_delay) as send:
                self.assertEqual(self.client.post(url + "/analyse").status_code, 503)
                self.assertEqual(send.call_count, 1)
                sleep.assert_not_called()
            with patch.object(analysis.httpx, "post", side_effect=[httpx.Response(503), good]) as send:
                response = self.client.post(url + "/analyse")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["mode"], "live")
                self.assertEqual(send.call_count, 2)
                sleep.assert_called_once_with(2)
                self.assertEqual(send.call_args_list[0].args, send.call_args_list[1].args)
