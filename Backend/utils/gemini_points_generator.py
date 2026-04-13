"""
Groq API integration for automatic point generation from job descriptions
Groq provides free, fast API with generous limits
"""

from groq import Groq
import re
import os
from typing import List, Dict, Tuple
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Load environment variables from .env
load_dotenv()


class GeminiPointsGenerator:
    """Generate resume points from job descriptions using Groq API (free)"""
    
    def __init__(self, api_key: str = None):
        """
        Initialize Groq API
        
        Args:
            api_key: Groq API key (if not provided, loads from .env)
        """
        try:
            # Use provided key or load from environment
            if api_key is None:
                api_key = os.getenv("GROQ_API_KEY")
            
            if not api_key:
                raise ValueError("Groq API key not found. Please set GROQ_API_KEY in .env file")
            
            # Initialize Groq client
            self.client = Groq(api_key=api_key)
            # Use llama-3.3-70b-versatile (latest, fast, capable)
            self.model = "llama-3.3-70b-versatile"
        except Exception as e:
            logger.error(f"Failed to initialize Groq: {str(e)}")
            raise ValueError("Invalid Groq API key or initialization failed")
    
    def extract_tech_stacks(self, job_description: str) -> List[str]:
        """
        Extract tech stacks from job description using Groq
        
        Args:
            job_description: The job description text
            
        Returns:
            List of extracted tech stack names
        """
        if not job_description or not job_description.strip():
            raise ValueError("Job description cannot be empty")
        
        try:
            prompt = f"""Extract all technologies, programming languages, frameworks, tools, and platforms mentioned in this job description.

Return ONLY a comma-separated list of technologies (no explanations, no numbering, no bullets).

Job Description:
{job_description}

Return format example: Node.js, React, MongoDB, Python, Docker, AWS"""

            message = self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                temperature=0.3,
                max_tokens=500
            )
            
            response_text = message.choices[0].message.content
            
            if not response_text:
                raise ValueError("No tech stacks found in response")
            
            # Parse the response to get tech stacks
            tech_stacks = [tech.strip() for tech in response_text.split(',')]
            tech_stacks = [tech for tech in tech_stacks if tech]  # Remove empty strings
            
            if not tech_stacks:
                raise ValueError("No technologies could be extracted from the job description")
            
            return tech_stacks
            
        except Exception as e:
            logger.error(f"Error extracting tech stacks: {str(e)}")
            raise
    
    def generate_points(
        self, 
        job_description: str,
        job_title: str,
        tech_stacks: List[str],
        num_points: int
    ) -> str:
        """
        Generate resume bullet points using Groq
        
        Args:
            job_description: The job description (for context)
            job_title: The job title to highlight
            tech_stacks: List of technologies to mention
            num_points: Number of points per technology
            
        Returns:
            Formatted bullet points
        """
        if not job_title or not job_title.strip():
            raise ValueError("Job title cannot be empty")
        
        if not tech_stacks:
            raise ValueError("No tech stacks provided")
        
        if num_points < 1:
            raise ValueError("Number of points must be at least 1")
        
        try:
            # Format tech stacks list
            tech_stacks_str = ", ".join(tech_stacks)
            
            # Use a specific prompt for the exact format the user wants
            prompt = f"""Generate {num_points} detailed, specific, and professional bullet points for my resume highlighting my experience as a {job_title}.

CRITICAL: You MUST generate points for ALL {len(tech_stacks)} technologies listed below. Do not skip any technology.

Format EXACTLY as shown:

TechName1
- Bullet point 1
- Bullet point 2
- Bullet point 3

TechName2
- Bullet point 1
- Bullet point 2
- Bullet point 3

RULES:
1. Each technology name must be on its own line (just the name, no symbols)
2. Each bullet point must start with a dash and space (- )
3. Each bullet point should be 1-2 sentences, specific and detailed
4. Mention the technology name in each bullet point when relevant
5. Include specific frameworks, versions, or related technologies
6. Focus on achievements, implementations, and business impact
7. Use professional language appropriate for {job_title} role
8. Each tech stack MUST have exactly {num_points} bullet points
9. GENERATE POINTS FOR ALL TECHNOLOGIES - DO NOT SKIP ANY

Technologies to cover ({len(tech_stacks)} total):
{tech_stacks_str}

Job description context:
{job_description}

Generate complete resume bullet points for ALL {len(tech_stacks)} technologies:"""

            message = self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                temperature=0.7,
                max_tokens=8000
            )
            
            response_text = message.choices[0].message.content
            
            if not response_text:
                raise ValueError("No content generated from Groq")
            
            return response_text.strip()
            
        except Exception as e:
            logger.error(f"Error generating points: {str(e)}")
            raise
    
    def process_job_description(
        self,
        job_description: str,
        job_title: str,
        num_points: int
    ) -> Tuple[List[str], str]:
        """
        Complete pipeline: Extract tech stacks and generate points
        
        Args:
            job_description: The job description
            job_title: The job title
            num_points: Number of points per technology
            
        Returns:
            Tuple of (tech_stacks list, generated points text)
        """
        if not job_description or not job_description.strip():
            raise ValueError("Job description cannot be empty")
        
        if not job_title or not job_title.strip():
            raise ValueError("Job title cannot be empty")
        
        try:
            # Step 1: Extract tech stacks
            tech_stacks = self.extract_tech_stacks(job_description)
            
            # Step 2: Generate points
            points = self.generate_points(
                job_description,
                job_title,
                tech_stacks,
                num_points
            )
            
            return tech_stacks, points
            
        except Exception as e:
            logger.error(f"Error in processing pipeline: {str(e)}")
            raise


class PointsValidator:
    """Validate and format generated points"""
    
    @staticmethod
    def validate_points(points: str) -> Tuple[bool, str]:
        """
        Validate generated points
        
        Args:
            points: The generated points text
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not points or not points.strip():
            return False, "Generated points are empty"
        
        # Check for minimum length
        if len(points) < 50:
            return False, "Generated points seem too short"
        
        return True, ""
    
    @staticmethod
    def format_points_for_display(points: str) -> str:
        """
        Format points for better display
        
        Args:
            points: Raw generated points
            
        Returns:
            Formatted points
        """
        return points.strip()
    
    @staticmethod
    def extract_bullet_points(points: str) -> List[str]:
        """
        Extract individual bullet points from generated text
        
        Args:
            points: Generated points text
            
        Returns:
            List of individual bullet points
        """
        lines = points.split('\n')
        bullet_points = []
        
        for line in lines:
            line = line.strip()
            # Match bullet points (•, -, *, etc.)
            if line and (
                line.startswith('•') or 
                line.startswith('-') or 
                line.startswith('*') or
                line.startswith('◦') or
                re.match(r'^\d+\.\s', line)
            ):
                bullet_points.append(line)
        
        return bullet_points if bullet_points else lines
