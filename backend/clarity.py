# backend/clarity.py
"""
Phase 3: LLM-based clarity scoring.
Goal: Have an LLM subjectively assess if a segment is Clear, Unclear, or Off-topic
based on the spoken content, filler words, and pauses.
"""

import json
from openai import OpenAI

# Initialize OpenAI client
client = OpenAI()

def score_segment_with_llm(seg: dict) -> tuple[str, str]:
    """
    Use LLM to subjectively score a segment.
    Returns (label, reason).
    """
    text = seg.get("text", "")
    speech_rate = seg.get("speech_rate", 0)
    lexical_diversity = seg.get("lexical_diversity", 0)
    silence_ratio = seg.get("silence_ratio", 0)
    
    prompt = f"""You are analyzing a segment of lecture/presentation audio transcription.

    Text: "{text}"

    Metadata:
    - Speech rate: {speech_rate:.2f} words/second
    - Lexical diversity: {lexical_diversity:.2%} (unique words / total words)
    - Silence ratio: {silence_ratio:.2%} (silence / segment length)

    Subjectively assess this segment and categorize it as one of:
    1. "Clear" - well-structured, fluent, easy to understand
    2. "Unclear" - contains disfluencies, hesitation, or is hard to follow

    Respond in this exact format:
    LABEL: [one of the above labels]
    REASON: [brief subjective explanation of why]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert at assessing speech clarity and educational content quality."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=150
        )
        
        result = response.choices[0].message.content
        
        # Parse the response
        label = "Clear"  # default
        reason = result
        
        if "LABEL:" in result:
            lines = result.split("\n")
            for line in lines:
                if "LABEL:" in line:
                    label = line.split("LABEL:")[1].strip()
                elif "REASON:" in line:
                    reason = line.split("REASON:")[1].strip()
        
        return label, reason
    
    except Exception as e:
        # Fallback to basic heuristic if LLM fails
        return "Clear", f"LLM error: {str(e)}"


def label_segments(segments: list[dict]) -> list[dict]:
    """
    Apply LLM-based scoring to all segments.
    """
    labeled = []
    for seg in segments:
        label, reason = score_segment_with_llm(seg)
        seg_out = {
            **seg,
            "label": label,
            "reason": reason
        }
        labeled.append(seg_out)
    return labeled


if __name__ == "__main__":
    import argparse, os

    parser = argparse.ArgumentParser()
    parser.add_argument("--infile", required=True, help="Path to segments.json")
    parser.add_argument("--out", required=True, help="Path to lecture_result.json")
    args = parser.parse_args()

    with open(args.infile) as f:
        segments = json.load(f)

    results = label_segments(segments)

    lecture_result = {
        "lecture_id": "demo_lecture",
        "segments": results,
        "summary": {
            "counts": {
                "Clear": sum(1 for s in results if s["label"] == "Clear"),
                "Unclear": sum(1 for s in results if s["label"] == "Unclear"),
            }
        }
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(lecture_result, f, indent=2)

    print(f"✅ Scored {len(results)} segments → {args.out}")
