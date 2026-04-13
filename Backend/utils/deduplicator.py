"""
Point deduplication and cleanup utilities.
Provides options to remove duplicate points and clean formatting.
"""

from typing import List, Set
import re


class PointDeduplicator:
    """Handles deduplication and cleanup of extracted points."""
    
    @staticmethod
    def deduplicate_points(points: List[str], similarity_threshold: float = 0.95) -> List[str]:
        """
        Remove duplicate or near-duplicate points (95% similarity required).
        Only removes points that are virtually identical, not just similar.
        
        Args:
            points: List of point strings
            similarity_threshold: How similar (0-1) points must be to be considered duplicates (default 0.95 = 95%)
            
        Returns:
            List of deduplicated points
        """
        if not points:
            return points
        
        unique_points = []
        seen_normalized = set()
        
        for point in points:
            normalized = PointDeduplicator._normalize_point(point)
            
            # Check if this point is similar to any seen point
            is_duplicate = False
            for seen in seen_normalized:
                similarity = PointDeduplicator._calculate_similarity(normalized, seen)
                if similarity >= similarity_threshold:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                unique_points.append(point)
                seen_normalized.add(normalized)
        
        return unique_points
    
    @staticmethod
    def deduplicate_points_exact(points: List[str]) -> List[str]:
        """
        Remove exact duplicate points (case-insensitive).
        
        Args:
            points: List of point strings
            
        Returns:
            List of deduplicated points
        """
        seen = set()
        unique_points = []
        
        for point in points:
            normalized = point.strip().lower()
            if normalized not in seen:
                seen.add(normalized)
                unique_points.append(point)
        
        return unique_points
    
    @staticmethod
    def _normalize_point(text: str) -> str:
        """Normalize point for comparison."""
        # Convert to lowercase
        text = text.lower().strip()
        # Remove common prefixes (bullets, numbers)
        text = re.sub(r'^[•\-*+\d]+[\.\)]\s*', '', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        return text
    
    @staticmethod
    def _calculate_similarity(str1: str, str2: str) -> float:
        """
        Calculate string similarity using sequence matching.
        Returns value 0-1 where 1 is identical.
        Uses token overlap, word length, and position awareness.
        """
        if not str1 or not str2:
            return 0.0
        
        # If strings are identical (normalized), return 1.0
        if str1 == str2:
            return 1.0
        
        # Tokenize into words
        words1 = str1.split()
        words2 = str2.split()
        
        if not words1 or not words2:
            return 0.0
        
        # Count matching words (treating as bag of words for robustness)
        common_words = sum(1 for word in words1 if word in words2)
        max_len = max(len(words1), len(words2))
        
        # Jaccard similarity: intersection / union
        word_set1 = set(words1)
        word_set2 = set(words2)
        intersection = len(word_set1 & word_set2)
        union = len(word_set1 | word_set2)
        jaccard = intersection / union if union > 0 else 0.0
        
        # Weighted average: 70% Jaccard, 30% positional awareness
        positional_sim = common_words / max_len
        similarity = (0.7 * jaccard) + (0.3 * positional_sim)
        
        return min(similarity, 1.0)
    
    @staticmethod
    def remove_common_prefixes(points: List[str]) -> List[str]:
        """Remove common prefixes from all points."""
        if not points:
            return points
        
        cleaned = []
        for point in points:
            # Remove leading bullets and whitespace
            cleaned_point = re.sub(r'^[•\-*+\d]+[\.\)]\s*', '', point.strip())
            cleaned.append(cleaned_point)
        
        return cleaned
    
    @staticmethod
    def stats_before_after(original: List[str], deduplicated: List[str]) -> dict:
        """Get statistics about deduplication."""
        return {
            'original_count': len(original),
            'deduplicated_count': len(deduplicated),
            'removed_count': len(original) - len(deduplicated),
            'removal_percentage': round((len(original) - len(deduplicated)) / len(original) * 100, 1) if original else 0
        }
