import re

class TextProcessor:
    def __init__(self):
        # More flexible patterns to handle various formats
        # Bullet pattern: matches •, -, *, +, numbered lists like "1.", or (a), etc.
        # Using negative lookahead to exclude lines that start with "--" or "---" (headers)
        self.bullet_pattern = r'(?:•|(?<!\-)[\-](?!\-)|\*|\+|\d+\.|\([a-z0-9]\))\s*(.*)'
        # Headings: short lines (< 50 chars), no bullets, typically 1-5 words
        self.heading_pattern = r'^(?!(?:•|[\-]|\*|\+|\d+\.|\([a-z0-9]\)))[A-Za-z0-9][A-Za-z0-9\s\.\-]*$'

    def is_heading(self, line):
        """Check if a line is a heading.
        
        A heading is:
        - Starts with letter/number (not a bullet)
        - Is relatively short (< 50 characters)
        - Has 1-4 words (short phrases)
        - Doesn't start with action verbs (developed, implemented, built, etc.)
        """
        line = line.strip()
        if not line:
            return False
        
        # Don't match lines starting with bullets
        if re.match(r'^(?:•|\-|\*|\+|\d+\.|\([a-z0-9]\))', line):
            return False
        
        # Headings should be relatively short
        if len(line) > 50:
            return False
        
        # Headings typically have few words (up to 6 words max for reasonable heading length)
        word_count = len(line.split())
        if word_count > 6:
            return False
        
        # Don't treat action/past-participle starting sentences as headings
        action_verbs = ['developed', 'implementing', 'implemented', 'built', 'building', 
                        'created', 'designing', 'designed', 'integrated', 'integrating',
                        'leveraged', 'collaborating', 'collaborated', 'enhanced', 'enhancing',
                        'optimized', 'optimizing', 'defined', 'defining', 'deployed', 'deploying',
                        'managing', 'utilized', 'utilizing', 'established', 'establishing',
                        'managed', 'developing', 'creating', 'leading', 'led', 'driving']
        first_word = line.lower().split()[0]
        # Remove punctuation from first word for comparison
        first_word_clean = first_word.rstrip('.,;:!?')
        if first_word_clean in action_verbs:
            return False
        
        # Headings typically start with a capital letter or alphanumeric
        if not re.match(r'^[A-Za-z0-9]', line):
            return False
        
        return True

    def is_bullet_point(self, line):
        """Check if a line is a bullet point."""
        line = line.strip()
        return bool(re.match(self.bullet_pattern, line))

    def extract_bullet_point(self, line):
        """Extract the content of a bullet point."""
        match = re.match(self.bullet_pattern, line.strip())
        if match:
            return match.group(1)
        return None

    def has_bullet_symbol(self, line):
        """Check if a line already has a bullet symbol."""
        stripped = line.strip()
        return bool(re.match(r'^(?:•|\-|\*|\+|\d+\.|\([a-z0-9]\))', stripped))
    
    def add_bullet_if_missing(self, line):
        """Add a bullet symbol if the line doesn't have one."""
        stripped = line.strip()
        # If it already has a bullet, return as is
        if self.has_bullet_symbol(line):
            return line
        # If it's a bullet-less point, add one
        if stripped and not self.is_heading(stripped):
            # Preserve original indentation and add bullet
            indent = len(line) - len(line.lstrip())
            return ' ' * indent + '• ' + stripped
        return line

    def process_text(self, text, points_per_cycle):
        """Process the input text and extract points in cycles."""
        if not text or not text.strip():
            raise ValueError("Input text cannot be empty")

        if not isinstance(points_per_cycle, int) or points_per_cycle < 1:
            raise ValueError("Points per cycle must be a positive integer")

        # Split text into lines but preserve original content for bullets
        lines = text.split('\n')
        # Don't remove blank lines - they're structural! Just filter completely empty after stripping
        lines = [line for line in lines if line.strip() or line == '']
        
        if not lines:
            raise ValueError("No valid text content found after splitting")
            
        # Ensure we have at least one heading by setting a default if none is found
        has_heading = any(self.is_heading(line.strip()) for line in lines)
        if not has_heading:
            pass  # Will treat first line as heading below
            
        current_heading = None
        structured_content = {}

        # First pass: organize content
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            # Skip lines that are only underscores
            if line_stripped.replace('_', '').strip() == '':
                continue
            
            # If no heading is found and this is the first line, treat it as a heading
            if current_heading is None and i == 0 and not has_heading:
                current_heading = line_stripped
                structured_content[current_heading] = []
            elif self.is_heading(line_stripped):
                current_heading = line_stripped
                structured_content[current_heading] = []
            elif current_heading is not None:
                # Any line after a heading that is not itself a heading is a point
                # (whether it has a bullet symbol or not)
                if line_stripped:  # Only add non-empty lines
                    structured_content[current_heading].append(line)

        if not structured_content:
            raise ValueError("""No valid headings or bullet points found in the input text. 
            
Format example:
Heading 1
• Point 1
• Point 2

Heading 2
• Item A
• Item B""")
            
        # Second pass: extract points in cycles
        result = []
        
        # Get the maximum number of points across all headings
        max_points = max(len(points) for points in structured_content.values()) if structured_content else 0
        
        if max_points == 0:
            raise ValueError("""No points found under any headings. Please check your input format.
            
Correct format example:
Heading 1
• Point 1
• Point 2

Heading 2
• Item A
• Item B
            
You can use •, -, *, +, or numbers (1. 2.) for bullet points.""")
            
        current_cycle = 0

        while current_cycle * points_per_cycle < max_points:
            start_idx = current_cycle * points_per_cycle
            end_idx = start_idx + points_per_cycle

            cycle_content = [f"Cycle {current_cycle + 1}:"]
            
            # Organize points by heading within each cycle
            for heading, points in structured_content.items():
                heading_points = points[start_idx:min(end_idx, len(points))]
                if heading_points:  # Only add points for this cycle
                    for point in heading_points:
                        # Extract point without bullet
                        extracted = self.extract_bullet_point(point)
                        if extracted:
                            cycle_content.append(extracted)
                        else:
                            cycle_content.append(point.strip())

            result.extend(cycle_content)
            current_cycle += 1

        if not result:
            raise ValueError("Failed to generate output. Please check your input format.")

        final_text = "\n".join(result)
        return final_text