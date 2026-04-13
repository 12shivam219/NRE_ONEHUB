/**
 * SimilarRequirementsPanel Component
 * Phase 2: Display semantically similar job requirements using vector search
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Stack,
  Button,
  Chip,
  Alert,
  AlertTitle,
  Skeleton,
} from '@mui/material';
import { useSimilarRequirements, useDuplicateDetection, useSkillMatching, useRequirementSkills } from '@/hooks/useRAGSearch';
import './SimilarRequirementsPanel.css';

interface SimilarRequirementsPanelProps {
  requirementId: string | null;
  onViewOriginal?: (id: string) => void;
  showDuplicates?: boolean;
  maxResults?: number;
}

export const SimilarRequirementsPanel: React.FC<SimilarRequirementsPanelProps> = ({
  requirementId,
  onViewOriginal,
  showDuplicates = false,
  maxResults = 5,
}) => {
  const { similar, loading, error } = useSimilarRequirements(requirementId, {
    limit: maxResults,
    threshold: 0.7,
  });

  const { duplicates } = useDuplicateDetection(showDuplicates ? requirementId : null);
  const { skills } = useRequirementSkills(requirementId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!requirementId) {
    return (
      <Card className="similar-req-panel">
        <CardHeader>
          <Typography variant="h6">Similar Requirements</Typography>
        </CardHeader>
        <CardContent>
          <Alert severity="info">
            <AlertTitle>No Selection</AlertTitle>
            Select a requirement to see similar opportunities
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="similar-req-panel">
        <CardHeader>
          <Typography variant="h6">Similar Requirements</Typography>
        </CardHeader>
        <CardContent>
          <Alert severity="error">
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const hasDuplicates = showDuplicates && duplicates.length > 0;

  return (
    <Box className="similar-req-container">
      <Card className="similar-req-panel">
        <CardHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              Semantically Similar Requirements
            </Typography>
            <Chip 
              label={similar.length}
              color={similar.length > 0 ? 'primary' : 'default'}
              size="small"
            />
          </Box>
          <Typography variant="body2" color="textSecondary">
            Jobs recommended based on semantic similarity and skill matching
          </Typography>
        </CardHeader>

        <CardContent>
          {loading ? (
            <Stack spacing={2}>
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} height={120} />
              ))}
            </Stack>
          ) : similar.length === 0 ? (
            <Alert severity="info">
              <AlertTitle>No Results</AlertTitle>
              No similar requirements found in your database
            </Alert>
          ) : (
            <Stack spacing={3}>
              {/* Duplicates warning */}
              {hasDuplicates && (
                <Alert severity="warning">
                  <AlertTitle>Duplicates Found</AlertTitle>
                  ⚠️ {duplicates.length} potential duplicate(s) found
                </Alert>
              )}

              {/* Skills pills */}
              {skills.length > 0 && (
                <Box>
                  <Typography variant="caption" color="textSecondary" component="p" sx={{ mb: 1 }}>
                    Key Skills:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {skills.slice(0, 5).map((skill: any) => (
                      <Chip
                        key={skill.skill}
                        label={skill.skill}
                        size="small"
                        variant="outlined"
                        title={`${skill.relevance}% relevance`}
                      />
                    ))}
                    {skills.length > 5 && (
                      <Chip
                        label={`+${skills.length - 5} more`}
                        size="small"
                        color="default"
                      />
                    )}
                  </Stack>
                </Box>
              )}

              {/* Similar requirements list */}
              <Stack className="similar-list" spacing={2}>
                {similar.map((req: any) => (
                  <Box
                    key={req.id}
                    className="similar-item"
                    sx={{
                      p: 2,
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: '#f5f5f5',
                      },
                    }}
                    onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                  >
                    {/* Header with similarity score */}
                    <Box className="similar-header" sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: expandedId === req.id ? 2 : 0 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {req.title}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {req.company}
                        </Typography>
                      </Box>

                      {/* Similarity score badge */}
                      <Box className="similarity-badge">
                        <Box
                          className="similarity-score"
                          sx={{
                            backgroundColor: getSimilarityColor(req.similarity_score),
                            color: 'white',
                            p: 1,
                            borderRadius: 1,
                            textAlign: 'center',
                            minWidth: 50,
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {(req.similarity_score * 100).toFixed(0)}%
                          </Typography>
                        </Box>
                      </Box>

                      {/* Rate and status */}
                      <Box sx={{ textAlign: 'right' }}>
                        {req.rate && (
                          <Typography variant="body2" sx={{ color: 'green', fontWeight: 600 }}>
                            {req.rate}
                          </Typography>
                        )}
                        <Chip 
                          label={req.status}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    </Box>

                    {/* Expanded content */}
                    {expandedId === req.id && (
                      <Box className="similar-expanded" sx={{ pt: 2, borderTop: '1px solid #e0e0e0' }}>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                          {req.description.substring(0, 200)}
                          {req.description.length > 200 ? '...' : ''}
                        </Typography>

                        <Stack direction="row" spacing={1}>
                          {onViewOriginal && (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(e: any) => {
                                e.stopPropagation();
                                onViewOriginal(req.id);
                              }}
                            >
                              View Full Details
                            </Button>
                          )}
                        </Stack>
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Quality metrics card */}
      {similar.length > 0 && (
        <Card className="metrics-card" sx={{ mt: 2 }}>
          <CardHeader>
            <Typography variant="subtitle1" sx={{ fontSize: '1rem', fontWeight: 600 }}>Matching Insights</Typography>
          </CardHeader>
          <CardContent>
            <Stack direction="row" spacing={4}>
              <Box className="metric">
                <Typography variant="caption" color="textSecondary">
                  Avg Similarity
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {(similar.reduce((a: number, b: any) => a + b.similarity_score, 0) / similar.length * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box className="metric">
                <Typography variant="caption" color="textSecondary">
                  Remote Matches
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {similar.filter((r: any) => r.status === 'REMOTE').length}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

/**
 * RAG Job Recommendations Widget
 * Shows trending skills and recommendations
 */
interface JobRecommendationsProps {
  userId?: string;
  maxResults?: number;
}

export const JobRecommendationsWidget: React.FC<JobRecommendationsProps> = ({
  maxResults = 10,
}) => {
  const { matches: skillMatches, loading } = useSkillMatching(null);

  if (loading) {
    return (
      <Card className="recommendations-widget">
        <CardHeader>
          <Typography variant="h6">Job Recommendations</Typography>
        </CardHeader>
        <CardContent>
          <Skeleton height={120} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="recommendations-widget">
      <CardHeader>
        <Typography variant="h6">Market Insights</Typography>
        <Typography variant="body2" color="textSecondary">
          Based on your collected job requirements
        </Typography>
      </CardHeader>

      <CardContent>
        {skillMatches.length === 0 ? (
          <Alert severity="info">
            <AlertTitle>No Data</AlertTitle>
            Add more requirements to see recommendations
          </Alert>
        ) : (
          <Stack spacing={2}>
            {skillMatches.slice(0, maxResults).map((match: any) => (
              <Box key={match.skill} className="recommendation-item">
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {match.skill}
                  </Typography>
                  <Chip 
                    label={`${match.frequency} jobs`}
                    size="small"
                  />
                </Box>
                <Box
                  sx={{
                    width: '100%',
                    height: 6,
                    backgroundColor: '#e0e0e0',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      backgroundColor: '#1976d2',
                      width: `${match.match_percentage}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
                  {match.match_percentage.toFixed(0)}% of your requirements
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Helper function to get color based on similarity score
 */
function getSimilarityColor(score: number): string {
  if (score >= 0.85) return '#10b981'; // green
  if (score >= 0.7) return '#3b82f6'; // blue
  if (score >= 0.5) return '#f59e0b'; // amber
  return '#ef4444'; // red
}
