# This file is used to turn an audio file into timestamped text chunks. 

# input: audio file

# output: transcript.json:
# array of words: {start: float, end: float, text: string, confidence: float}


# backend/asr.py
from faster_whisper import WhisperModel
import json, argparse

def transcribe(audio_path: str, out_path: str):
    model = WhisperModel("base")   # Using "base" for speed; "small"/"medium" for better fillers
    segments, info = model.transcribe(
        audio_path, 
        beam_size=5,
        language="en",         # Force English language detection
        word_timestamps=True,  # Enable word-level timestamps for finer control
        vad_filter=True,       # Voice Activity Detection - helps identify silence
        suppress_blank=False, # Don't suppress blank tokens - helps with fillers
        vad_parameters=dict(
            min_silence_duration_ms=500,  # Minimum silence duration to consider a pause
            speech_pad_ms=200             # Padding around speech segments
        )
    )
    
    results = []
    for seg in segments:
        if hasattr(seg, 'words') and seg.words:
            for word in seg.words:
                results.append({
                    "start": float(word.start),
                    "end": float(word.end),
                    "text": word.word,
                    "conf": float(word.probability)
                })

    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    transcribe(args.audio, args.out)


