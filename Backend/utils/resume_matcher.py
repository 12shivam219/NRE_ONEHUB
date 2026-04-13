"""
Resume Matcher - Intelligent resume selection based on job description.
Uses technology matching and scoring to find the best resume.
"""

import logging
from typing import List, Dict, Tuple, Optional
from .resume_catalog import ResumeCatalog
from .gemini_points_generator import GeminiPointsGenerator

logger = logging.getLogger(__name__)


class ResumeMatcher:
    """Matches job descriptions to the best resume from catalog."""
    
    def __init__(self):
        """Initialize resume matcher with catalog and points generator."""
        self.catalog = ResumeCatalog()
        try:
            self.points_generator = GeminiPointsGenerator()
        except Exception as e:
            logger.warning(f"Could not initialize points generator: {e}")
            self.points_generator = None
    
    def extract_job_tech_stacks(self, job_description: str) -> Tuple[bool, List[str], str]:
        """
        Extract tech stacks from job description using Groq API.
        
        Returns:
            (success: bool, tech_stacks: List[str], message: str)
        """
        if not self.points_generator:
            return False, [], "Points generator not initialized"
        
        try:
            tech_stacks = self.points_generator.extract_tech_stacks(job_description)
            logger.info(f"Extracted {len(tech_stacks)} technologies from job description")
            return True, tech_stacks, f"✅ Extracted {len(tech_stacks)} technologies"
        except Exception as e:
            logger.error(f"Error extracting tech stacks: {e}")
            return False, [], f"❌ Error: {str(e)}"
    
    def calculate_match_score(self, job_techs: List[str], 
                             resume_techs: List[str]) -> float:
        """
        Calculate match score between job technologies and resume technologies.
        
        Scoring:
        - Exact matches: 100 points each
        - Partial matches (substring): 50 points each
        - No matches: 0 points
        
        Returns:
            Match score (0-100)
        """
        if not job_techs or not resume_techs:
            return 0.0
        
        job_techs_lower = [t.lower() for t in job_techs]
        resume_techs_lower = [t.lower() for t in resume_techs]
        
        exact_matches = 0
        partial_matches = 0
        
        # Check for exact matches
        for job_tech in job_techs_lower:
            for resume_tech in resume_techs_lower:
                if job_tech == resume_tech:
                    exact_matches += 1
                    break
        
        # Check for partial matches (if no exact match found)
        for job_tech in job_techs_lower:
            matched = False
            for resume_tech in resume_techs_lower:
                if job_tech == resume_tech:
                    matched = True
                    break
            
            if not matched:
                # Check partial match (e.g., "Node" matches "Node.js")
                for resume_tech in resume_techs_lower:
                    if job_tech in resume_tech or resume_tech in job_tech:
                        partial_matches += 1
                        break
        
        # Calculate score
        total_score = (exact_matches * 100) + (partial_matches * 50)
        max_score = len(job_techs) * 100
        
        match_percentage = (total_score / max_score) * 100 if max_score > 0 else 0
        
        logger.debug(f"Match score: {match_percentage:.1f}% "
                    f"(exact: {exact_matches}, partial: {partial_matches})")
        
        return min(match_percentage, 100.0)  # Cap at 100%
    
    def find_best_resume(self, job_description: str, 
                        job_title: str = "") -> Tuple[bool, Optional[Dict], str]:
        """
        Find the best matching resume for a job description.
        
        Returns:
            (success: bool, resume_data: Dict with match details, message: str)
        """
        # Step 1: Extract technologies from job description
        success, job_techs, extract_msg = self.extract_job_tech_stacks(job_description)
        
        if not success:
            return False, None, extract_msg
        
        if not job_techs:
            return False, None, "❌ No technologies found in job description"
        
        # Step 2: Get all resumes from catalog
        all_resumes = self.catalog.list_resumes()
        
        if not all_resumes:
            return False, None, "❌ No resumes in catalog. Please register resumes first."
        
        # Step 3: Score each resume
        scored_resumes = []
        
        for resume in all_resumes:
            resume_techs = resume.get('technologies', [])
            score = self.calculate_match_score(job_techs, resume_techs)
            
            scored_resumes.append({
                'resume': resume,
                'score': score,
                'job_techs': job_techs,
                'matching_techs': self._get_matching_techs(job_techs, resume_techs),
                'missing_techs': self._get_missing_techs(job_techs, resume_techs)
            })
        
        # Step 4: Sort by score (highest first)
        scored_resumes.sort(key=lambda x: x['score'], reverse=True)
        
        # Step 5: Return top resume with details
        if scored_resumes:
            best_match = scored_resumes[0]
            
            message = (
                f"✅ Best match found!\n"
                f"Resume: {best_match['resume']['name']}\n"
                f"Match Score: {best_match['score']:.1f}%\n"
                f"Person: {best_match['resume'].get('person_name', 'Unknown')}\n"
                f"Matching Technologies: {', '.join(best_match['matching_techs']) if best_match['matching_techs'] else 'None'}\n"
                f"Missing Technologies: {', '.join(best_match['missing_techs'][:3]) if best_match['missing_techs'] else 'None'}"
            )
            
            return True, best_match, message
        
        return False, None, "❌ Could not find matching resume"
    
    def get_alternative_resumes(self, job_description: str, 
                               top_n: int = 3) -> Tuple[bool, List[Dict], str]:
        """
        Get alternative resume options ranked by match score.
        
        Returns:
            (success: bool, alternatives: List[Dict], message: str)
        """
        # Step 1: Extract technologies
        success, job_techs, extract_msg = self.extract_job_tech_stacks(job_description)
        
        if not success:
            return False, [], extract_msg
        
        # Step 2: Get all resumes
        all_resumes = self.catalog.list_resumes()
        
        if not all_resumes:
            return False, [], "❌ No resumes in catalog"
        
        # Step 3: Score and sort
        scored_resumes = []
        
        for resume in all_resumes:
            resume_techs = resume.get('technologies', [])
            score = self.calculate_match_score(job_techs, resume_techs)
            
            scored_resumes.append({
                'resume': resume,
                'score': score,
                'matching_techs': self._get_matching_techs(job_techs, resume_techs)
            })
        
        scored_resumes.sort(key=lambda x: x['score'], reverse=True)
        
        # Return top N
        alternatives = scored_resumes[:top_n]
        message = f"✅ Found {len(alternatives)} alternative resumes"
        
        return True, alternatives, message
    
    def _get_matching_techs(self, job_techs: List[str], 
                           resume_techs: List[str]) -> List[str]:
        """Find matching technologies between job and resume."""
        job_lower = [t.lower() for t in job_techs]
        resume_lower = [t.lower() for t in resume_techs]
        
        matching = []
        for job_tech in job_lower:
            for i, resume_tech in enumerate(resume_lower):
                if job_tech == resume_tech or job_tech in resume_tech or resume_tech in job_tech:
                    matching.append(resume_techs[i])
                    break
        
        return list(set(matching))  # Remove duplicates
    
    def _get_missing_techs(self, job_techs: List[str], 
                          resume_techs: List[str]) -> List[str]:
        """Find technologies needed for job but not in resume."""
        job_lower = [t.lower() for t in job_techs]
        resume_lower = [t.lower() for t in resume_techs]
        
        missing = []
        for job_tech in job_lower:
            found = False
            for resume_tech in resume_lower:
                if job_tech == resume_tech or job_tech in resume_tech or resume_tech in job_tech:
                    found = True
                    break
            
            if not found:
                missing.append(job_tech)
        
        return missing
