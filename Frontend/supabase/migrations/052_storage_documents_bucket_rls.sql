-- Row-level security for the private "documents" storage bucket (user-scoped object paths).

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read objects stored under their user id prefix: "<uuid>/..."
DROP POLICY IF EXISTS "documents_bucket_select_own" ON storage.objects;
CREATE POLICY "documents_bucket_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "documents_bucket_insert_own" ON storage.objects;
CREATE POLICY "documents_bucket_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "documents_bucket_update_own" ON storage.objects;
CREATE POLICY "documents_bucket_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "documents_bucket_delete_own" ON storage.objects;
CREATE POLICY "documents_bucket_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid()::text)
  );

COMMIT;
