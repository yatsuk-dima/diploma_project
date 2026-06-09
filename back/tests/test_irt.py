import math

import pytest

from app.services.irt_service import estimate_item_difficulty, estimate_theta


class TestEstimateTheta:
    def test_all_correct_increases_theta(self):
        # All correct answers on moderately difficult items → θ should exceed initial
        difficulties = [0.0, 0.5, 1.0]
        responses = [True, True, True]
        theta = estimate_theta(difficulties, responses, initial_theta=0.0)
        assert theta > 0.0

    def test_all_wrong_does_not_increase_theta(self):
        # All-wrong on moderate items: theta should not increase.
        # With uniform responses the MLE is monotone and catsim may keep initial_theta.
        difficulties = [0.0, 0.5, 1.0]
        responses = [False, False, False]
        theta = estimate_theta(difficulties, responses, initial_theta=0.0)
        assert theta <= 0.0

    def test_mixed_returns_reasonable_theta(self):
        difficulties = [-1.0, 0.0, 1.0, 2.0]
        responses = [True, True, False, False]
        theta = estimate_theta(difficulties, responses, initial_theta=0.0)
        # With 2 correct / 2 wrong around median, θ should be near 0
        assert -1.5 < theta < 1.5

    def test_empty_returns_initial(self):
        theta = estimate_theta([], [], initial_theta=1.5)
        assert theta == 1.5

    def test_mismatched_lengths_returns_initial(self):
        theta = estimate_theta([0.0, 1.0], [True], initial_theta=0.5)
        assert theta == 0.5

    def test_initial_theta_used_as_starting_point(self):
        # Two different starting thetas on the same data should converge to same answer
        difficulties = [0.0, 0.5, 1.0, -0.5]
        responses = [True, True, False, True]
        t1 = estimate_theta(difficulties, responses, initial_theta=-2.0)
        t2 = estimate_theta(difficulties, responses, initial_theta=2.0)
        assert abs(t1 - t2) < 1.0  # should converge regardless of start

    def test_single_response_returns_value(self):
        # Single item: catsim may or may not converge, but must not raise
        theta = estimate_theta([0.0], [True], initial_theta=0.0)
        assert isinstance(theta, float)


class TestEstimateItemDifficulty:
    def test_below_30_returns_none(self):
        assert estimate_item_difficulty(15, 29) is None

    def test_exactly_30_returns_value(self):
        result = estimate_item_difficulty(15, 30)
        assert result is not None
        assert isinstance(result, float)

    def test_high_correct_rate_gives_negative_difficulty(self):
        # p=0.9 → b = -logit(0.9) = -log(9) ≈ -2.2 → easy item
        result = estimate_item_difficulty(27, 30)
        assert result < 0.0

    def test_low_correct_rate_gives_positive_difficulty(self):
        # p=0.1 → b = -logit(0.1) = log(9) ≈ 2.2 → hard item
        result = estimate_item_difficulty(3, 30)
        assert result > 0.0

    def test_fifty_percent_near_zero(self):
        # p=0.5 → logit(0.5)=0 → b≈0
        result = estimate_item_difficulty(15, 30)
        assert result == pytest.approx(0.0, abs=0.01)

    def test_perfect_score_clipped(self):
        # p=1.0 would be ∞; should be clipped to 0.99
        result = estimate_item_difficulty(30, 30)
        assert result is not None
        assert math.isfinite(result)

    def test_zero_correct_clipped(self):
        result = estimate_item_difficulty(0, 30)
        assert result is not None
        assert math.isfinite(result)
