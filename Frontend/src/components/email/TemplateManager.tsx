import { useState } from 'react';
import {
  Stack,
  Paper,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import { Plus, Trash2, Edit2, Copy } from 'lucide-react';

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'professional' | 'sales' | 'support' | 'custom';
  subject: string;
  body: string;
  variables?: string[]; // e.g., ['{{recipient_name}}', '{{company}}']
  createdAt: string;
  isBuiltIn?: boolean;
}

interface TemplateManagerProps {
  templates: EmailTemplate[];
  onTemplatesChange: (templates: EmailTemplate[]) => void;
  onTemplateSelect?: (template: EmailTemplate) => void;
  disabled?: boolean;
}

// Built-in templates
const BUILTIN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'builtin-1',
    name: 'Job Inquiry',
    category: 'professional',
    subject: 'Inquiry About {{position}} Position',
    body: `Dear {{recipient_name}},

I am writing to inquire about the {{position}} position at {{company}}.

I am very interested in this opportunity and believe my qualifications align well with your requirements.

Could we schedule a time to discuss this position further?

Thank you for your time and consideration.

Best regards,
{{sender_name}}`,
    variables: ['{{recipient_name}}', '{{position}}', '{{company}}', '{{sender_name}}'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-2',
    name: 'Follow Up',
    category: 'sales',
    subject: 'Following Up - {{topic}}',
    body: `Hi {{recipient_name}},

I wanted to follow up on my previous email regarding {{topic}}.

I would love to hear your thoughts and discuss how I can assist you further.

Looking forward to connecting soon.

Best regards,
{{sender_name}}`,
    variables: ['{{recipient_name}}', '{{topic}}', '{{sender_name}}'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-3',
    name: 'Thank You',
    category: 'professional',
    subject: 'Thank You for Your Time',
    body: `Dear {{recipient_name}},

Thank you for taking the time to speak with me on {{date}}.

I genuinely enjoyed our conversation and learning more about {{company}}.

I am very excited about the possibility of contributing to your team.

Please feel free to contact me if you need any additional information.

Best regards,
{{sender_name}}`,
    variables: ['{{recipient_name}}', '{{date}}', '{{company}}', '{{sender_name}}'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-4',
    name: 'Introduction',
    category: 'professional',
    subject: 'Let\'s Connect - {{your_name}}',
    body: `Hi {{recipient_name}},

I hope this email finds you well. My name is {{sender_name}}, and I am a {{position}} with expertise in {{skills}}.

I have been following {{company}}'s work and am impressed with your recent {{achievement}}.

I would love to connect and explore potential opportunities to work together.

Would you be available for a quick call next week?

Looking forward to hearing from you.

Best regards,
{{sender_name}}
{{email}}`,
    variables: ['{{recipient_name}}', '{{sender_name}}', '{{position}}', '{{skills}}', '{{company}}', '{{achievement}}', '{{email}}'],
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
];

export const TemplateManager = ({
  templates,
  onTemplatesChange,
  onTemplateSelect,
  disabled = false,
}: TemplateManagerProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('custom');
  const [formData, setFormData] = useState({
    name: '',
    category: 'custom' as const,
    subject: '',
    body: '',
  });

  // Get template categories
  const customTemplates = templates;
  const builtInTemplates = BUILTIN_TEMPLATES;

  // Get variables from text
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches)]; // Remove duplicates
  };

  // Open dialog for new template
  const handleNew = () => {
    setEditingId(null);
    setFormData({
      name: '',
      category: 'custom',
      subject: '',
      body: '',
    });
    setShowDialog(true);
  };

  // Open dialog for editing
  const handleEdit = (template: EmailTemplate) => {
    if (template.isBuiltIn) {
      // Create copy of built-in template
      setEditingId(null);
      setFormData({
        name: `${template.name} (Copy)`,
        category: 'custom',
        subject: template.subject,
        body: template.body,
      });
    } else {
      setEditingId(template.id);
      setFormData({
        name: template.name,
        category: (template.category || 'custom') as 'custom',
        subject: template.subject,
        body: template.body,
      });
    }
    setShowDialog(true);
  };

  // Save template
  const handleSave = () => {
    if (!formData.name.trim() || !formData.subject.trim() || !formData.body.trim()) {
      return;
    }

    const variables = extractVariables(`${formData.subject}${formData.body}`);

    if (editingId) {
      // Update existing
      onTemplatesChange(
        templates.map(t =>
          t.id === editingId
            ? {
              ...t,
              name: formData.name,
              category: formData.category,
              subject: formData.subject,
              body: formData.body,
              variables,
            }
            : t
        )
      );
    } else {
      // Create new
      const newTemplate: EmailTemplate = {
        id: `tpl-${Date.now()}`,
        name: formData.name,
        category: formData.category,
        subject: formData.subject,
        body: formData.body,
        variables,
        createdAt: new Date().toISOString(),
      };
      onTemplatesChange([...templates, newTemplate]);
    }

    setShowDialog(false);
    setFormData({
      name: '',
      category: 'custom',
      subject: '',
      body: '',
    });
  };

  // Delete template
  const handleDelete = (id: string) => {
    onTemplatesChange(templates.filter(t => t.id !== id));
  };

  // Use template
  const handleUseTemplate = (template: EmailTemplate) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  };

  const renderTemplateList = (list: EmailTemplate[], isBuiltIn = false) => {
    if (list.length === 0) {
      return (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          No templates yet
        </Typography>
      );
    }

    return (
      <Stack spacing={1}>
        {list.map(template => (
          <Paper
            key={template.id}
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: 'rgba(234,179,8,0.02)',
              borderColor: 'rgba(234,179,8,0.1)',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="start">
                <Stack sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {template.name}
                    </Typography>
                    <Chip
                      label={template.category}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '10px' }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Subject: {template.subject.substring(0, 60)}
                    {template.subject.length > 60 ? '...' : ''}
                  </Typography>
                  {template.variables && template.variables.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      {template.variables.map(v => (
                        <Chip
                          key={v}
                          label={v}
                          size="small"
                          variant="filled"
                          sx={{
                            height: 'auto',
                            py: 0.25,
                            bgcolor: 'rgba(59,130,246,0.1)',
                            color: 'rgb(59,130,246)',
                          }}
                        />
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Use Template">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleUseTemplate(template)}
                      disabled={disabled}
                    >
                      Use
                    </Button>
                  </Tooltip>
                  {!isBuiltIn && (
                    <>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(template)}
                          disabled={disabled}
                        >
                          <Edit2 className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(template.id)}
                          disabled={disabled}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {isBuiltIn && (
                    <Tooltip title="Create a copy">
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(template)}
                        disabled={disabled}
                      >
                        <Copy className="w-4 h-4" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'rgba(234,179,8,0.20)',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Email Templates
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={handleNew}
              disabled={disabled}
            >
              New
            </Button>
          </Stack>

          <Tabs value={activeTab} onChange={(_, value: string) => setActiveTab(value)} sx={{ mb: 2 }}>
            <Tab label={`Custom (${customTemplates.length})`} value="custom" />
            <Tab label={`Built-in (${builtInTemplates.length})`} value="builtin" />
          </Tabs>

          {activeTab === 'custom' && renderTemplateList(customTemplates)}
          {activeTab === 'builtin' && (
            <>
              <Alert severity="info" sx={{ mb: 1 }}>
                Built-in templates are read-only. Click "Copy" to create a custom version.
              </Alert>
              {renderTemplateList(builtInTemplates, true)}
            </>
          )}
        </Stack>
      </Paper>

      {/* Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingId && !templates.find(t => t.id === editingId)?.isBuiltIn ? 'Edit Template' : 'Create New Template'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Template Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Job Application, Follow-up"
              fullWidth
              size="small"
            />

            <TextField
              select
              label="Category"
              value={formData.category}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, category: (e.target.value || 'custom') as 'custom' })}
              fullWidth
              size="small"
              SelectProps={{
                native: true,
              }}
            >
              <option value="professional">Professional</option>
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="custom">Custom</option>
            </TextField>

            <TextField
              label="Subject Line"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Use {{variable_name}} for dynamic content"
              fullWidth
              size="small"
              helperText="Tip: Use {{recipient_name}}, {{company}}, etc. for personalization"
            />

            <TextField
              label="Body"
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Use {{variable_name}} for dynamic content like {{recipient_name}}, {{company}}, {{date}}"
              multiline
              minRows={8}
              fullWidth
              size="small"
              helperText="Variables will be highlighted in blue"
            />

            {/* Variables Info */}
            {extractVariables(`${formData.subject}${formData.body}`).length > 0 && (
              <Alert severity="info">
                Variables found: {extractVariables(`${formData.subject}${formData.body}`).join(', ')}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.name.trim() || !formData.subject.trim() || !formData.body.trim()}
          >
            {editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
