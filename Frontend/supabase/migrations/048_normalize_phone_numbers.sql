-- Migration: Store phone numbers with both formatted and normalized versions
-- Purpose: Keep original formatted numbers for display while enabling simple search via normalized version
-- This ensures: Display shows exactly what user entered, Search works with any phone format

-- Step 0: Drop any old triggers that might be normalizing vendor_phone directly
DROP TRIGGER IF EXISTS trigger_normalize_vendor_phone ON requirements;
DROP FUNCTION IF EXISTS normalize_vendor_phone();

-- Step 1: Create a function to normalize phone numbers (digits only)
CREATE OR REPLACE FUNCTION normalize_phone(phone_input TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digit characters and return only the digits
  RETURN REGEXP_REPLACE(phone_input, '[^\d]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Add vendor_phone_normalized column if it doesn't exist
ALTER TABLE requirements
ADD COLUMN IF NOT EXISTS vendor_phone_normalized TEXT;

-- Step 3: Populate vendor_phone_normalized from existing vendor_phone values
UPDATE requirements
SET vendor_phone_normalized = normalize_phone(vendor_phone)
WHERE vendor_phone IS NOT NULL AND vendor_phone != '';

-- Step 4: Create or replace trigger to auto-populate vendor_phone_normalized on INSERT/UPDATE
-- IMPORTANT: This trigger ONLY populates vendor_phone_normalized, it does NOT modify vendor_phone
CREATE OR REPLACE FUNCTION populate_vendor_phone_normalized()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update normalized version when formatted version changes
  -- Do NOT modify NEW.vendor_phone - keep it exactly as user entered it
  IF NEW.vendor_phone IS NOT NULL THEN
    NEW.vendor_phone_normalized := normalize_phone(NEW.vendor_phone);
  ELSE
    NEW.vendor_phone_normalized := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure clean state
DROP TRIGGER IF EXISTS trigger_populate_vendor_phone_normalized ON requirements;

CREATE TRIGGER trigger_populate_vendor_phone_normalized
BEFORE INSERT OR UPDATE ON requirements
FOR EACH ROW
EXECUTE FUNCTION populate_vendor_phone_normalized();

-- Step 5: Create indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_requirements_vendor_phone_normalized
ON requirements(vendor_phone_normalized);

-- Also keep index on original for any exact matches
CREATE INDEX IF NOT EXISTS idx_requirements_vendor_phone
ON requirements(vendor_phone);

