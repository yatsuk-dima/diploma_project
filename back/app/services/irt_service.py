import math

import numpy as np
from catsim.estimation import NumericalSearchEstimator

from app.config import settings

_estimator = NumericalSearchEstimator()


def estimate_theta(
    difficulties: list[float],
    responses: list[bool],
    initial_theta: float = 0.0,
) -> float:
    """Estimate student ability θ using the Rasch model (IRT).

    Returns the updated θ, or initial_theta unchanged if all responses are
    identical (MLE is undefined — log-likelihood has no finite maximum).
    """
    if not difficulties or len(difficulties) != len(responses):
        return initial_theta

    items = np.array([[1.0, d, 0.0, 1.0] for d in difficulties])
    administered = list(range(len(difficulties)))
    response_vector = [bool(r) for r in responses]

    # With a single all-identical response MLE has no finite maximum; skip estimation
    if len(set(response_vector)) == 1 and len(response_vector) < 2:
        return initial_theta

    try:
        theta = _estimator.estimate(
            items=items,
            administered_items=administered,
            response_vector=response_vector,
            est_theta=initial_theta,
        )
        return float(theta)
    except Exception:
        return initial_theta


def estimate_item_difficulty(correct_count: int, total_count: int) -> float | None:
    """Logit-based difficulty estimate from empirical proportion correct.

    Returns None when total_count < IRT_MIN_RESPONSE_COUNT (not enough data).
    Clips the proportion to (0.01, 0.99) to avoid ±∞.
    """
    if total_count < settings.IRT_MIN_RESPONSE_COUNT:
        return None
    p = max(0.01, min(0.99, correct_count / total_count))
    # Rasch model: b ≈ −logit(p) so harder items have higher b
    return -math.log(p / (1.0 - p))
