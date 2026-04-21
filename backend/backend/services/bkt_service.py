"""Bayesian Knowledge Tracing (BKT) Engine.

Implements a standard BKT update rule used to estimate per-concept
mastery probability after each student interaction.

Reference defaults (conservative, free-tier-safe):
    p_init  = 0.3   Prior probability of mastery before any evidence.
    p_learn = 0.2   Probability of transitioning from unlearned → learned on a
                     single opportunity.
    p_slip  = 0.1   Probability of a correct-to-incorrect slip (knows but answers
                     wrong).
    p_guess = 0.2   Probability of guessing correctly without mastery.
"""

from __future__ import annotations

MASTERY_THRESHOLD: float = 0.85


class BKTService:
    """Stateless Bayesian Knowledge Tracing calculator.

    All state is held externally (in ``session_state`` JSONB). This service
    receives the previous mastery probability and an observation, then returns
    the posterior.
    """

    def __init__(
        self,
        p_init: float = 0.3,
        p_learn: float = 0.2,
        p_slip: float = 0.1,
        p_guess: float = 0.2,
    ) -> None:
        self.p_init = p_init
        self.p_learn = p_learn
        self.p_slip = p_slip
        self.p_guess = p_guess

    # ------------------------------------------------------------------
    # Core BKT update
    # ------------------------------------------------------------------

    def update(self, p_mastery: float, outcome: int) -> float:
        """Return the updated mastery probability after a single observation.

        Parameters
        ----------
        p_mastery:
            Prior mastery probability (0.0–1.0).  Use ``p_init`` for the first
            interaction on a new concept.
        outcome:
            1 → Correct / understood,  0 → Incorrect / not understood.

        Returns
        -------
        float
            Posterior mastery probability clamped to [0.0, 1.0].
        """
        if outcome not in (0, 1):
            raise ValueError(f"outcome must be 0 or 1, got {outcome}")

        p_mastery = max(0.0, min(1.0, p_mastery))

        # --- Step 1: Posterior after observing the outcome (Bayes' rule) ---
        if outcome == 1:
            # P(L_n | correct) = P(correct | L_n) * P(L_n) / P(correct)
            p_correct_given_mastered = 1.0 - self.p_slip
            p_correct_given_not_mastered = self.p_guess
            p_correct = (
                p_correct_given_mastered * p_mastery
                + p_correct_given_not_mastered * (1.0 - p_mastery)
            )
            if p_correct == 0.0:
                posterior = p_mastery
            else:
                posterior = (p_correct_given_mastered * p_mastery) / p_correct
        else:
            # P(L_n | incorrect) = P(incorrect | L_n) * P(L_n) / P(incorrect)
            p_incorrect_given_mastered = self.p_slip
            p_incorrect_given_not_mastered = 1.0 - self.p_guess
            p_incorrect = (
                p_incorrect_given_mastered * p_mastery
                + p_incorrect_given_not_mastered * (1.0 - p_mastery)
            )
            if p_incorrect == 0.0:
                posterior = p_mastery
            else:
                posterior = (p_incorrect_given_mastered * p_mastery) / p_incorrect

        # --- Step 2: Account for learning transition ---
        # P(L_{n+1}) = P(L_n | obs) + (1 - P(L_n | obs)) * P(T)
        updated = posterior + (1.0 - posterior) * self.p_learn

        return max(0.0, min(1.0, updated))

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def is_mastered(self, p_mastery: float) -> bool:
        """Return True when *p_mastery* meets or exceeds the mastery threshold."""
        return p_mastery >= MASTERY_THRESHOLD

    def initial_probability(self) -> float:
        """Return the configured prior mastery probability."""
        return self.p_init
