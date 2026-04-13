"""
Input validation and error handling utilities.
Provides comprehensive validation for user inputs across all tabs.
"""

import re
from typing import Tuple, Optional


class InputValidator:
    """Validates user inputs and provides helpful error messages."""
    
    @staticmethod
    def validate_text_input(text: str, min_chars: int = 10) -> Tuple[bool, Optional[str]]:
        """
        Validate user text input.
        
        Args:
            text: Input text to validate
            min_chars: Minimum character requirement
            
        Returns:
            (is_valid, error_message)
        """
        if not text or not text.strip():
            return False, "❌ Text input cannot be empty. Please enter some text."
        
        if len(text.strip()) < min_chars:
            return False, f"❌ Text is too short (minimum {min_chars} characters required). You have {len(text.strip())} characters."
        
        # Check if text has at least some structure (headings or bullet points)
        has_heading = any(line.strip() and len(line.strip().split()) <= 6 for line in text.split('\n'))
        
        if not has_heading:
            return False, "⚠️ Text appears to have no clear structure. Please ensure you have headings followed by bullet points."
        
        return True, None
    
    @staticmethod
    def validate_cycle_format(text: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that text contains proper cycle format (Cycle 1:, Cycle 2:, etc).
        
        Args:
            text: Processed text to validate
            
        Returns:
            (is_valid, error_message)
        """
        if not text or not text.strip():
            return False, "❌ No text provided. Please process text first."
        
        # Check for cycle headers
        cycle_pattern = r'Cycle\s+\d+:'
        cycles_found = re.findall(cycle_pattern, text, re.IGNORECASE)
        
        if not cycles_found:
            return False, """❌ No cycles found in text. Expected format:
```
Cycle 1:
• Point 1

Cycle 2:
• Point 2
```
Please use Tab 1 to process your text first."""
        
        # Check if cycles have content
        for cycle_num in range(1, len(cycles_found) + 1):
            cycle_section = re.search(
                rf'Cycle\s+{cycle_num}:(.*?)(?:Cycle\s+\d+:|$)',
                text,
                re.IGNORECASE | re.DOTALL
            )
            if cycle_section:
                content = cycle_section.group(1).strip()
                if not content or len(content.split('\n')) < 1:
                    return False, f"⚠️ Cycle {cycle_num} appears to be empty. Please ensure all cycles have at least one point."
        
        return True, None
    
    @staticmethod
    def validate_docx_file(filename: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that uploaded file is a DOCX file.
        
        Args:
            filename: Name of the uploaded file
            
        Returns:
            (is_valid, error_message)
        """
        if not filename:
            return False, "❌ No file selected."
        
        if not filename.lower().endswith('.docx'):
            return False, f"❌ Invalid file format: {filename}. Resume must be a DOCX file (.docx). Please convert your file or upload a Word document."
        
        return True, None
    
    @staticmethod
    def validate_text_file(filename: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that uploaded file is a text file.
        
        Args:
            filename: Name of the uploaded file
            
        Returns:
            (is_valid, error_message)
        """
        if not filename:
            return False, "❌ No file selected."
        
        if not filename.lower().endswith('.txt'):
            return False, f"❌ Invalid file format: {filename}. Only .txt files are supported for batch processing."
        
        return True, None
    
    @staticmethod
    def validate_cycle_count(num_cycles: int, num_bookmarks: int) -> Tuple[bool, str]:
        """
        Validate cycle count vs bookmark count and provide guidance.
        
        Args:
            num_cycles: Number of cycles in extracted text
            num_bookmarks: Number of bookmarks in resume
            
        Returns:
            (is_valid, message)
        """
        if num_cycles == num_bookmarks:
            return True, f"✅ Perfect match: {num_cycles} cycles for {num_bookmarks} bookmarks"
        elif num_cycles < num_bookmarks:
            unused = num_bookmarks - num_cycles
            return True, f"⚠️ You have {unused} unused bookmark(s). Choose option: Keep original, Repeat last cycle, or Clear."
        else:
            extra = num_cycles - num_bookmarks
            return True, f"⚠️ You have {extra} extra cycle(s) that won't be injected. Only first {num_bookmarks} will be used."
    
    @staticmethod
    def validate_points_per_cycle(value: int) -> Tuple[bool, Optional[str]]:
        """
        Validate points per cycle input.
        
        Args:
            value: Number of points per cycle
            
        Returns:
            (is_valid, error_message)
        """
        if value < 1:
            return False, "❌ Points per cycle must be at least 1."
        if value > 20:
            return False, "❌ Points per cycle should not exceed 20 (may cause formatting issues)."
        
        return True, None


class MessageFormatter:
    """Formats helpful messages for users."""
    
    @staticmethod
    def format_success(message: str) -> str:
        """Format a success message."""
        return f"✅ {message}"
    
    @staticmethod
    def format_error(message: str) -> str:
        """Format an error message."""
        return f"❌ {message}"
    
    @staticmethod
    def format_warning(message: str) -> str:
        """Format a warning message."""
        return f"⚠️ {message}"
    
    @staticmethod
    def format_info(message: str) -> str:
        """Format an info message."""
        return f"ℹ️ {message}"
    
    @staticmethod
    def get_format_help() -> str:
        """Return formatting help text."""
        return """
### 📋 Expected Format:

```
Company Name (or Role Title)
• Point 1
• Point 2
• Point 3

Another Company
• Achievement A
• Achievement B
• Achievement C
```

**Supported bullet styles:** • - * + or numbered (1. 2. 3.)
**Key requirements:**
- One heading per section
- At least 2-3 points per heading
- Blank line between sections (helps parser)
"""
    
    @staticmethod
    def get_troubleshooting() -> str:
        """Return troubleshooting guide."""
        return """
### 🔧 Troubleshooting

**Problem: "No valid headings found"**
- ✓ Ensure headings are 1-6 words long
- ✓ Don't start with action verbs (developed, implemented, etc)
- ✓ Use blank lines between sections

**Problem: "Cycles not detected in Tab 3"**
- ✓ Must use Tab 1 first to process text
- ✓ Copy entire output from Tab 1
- ✓ Format must include "Cycle 1:", "Cycle 2:", etc

**Problem: "No bookmarks found in resume"**
- ✓ Use Word > Insert > Bookmark to add bookmarks
- ✓ Name them clearly (e.g., "Company_Responsibilities")
- ✓ Save as .docx before uploading

**Problem: "Bookmarks don't match cycles"**
- ✓ Click "Customize Mapping" to manually assign
- ✓ Choose how to handle unused bookmarks
"""
