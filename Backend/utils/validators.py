"""
Input validation and error handling utilities.
Provides validation for API and workflow inputs.
"""

from typing import Tuple, Optional


class InputValidator:
    """Validates user inputs and provides helpful error messages."""

    @staticmethod
    def validate_text_input(text: str, min_chars: int = 10) -> Tuple[bool, Optional[str]]:
        """
        Validate user text input.

        Args:
            text: Input text to validate
            min_chars: Minimum character requirement

        Returns:
            (is_valid, error_message)
        """
        if not text or not text.strip():
            return False, "❌ Text input cannot be empty. Please enter some text."

        if len(text.strip()) < min_chars:
            return (
                False,
                f"❌ Text is too short (minimum {min_chars} characters required). "
                f"You have {len(text.strip())} characters.",
            )

        has_heading = any(
            line.strip() and len(line.strip().split()) <= 6 for line in text.split("\n")
        )

        if not has_heading:
            return (
                False,
                "⚠️ Text appears to have no clear structure. Please ensure you have "
                "headings followed by bullet points.",
            )

        return True, None

    @staticmethod
    def validate_points_per_cycle(value: int) -> Tuple[bool, Optional[str]]:
        """
        Validate points per cycle input.

        Args:
            value: Number of points per cycle

        Returns:
            (is_valid, error_message)
        """
        if value < 1:
            return False, "❌ Points per cycle must be at least 1."
        if value > 20:
            return False, "❌ Points per cycle should not exceed 20 (may cause formatting issues)."

        return True, None
