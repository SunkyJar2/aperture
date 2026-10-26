"""Tests for Director Chat Dialogue Module."""
import pytest
from app.director import _get_contextual_fallback_reply, generate_director_reply


def test_fallback_reply_noir_mood():
    messages = [{"role": "user", "text": "moody noir interrogation with heavy shadows"}]
    reply = _get_contextual_fallback_reply(messages)
    assert len(reply) > 20
    assert "?" in reply  # Must ask a clarifying question
    assert "noir" in reply.lower() or "chiaroscuro" in reply.lower() or "shadow" in reply.lower()


def test_fallback_reply_golden_hour():
    messages = [{"role": "user", "text": "warm golden hour reunion with nostalgic flare"}]
    reply = _get_contextual_fallback_reply(messages)
    assert "?" in reply
    assert "amber" in reply.lower() or "warm" in reply.lower() or "golden" in reply.lower()


def test_fallback_reply_general():
    messages = [{"role": "user", "text": "a simple conversation scene"}]
    reply = _get_contextual_fallback_reply(messages)
    assert "?" in reply
    assert len(reply) > 20
