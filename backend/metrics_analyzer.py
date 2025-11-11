# backend/metrics_analyzer.py
"""
Comprehensive metrics analyzer for lecture transcripts.
Calculates various educational, linguistic, and speech quality metrics
that can be used to assess lecture quality and provide actionable feedback.
"""

import json
import re
import math
import statistics
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Any
import argparse
import os

class LectureMetricsAnalyzer:
    def __init__(self, transcript_data: List[Dict], segments_data: List[Dict] = None):
        self.transcript = transcript_data
        self.segments = segments_data or []
        self.full_text = self._get_full_text()
        self.words = self._get_words()
        self.total_duration = self._get_total_duration()
        
    def _get_full_text(self) -> str:
        """Extract full text from transcript."""
        return " ".join([item.get("text", "").strip() for item in self.transcript])
    
    def _get_words(self) -> List[str]:
        """Extract individual words from transcript."""
        words = []
        for item in self.transcript:
            text = item.get("text", "").strip()
            if text:
                # Clean and split text
                clean_text = re.sub(r'[^\w\s]', '', text.lower())
                words.extend(clean_text.split())
        return [w for w in words if w]
    
    def _get_total_duration(self) -> float:
        """Calculate total duration of the lecture."""
        if not self.transcript:
            return 0.0
        return max(item.get("end", 0) for item in self.transcript)
    
    def calculate_speech_metrics(self) -> Dict[str, Any]:
        """Calculate speech-related metrics."""
        if not self.transcript or self.total_duration == 0:
            return {}
            
        total_words = len(self.words)
        total_speech_time = sum(
            item.get("end", 0) - item.get("start", 0) 
            for item in self.transcript 
            if item.get("text", "").strip()
        )
        
        # Calculate pauses (gaps between speech segments)
        pauses = []
        for i in range(len(self.transcript) - 1):
            current_end = self.transcript[i].get("end", 0)
            next_start = self.transcript[i + 1].get("start", 0)
            pause_duration = next_start - current_end
            if pause_duration > 0.1:  # Consider pauses > 100ms
                pauses.append(pause_duration)
        
        return {
            "words_per_minute": (total_words / self.total_duration) * 60 if self.total_duration > 0 else 0,
            "speech_rate_wps": total_words / total_speech_time if total_speech_time > 0 else 0,
            "total_speech_time": total_speech_time,
            "silence_time": self.total_duration - total_speech_time,
            "silence_ratio": (self.total_duration - total_speech_time) / self.total_duration if self.total_duration > 0 else 0,
            "average_pause_duration": statistics.mean(pauses) if pauses else 0,
            "pause_count": len(pauses),
            "long_pause_count": len([p for p in pauses if p > 2.0]),  # Pauses > 2 seconds
        }
    
    def calculate_fluency_metrics(self) -> Dict[str, Any]:
        """Calculate fluency and disfluency metrics."""
        filler_words = {
            'um', 'uh', 'ah', 'er', 'hmm', 'like', 'you know', 'basically', 
            'actually', 'sort of', 'kind of', 'i mean', 'well', 'so'
        }
        
        # Count filler words
        filler_count = 0
        text_lower = self.full_text.lower()
        for filler in filler_words:
            filler_count += len(re.findall(rf'\b{re.escape(filler)}\b', text_lower))
        
        # Detect repetitions (simple pattern: word repeated 2+ times)
        repetitions = len(re.findall(r'\b(\w+)\s+\1\b', text_lower))
        
        # False starts (incomplete words/sentences - approximated by very short segments)
        false_starts = sum(1 for item in self.transcript 
                          if len(item.get("text", "").strip().split()) == 1 
                          and item.get("end", 0) - item.get("start", 0) < 0.5)
        
        total_words = len(self.words)
        
        return {
            "filler_word_count": filler_count,
            "filler_word_rate": filler_count / total_words if total_words > 0 else 0,
            "repetition_count": repetitions,
            "false_start_count": false_starts,
            "fluency_score": max(0, 1 - (filler_count + repetitions + false_starts) / total_words) if total_words > 0 else 0
        }
    
    def calculate_linguistic_metrics(self) -> Dict[str, Any]:
        """Calculate linguistic complexity and diversity metrics."""
        if not self.words:
            return {}
            
        # Lexical diversity
        unique_words = set(self.words)
        lexical_diversity = len(unique_words) / len(self.words) if self.words else 0
        
        # Sentence-level analysis
        sentences = re.split(r'[.!?]+', self.full_text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        # Average sentence length
        sentence_lengths = [len(s.split()) for s in sentences]
        avg_sentence_length = statistics.mean(sentence_lengths) if sentence_lengths else 0
        
        # Vocabulary sophistication (approximate with average word length)
        avg_word_length = statistics.mean([len(word) for word in self.words]) if self.words else 0
        
        # Most frequent words (excluding common stop words)
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'}
        content_words = [word for word in self.words if word.lower() not in stop_words]
        word_freq = Counter(content_words)
        
        return {
            "total_words": len(self.words),
            "unique_words": len(unique_words),
            "lexical_diversity": lexical_diversity,
            "sentence_count": len(sentences),
            "avg_sentence_length": avg_sentence_length,
            "avg_word_length": avg_word_length,
            "most_frequent_words": dict(word_freq.most_common(10)),
            "vocabulary_richness": len(unique_words) / math.sqrt(len(self.words)) if self.words else 0  # Type-Token Ratio variation
        }
    
    def calculate_confidence_metrics(self) -> Dict[str, Any]:
        """Calculate ASR confidence-based metrics."""
        confidences = [item.get("conf", 0) for item in self.transcript if "conf" in item]
        
        if not confidences:
            return {"average_confidence": 0, "low_confidence_segments": 0}
        
        low_conf_threshold = 0.7
        low_conf_segments = len([c for c in confidences if c < low_conf_threshold])
        
        return {
            "average_confidence": statistics.mean(confidences),
            "min_confidence": min(confidences),
            "max_confidence": max(confidences),
            "confidence_std": statistics.stdev(confidences) if len(confidences) > 1 else 0,
            "low_confidence_segments": low_conf_segments,
            "low_confidence_ratio": low_conf_segments / len(confidences)
        }
    
    def detect_topic_transitions(self) -> List[Dict[str, Any]]:
        """Detect potential topic transitions based on pauses and lexical shifts."""
        transitions = []
        
        if len(self.segments) < 2:
            return transitions
            
        for i in range(len(self.segments) - 1):
            current_seg = self.segments[i]
            next_seg = self.segments[i + 1]
            
            # Time gap between segments
            time_gap = next_seg.get("start", 0) - current_seg.get("end", 0)
            
            # Lexical similarity (simple word overlap)
            current_words = set(current_seg.get("text", "").lower().split())
            next_words = set(next_seg.get("text", "").lower().split())
            
            if current_words and next_words:
                overlap = len(current_words.intersection(next_words))
                similarity = overlap / min(len(current_words), len(next_words))
            else:
                similarity = 0
            
            # Potential transition if large time gap or low similarity
            if time_gap > 3.0 or similarity < 0.3:
                transitions.append({
                    "timestamp": current_seg.get("end", 0),
                    "time_gap": time_gap,
                    "lexical_similarity": similarity,
                    "transition_strength": max(time_gap / 5.0, (1 - similarity)),
                    "context_before": current_seg.get("text", "")[-100:],
                    "context_after": next_seg.get("text", "")[:100]
                })
        
        return sorted(transitions, key=lambda x: x["transition_strength"], reverse=True)
    
    def analyze_engagement_patterns(self) -> Dict[str, Any]:
        """Analyze patterns that might indicate audience engagement."""
        # Look for questions, interaction cues, examples
        question_patterns = [
            r'\?', r'\bquestion\b', r'\bask\b', r'\banswer\b',
            r'\bwonder\b', r'\bthink about\b'
        ]
        
        example_patterns = [
            r'\bfor example\b', r'\bfor instance\b', r'\blike\b',
            r'\bimagine\b', r'\bsay\b', r'\bsuppose\b'
        ]
        
        interaction_patterns = [
            r'\byou\b', r'\byour\b', r'\bus\b', r'\bwe\b',
            r'\beveryone\b', r'\bclass\b'
        ]
        
        text_lower = self.full_text.lower()
        
        question_count = sum(len(re.findall(pattern, text_lower)) for pattern in question_patterns)
        example_count = sum(len(re.findall(pattern, text_lower)) for pattern in example_patterns)
        interaction_count = sum(len(re.findall(pattern, text_lower)) for pattern in interaction_patterns)
        
        return {
            "question_indicators": question_count,
            "example_count": example_count,
            "interaction_cues": interaction_count,
            "engagement_score": (question_count + example_count + interaction_count) / len(self.words) if self.words else 0
        }
    
    def calculate_pacing_analysis(self) -> Dict[str, Any]:
        """Analyze pacing throughout the lecture."""
        if len(self.segments) < 3:
            return {}
            
        segment_rates = []
        for seg in self.segments:
            word_count = len(seg.get("text", "").split())
            duration = seg.get("end", 0) - seg.get("start", 0)
            if duration > 0:
                rate = word_count / duration
                segment_rates.append({
                    "timestamp": seg.get("start", 0),
                    "rate": rate,
                    "duration": duration
                })
        
        if not segment_rates:
            return {}
            
        rates = [sr["rate"] for sr in segment_rates]
        
        # Detect pacing changes
        pacing_changes = []
        for i in range(1, len(rates)):
            rate_change = abs(rates[i] - rates[i-1]) / rates[i-1] if rates[i-1] > 0 else 0
            if rate_change > 0.3:  # 30% change threshold
                pacing_changes.append({
                    "timestamp": segment_rates[i]["timestamp"],
                    "change_magnitude": rate_change,
                    "new_rate": rates[i],
                    "previous_rate": rates[i-1]
                })
        
        return {
            "average_rate": statistics.mean(rates),
            "rate_std": statistics.stdev(rates) if len(rates) > 1 else 0,
            "min_rate": min(rates),
            "max_rate": max(rates),
            "pacing_consistency": 1 - (statistics.stdev(rates) / statistics.mean(rates)) if rates and statistics.mean(rates) > 0 else 0,
            "significant_pace_changes": len(pacing_changes),
            "pace_changes": pacing_changes[:5]  # Top 5 most significant changes
        }
    
    def generate_comprehensive_report(self) -> Dict[str, Any]:
        """Generate a comprehensive metrics report."""
        return {
            "lecture_overview": {
                "total_duration_minutes": self.total_duration / 60,
                "total_words": len(self.words),
                "segment_count": len(self.segments)
            },
            "speech_metrics": self.calculate_speech_metrics(),
            "fluency_metrics": self.calculate_fluency_metrics(),
            "linguistic_metrics": self.calculate_linguistic_metrics(),
            "confidence_metrics": self.calculate_confidence_metrics(),
            "engagement_analysis": self.analyze_engagement_patterns(),
            "pacing_analysis": self.calculate_pacing_analysis(),
            "topic_transitions": self.detect_topic_transitions()[:3],  # Top 3 transitions
        }
    
    def get_actionable_insights(self) -> List[Dict[str, str]]:
        """Generate actionable insights based on the metrics."""
        insights = []
        metrics = self.generate_comprehensive_report()
        
        # Speech rate insights
        wpm = metrics["speech_metrics"].get("words_per_minute", 0)
        if wpm < 120:
            insights.append({
                "category": "Pacing",
                "severity": "medium",
                "insight": f"Speech rate is {wpm:.0f} WPM, which may be too slow. Consider increasing pace for better engagement.",
                "suggestion": "Aim for 150-180 words per minute for optimal comprehension."
            })
        elif wpm > 200:
            insights.append({
                "category": "Pacing", 
                "severity": "high",
                "insight": f"Speech rate is {wpm:.0f} WPM, which may be too fast for students to follow.",
                "suggestion": "Slow down to 150-180 WPM and add more pauses for emphasis."
            })
        
        # Fluency insights
        fluency_score = metrics["fluency_metrics"].get("fluency_score", 1)
        if fluency_score < 0.85:
            insights.append({
                "category": "Fluency",
                "severity": "medium",
                "insight": f"Fluency score is {fluency_score:.2f}. High use of filler words detected.",
                "suggestion": "Practice reducing filler words like 'um', 'uh', and 'like' to improve clarity."
            })
        
        # Engagement insights
        engagement_score = metrics["engagement_analysis"].get("engagement_score", 0)
        if engagement_score < 0.02:
            insights.append({
                "category": "Engagement",
                "severity": "high", 
                "insight": "Low engagement indicators detected. Few questions or interactive elements.",
                "suggestion": "Add more examples, questions, and direct audience references to increase engagement."
            })
        
        # Confidence insights
        avg_confidence = metrics["confidence_metrics"].get("average_confidence", 1)
        if avg_confidence < 0.8:
            insights.append({
                "category": "Audio Quality",
                "severity": "medium",
                "insight": f"Average ASR confidence is {avg_confidence:.2f}, indicating potential audio quality issues.",
                "suggestion": "Check microphone quality and reduce background noise for clearer audio."
            })
        
        # Pacing consistency
        pacing_consistency = metrics["pacing_analysis"].get("pacing_consistency", 1)
        if pacing_consistency < 0.7:
            insights.append({
                "category": "Pacing",
                "severity": "low",
                "insight": f"Pacing consistency is {pacing_consistency:.2f}. Variable speech rate detected.",
                "suggestion": "Work on maintaining more consistent pacing throughout the lecture."
            })
        
        return insights


def main():
    parser = argparse.ArgumentParser(description="Analyze lecture transcript metrics")
    parser.add_argument("--transcript", required=True, help="Path to transcript.json")
    parser.add_argument("--segments", help="Path to segments.json (optional)")
    parser.add_argument("--output", required=True, help="Path to output metrics file")
    parser.add_argument("--format", choices=["json", "summary"], default="json", help="Output format")
    
    args = parser.parse_args()
    
    # Load transcript data
    with open(args.transcript, 'r') as f:
        transcript_data = json.load(f)
    
    # Load segments data if provided
    segments_data = []
    if args.segments and os.path.exists(args.segments):
        with open(args.segments, 'r') as f:
            segments_data = json.load(f)
    
    # Analyze metrics
    analyzer = LectureMetricsAnalyzer(transcript_data, segments_data)
    
    if args.format == "json":
        # Generate comprehensive report
        report = analyzer.generate_comprehensive_report()
        insights = analyzer.get_actionable_insights()
        
        output = {
            "metrics": report,
            "insights": insights,
            "metadata": {
                "analysis_timestamp": "2025-11-02",
                "transcript_file": args.transcript,
                "segments_file": args.segments
            }
        }
        
        # Save to file
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, 'w') as f:
            json.dump(output, f, indent=2)
            
        print(f"✅ Comprehensive metrics analysis saved to {args.output}")
        print(f"📊 Generated {len(insights)} actionable insights")
        
    else:  # summary format
        report = analyzer.generate_comprehensive_report()
        insights = analyzer.get_actionable_insights()
        
        print("\n📈 LECTURE METRICS SUMMARY")
        print("=" * 50)
        print(f"Duration: {report['lecture_overview']['total_duration_minutes']:.1f} minutes")
        print(f"Words: {report['lecture_overview']['total_words']}")
        print(f"Speech Rate: {report['speech_metrics']['words_per_minute']:.0f} WPM")
        print(f"Fluency Score: {report['fluency_metrics']['fluency_score']:.2f}")
        print(f"Engagement Score: {report['engagement_analysis']['engagement_score']:.3f}")
        
        print(f"\n💡 TOP INSIGHTS ({len(insights)})")
        print("-" * 30)
        for i, insight in enumerate(insights[:3], 1):
            print(f"{i}. [{insight['category']}] {insight['insight']}")
            print(f"   💡 {insight['suggestion']}\n")


if __name__ == "__main__":
    main()