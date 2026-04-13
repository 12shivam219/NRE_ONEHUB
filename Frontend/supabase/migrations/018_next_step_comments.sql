-- Create next_step_comments table for tracking multiple next steps/comments on requirements
CREATE TABLE IF NOT EXISTS public.next_step_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX idx_next_step_comments_requirement_id ON public.next_step_comments(requirement_id);
CREATE INDEX idx_next_step_comments_user_id ON public.next_step_comments(user_id);
CREATE INDEX idx_next_step_comments_created_at ON public.next_step_comments(created_at DESC);
CREATE INDEX idx_next_step_comments_requirement_created ON public.next_step_comments(requirement_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.next_step_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow users to view comments on requirements they have access to
CREATE POLICY "Users can view next step comments on their requirements"
  ON public.next_step_comments
  FOR SELECT
  USING (
    requirement_id IN (
      SELECT id FROM public.requirements WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow users to insert comments on their own requirements
CREATE POLICY "Users can add next step comments to their requirements"
  ON public.next_step_comments
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND requirement_id IN (
      SELECT id FROM public.requirements WHERE user_id = auth.uid()
    )
  );

-- Allow users to delete their own comments
CREATE POLICY "Users can delete their own next step comments"
  ON public.next_step_comments
  FOR DELETE
  USING (user_id = auth.uid());

-- Allow admins to delete any comments
CREATE POLICY "Admins can delete any next step comments"
  ON public.next_step_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
