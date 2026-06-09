import pytest

from app.services.grading_service import (
    PENALTY_WEIGHT,
    grade_answer,
    grade_multiple_choice,
    grade_open_answer,
    grade_single_choice,
)


class TestSingleChoice:
    def test_correct(self):
        is_correct, score = grade_single_choice({"option_id": "a"}, {"option_id": "a"})
        assert is_correct is True
        assert score == 1.0

    def test_wrong(self):
        is_correct, score = grade_single_choice({"option_id": "b"}, {"option_id": "a"})
        assert is_correct is False
        assert score == 0.0

    def test_missing_selection(self):
        is_correct, score = grade_single_choice({}, {"option_id": "a"})
        assert is_correct is False
        assert score == 0.0


class TestMultipleChoice:
    def test_all_correct_no_wrong(self):
        is_correct, score = grade_multiple_choice(
            {"option_ids": ["a", "b"]}, {"option_ids": ["a", "b"]}
        )
        assert is_correct is True
        assert score == 1.0

    def test_partial_no_wrong(self):
        # S=1, W=0, C=2 → score = 1/2 − 0 = 0.5
        _, score = grade_multiple_choice(
            {"option_ids": ["a"]}, {"option_ids": ["a", "b"]}
        )
        assert score == pytest.approx(0.5)

    def test_partial_with_wrong(self):
        # S=1, W=1, C=2 → score = max(0, 1/2 − 0.5*1/2) = max(0, 0.25) = 0.25
        is_correct, score = grade_multiple_choice(
            {"option_ids": ["a", "c"]}, {"option_ids": ["a", "b"]}
        )
        assert is_correct is False
        assert score == pytest.approx(0.25)

    def test_all_wrong_clamped_to_zero(self):
        # S=0, W=2, C=2 → max(0, 0 − 0.5) = 0
        _, score = grade_multiple_choice(
            {"option_ids": ["c", "d"]}, {"option_ids": ["a", "b"]}
        )
        assert score == 0.0

    def test_empty_correct_answer(self):
        is_correct, score = grade_multiple_choice({"option_ids": []}, {"option_ids": []})
        assert is_correct is True
        assert score == 1.0


class TestOpenAnswer:
    def test_all_keywords_matched(self):
        score = grade_open_answer("The quick brown fox", ["quick", "brown"], 1)
        assert score == 1.0

    def test_partial_match(self):
        score = grade_open_answer("The quick fox", ["quick", "brown"], 1)
        assert score == pytest.approx(0.5)

    def test_no_keywords(self):
        score = grade_open_answer("anything", [], 1)
        assert score == 1.0

    def test_case_insensitive(self):
        score = grade_open_answer("QUICK BROWN", ["quick", "brown"], 1)
        assert score == 1.0


class TestGradeAnswer:
    def test_single_choice_dispatch(self):
        is_correct, _ = grade_answer("single_choice", {"option_id": "a"}, {"option_id": "a"})
        assert is_correct is True

    def test_multiple_choice_dispatch(self):
        is_correct, _ = grade_answer(
            "multiple_choice", {"option_ids": ["a"]}, {"option_ids": ["a"]}
        )
        assert is_correct is True

    def test_open_answer_returns_none(self):
        is_correct, score = grade_answer(
            "open_answer", {"text": "answer here"}, {"keywords": ["answer"], "min_match": 1}
        )
        assert is_correct is None
        assert score > 0

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError):
            grade_answer("unknown_type", {}, {})
