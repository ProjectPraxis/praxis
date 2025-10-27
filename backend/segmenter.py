# backend/segmenter.py

# This file is used to segment the transcript into chunks and store metadata about the segments.

# input: transcript.json

# output: segments.json:
# array of {start: float, end: float, text: string, speech_rate: float, lexical_diversity: float, silence_ratio: float, asr_confidence: float}


# backend/segmenter.py
import json, re, math, numpy as np

def compute_lexical_diversity(text: str) -> float:
    """Compute ratio of unique words to total words (diversity)."""
    words = re.findall(r"\b\w+\b", text.lower())
    if not words:
        return 0.0
    unique_words = len(set(words))
    return unique_words / len(words)

def segment(transcript, max_len=60.0, pause_thresh=2.0):
    """
    Merge word chunks until reaching ~max_len seconds OR a pause > pause_thresh seconds.
    """
    segments = []
    if not transcript:
        return segments

    # Sort just in case
    transcript = sorted(transcript, key=lambda x: x["start"])
    current = []
    for i, word in enumerate(transcript):
        if not current:
            current.append(word)
            continue

        # Calculate gap from previous word
        prev = current[-1]
        gap = word["start"] - prev["end"]
        duration = word["end"] - current[0]["start"]

        # If we exceed time limit or pause threshold → start new segment
        if duration >= max_len or gap >= pause_thresh:
            segments.append(make_segment(current))
            current = [word]
        else:
            current.append(word)

    # Last segment
    if current:
        segments.append(make_segment(current))

    return segments

def make_segment(words):
    """Aggregate one segment and compute metadata."""
    text = " ".join(w["text"] for w in words)
    
    # Calculate segment duration and word count
    segment_duration = float(words[-1]["end"] - words[0]["start"])
    word_count = len(words)
    
    # Calculate total silence time
    total_silence = 0.0
    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i-1]["end"]
        if gap > 0:
            total_silence += gap
    
    # Compute new metrics
    speech_rate = word_count / segment_duration if segment_duration > 0 else 0.0
    lexical_diversity = compute_lexical_diversity(text)
    silence_ratio = total_silence / segment_duration if segment_duration > 0 else 0.0
    asr_conf = float(np.mean([w.get("conf", 0.0) for w in words]))
    
    return {
        "start": float(words[0]["start"]),
        "end": float(words[-1]["end"]),
        "text": text.strip(),
        "speech_rate": speech_rate,           # words per second
        "lexical_diversity": lexical_diversity,  # unique words / total words
        "silence_ratio": silence_ratio,          # total silence / segment length
        "asr_confidence": asr_conf
    }

if __name__ == "__main__":
    import argparse, os
    parser = argparse.ArgumentParser()
    parser.add_argument("--infile", required=True, help="Path to transcript.json")
    parser.add_argument("--out", required=True, help="Path to output segments.json")
    args = parser.parse_args()

    with open(args.infile) as f:
        transcript = json.load(f)

    segs = segment(transcript)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(segs, f, indent=2)

    print(f"✅ Created {len(segs)} segments and saved to {args.out}")

