"""Static demo content registry.

Single source of truth for pre-loaded demo sessions.
No DB table needed — hardcoded for controlled testing (30–40 users).
"""

from __future__ import annotations

from typing import Any


DEMO_REGISTRY: dict[str, dict[str, Any]] = {
    "demo_ml_intro": {
        "id": "demo_ml_intro",
        "title": "Introduction to Machine Learning",
        "slide_url": "https://qnfdjxlyorwlszkdqsdw.supabase.co/storage/v1/object/public/slides/user_19/lecture_01.pdf",
        "extracted_segments": [
            {
                "segment_id": 1,
                "topic_title": "Foundations of Intelligence and AI",
                "extracted_concepts": [
                    "Intelligence definition",
                    "Thinking as problem solving",
                    "Learning from data",
                    "Turing Test",
                    "Observable behavior",
                ],
            },
            {
                "segment_id": 2,
                "topic_title": "Early AI History and Challenges",
                "extracted_concepts": [
                    "Perceptron convergence theorem",
                    "General Problem Solver",
                    "Symbolic AI",
                    "XOR problem limitation",
                    "Funding withdrawal",
                ],
            },
            {
                "segment_id": 3,
                "topic_title": "Expert Systems and Transition to Computational AI",
                "extracted_concepts": [
                    "Expert systems (MYCIN)",
                    "Rule-based knowledge",
                    "Narrow domain",
                    "Rise of Computational AI",
                    "Data-driven techniques",
                ],
            },
            {
                "segment_id": 4,
                "topic_title": "AI, ML, DL Landscape and AI Types",
                "extracted_concepts": [
                    "AI vs ML vs DL",
                    "Strong AI vs Weak AI",
                    "Narrow AI examples",
                    "General AI concept",
                ],
            },
        ],
    },
}


def get_demo_content(demo_id: str) -> dict[str, Any] | None:
    """Return full demo content by ID, or None if not found."""
    return DEMO_REGISTRY.get(demo_id)


def list_demo_content() -> list[dict[str, Any]]:
    """Return lightweight summaries for the choice page."""
    result = []
    for v in DEMO_REGISTRY.values():
        segments = v.get("extracted_segments", [])
        topics_preview = []
        for seg in segments:
            concepts = seg.get("extracted_concepts", [])
            topics_preview.append({
                "topic_title": seg.get("topic_title", "Untitled"),
                "point_count": len(concepts),
                "concepts": concepts,
            })
        result.append({
            "id": v["id"],
            "title": v["title"],
            "topic_count": len(segments),
            "total_points": sum(len(s.get("extracted_concepts", [])) for s in segments),
            "topics": topics_preview,
        })
    return result
