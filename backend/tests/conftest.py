"""
pytest configuration: force asyncio mode for all async tests.
"""
import pytest


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "e2e: End-to-end integration test")
    config.addinivalue_line("markers", "adversarial: Adversarial prompt injection test")
