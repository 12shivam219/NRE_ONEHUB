-- RPC function to add a next step comment
CREATE OR REPLACE FUNCTION public.add_next_step_comment(
  p_requirement_id UUID,
  p_comment_text TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Check if user_id is null
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Verify user owns the requirement
  IF NOT EXISTS (
    SELECT 1 FROM public.requirements 
    WHERE id = p_requirement_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add comments to this requirement';
  END IF;
  
  -- Insert the comment
  INSERT INTO public.next_step_comments (requirement_id, user_id, comment_text)
  VALUES (p_requirement_id, v_user_id, p_comment_text)
  RETURNING id INTO v_comment_id;
  
  -- Return the created comment
  RETURN json_build_object(
    'id', v_comment_id,
    'requirement_id', p_requirement_id,
    'user_id', v_user_id,
    'comment_text', p_comment_text,
    'created_at', NOW(),
    'updated_at', NOW()
  );
END;
$$;

-- RPC function to get latest next step comment
CREATE OR REPLACE FUNCTION public.get_latest_next_step(
  p_requirement_id UUID
)
RETURNS TABLE (
  comment_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  user_email TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 
    nsc.comment_text,
    nsc.created_at,
    u.email
  FROM public.next_step_comments nsc
  LEFT JOIN public.users u ON u.id = nsc.user_id
  WHERE nsc.requirement_id = p_requirement_id
  ORDER BY nsc.created_at DESC
  LIMIT 1;
$$;
