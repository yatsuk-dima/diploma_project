"""
Integration tests for the full attempt flow.

Requires a real PostgreSQL database and Redis. Run with:
    pytest --run-integration

Set DATABASE_URL, SYNC_DATABASE_URL, and REDIS_URL in the environment before running.
Users are created via POST /api/users (instructor-only); the first instructor is
inserted directly so subsequent operations can use the API normally.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_instructor_direct(db_url: str, login: str, password: str) -> None:
    """Insert instructor directly into DB to bootstrap the first account."""
    from sqlalchemy import create_engine
    from app.services.auth_service import hash_password

    engine = create_engine(db_url)
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, full_name, login, password_hash, role, is_active) "
                "VALUES (:id, :fn, :login, :ph, 'instructor', true) ON CONFLICT (login) DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "fn": "Test Instructor", "login": login, "ph": hash_password(password)},
        )
        conn.commit()
    engine.dispose()


async def _login(client: AsyncClient, login: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"login": login, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Full attempt flow
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_full_attempt_flow():
    """
    End-to-end: instructor creates test + questions, assigns to student,
    student starts attempt, answers all questions, finishes, sees results.
    """
    from app.config import settings
    from app.main import app

    inst_login = f"inst_{uuid.uuid4().hex[:8]}"
    stud_login = f"stud_{uuid.uuid4().hex[:8]}"
    password = "Test1234!"

    await _create_instructor_direct(settings.SYNC_DATABASE_URL, inst_login, password)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inst_token = await _login(client, inst_login, password)
        ih = _h(inst_token)

        # Create student via instructor API
        resp = await client.post(
            "/api/users",
            json={"full_name": "Test Student", "login": stud_login, "password": password, "role": "student"},
            headers=ih,
        )
        assert resp.status_code == 201, resp.text
        stud_id = resp.json()["id"]

        # Create test
        resp = await client.post(
            "/api/tests",
            json={"title": "Integration Test", "max_attempts": 3},
            headers=ih,
        )
        assert resp.status_code == 201, resp.text
        test_id = resp.json()["id"]

        # Add single_choice question
        opt_correct_id = str(uuid.uuid4())
        opt_wrong_id = str(uuid.uuid4())
        resp = await client.post(
            f"/api/tests/{test_id}/questions",
            json={
                "text": "What is 1+1?",
                "type": "single_choice",
                "order": 0,
                "options": [
                    {"id": opt_wrong_id, "text": "1"},
                    {"id": opt_correct_id, "text": "2"},
                ],
                "correct_answer": {"option_id": opt_correct_id},
            },
            headers=ih,
        )
        assert resp.status_code == 201, resp.text

        # Add open_answer question
        resp = await client.post(
            f"/api/tests/{test_id}/questions",
            json={
                "text": "Describe TCP/IP.",
                "type": "open_answer",
                "order": 1,
                "correct_answer": {"keywords": ["tcp", "protocol"], "min_match": 1},
            },
            headers=ih,
        )
        assert resp.status_code == 201, resp.text

        # Publish test
        resp = await client.post(f"/api/tests/{test_id}/publish", headers=ih)
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_published"] is True

        # Assign to student (no deadline)
        resp = await client.post(
            f"/api/tests/{test_id}/assign",
            json={"student_id": stud_id},
            headers=ih,
        )
        assert resp.status_code == 201, resp.text

        # Student login
        stud_token = await _login(client, stud_login, password)
        sh = _h(stud_token)

        # Start attempt
        resp = await client.post("/api/attempts", json={"test_id": test_id}, headers=sh)
        assert resp.status_code == 201, resp.text
        attempt_id = resp.json()["attempt_id"]

        # Answer all questions
        answered = 0
        while True:
            resp = await client.get(f"/api/attempts/{attempt_id}/next", headers=sh)
            if resp.status_code == 404 and resp.json().get("detail") == "all_answered":
                break
            assert resp.status_code == 200, resp.text
            q = resp.json()["question"]

            if q["type"] == "single_choice":
                answer = {"option_id": q["options"][0]["id"]}
            elif q["type"] == "multiple_choice":
                answer = {"option_ids": [q["options"][0]["id"]]}
            else:
                answer = {"text": "TCP is a reliable transport layer protocol"}

            resp = await client.post(
                f"/api/attempts/{attempt_id}/answer",
                json={"question_id": q["id"], "answer": answer},
                headers=sh,
            )
            assert resp.status_code == 200, resp.text
            answered += 1
            if answered > 20:
                break  # safety guard

        # Finish attempt
        resp = await client.post(f"/api/attempts/{attempt_id}/finish", headers=sh)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "completed"

        # Get results
        resp = await client.get(f"/api/attempts/{attempt_id}/result", headers=sh)
        assert resp.status_code == 200, resp.text
        result = resp.json()
        assert result["status"] == "completed"
        assert len(result["answers"]) == 2


@pytest.mark.anyio
async def test_cannot_exceed_max_attempts():
    """Starting a second attempt after the limit is reached returns ATTEMPT_LIMIT_REACHED."""
    from app.config import settings
    from app.main import app

    inst_login = f"inst_{uuid.uuid4().hex[:8]}"
    stud_login = f"stud_{uuid.uuid4().hex[:8]}"
    password = "Test1234!"

    await _create_instructor_direct(settings.SYNC_DATABASE_URL, inst_login, password)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inst_token = await _login(client, inst_login, password)
        ih = _h(inst_token)

        # Create student
        resp = await client.post(
            "/api/users",
            json={"full_name": "Limit Student", "login": stud_login, "password": password, "role": "student"},
            headers=ih,
        )
        assert resp.status_code == 201
        stud_id = resp.json()["id"]

        # Create test with max_attempts=1
        resp = await client.post("/api/tests", json={"title": "Limit Test", "max_attempts": 1}, headers=ih)
        assert resp.status_code == 201
        test_id = resp.json()["id"]

        # Add a question (required to publish)
        opt_id = str(uuid.uuid4())
        await client.post(
            f"/api/tests/{test_id}/questions",
            json={
                "text": "Q1?", "type": "single_choice", "order": 0,
                "options": [{"id": opt_id, "text": "Yes"}],
                "correct_answer": {"option_id": opt_id},
            },
            headers=ih,
        )

        await client.post(f"/api/tests/{test_id}/publish", headers=ih)
        await client.post(f"/api/tests/{test_id}/assign", json={"student_id": stud_id}, headers=ih)

        stud_token = await _login(client, stud_login, password)
        sh = _h(stud_token)

        # First attempt
        resp = await client.post("/api/attempts", json={"test_id": test_id}, headers=sh)
        assert resp.status_code == 201
        attempt_id = resp.json()["attempt_id"]
        await client.post(f"/api/attempts/{attempt_id}/finish", headers=sh)

        # Second attempt must be rejected
        resp = await client.post("/api/attempts", json={"test_id": test_id}, headers=sh)
        assert resp.status_code == 409
        assert resp.json().get("code") == "ATTEMPT_LIMIT_REACHED"
