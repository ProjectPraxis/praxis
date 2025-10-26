# This file is used to turn an audio file into timestamped text chunks. 

# input: audio file

# output: transcript.json:
# array of {start: float, end: float, text: string, confidence: float}


# backend/asr.py
from faster_whisper import WhisperModel
import json, argparse

def transcribe(audio_path: str, out_path: str):
    model = WhisperModel("large-v2")   # change to "base" for speed
    segments, info = model.transcribe(audio_path, beam_size=5)
    
    results = []
    for seg in segments:
        results.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip(),
            "conf": float(seg.avg_logprob) if seg.avg_logprob else None
        })

    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    transcribe(args.audio, args.out)


