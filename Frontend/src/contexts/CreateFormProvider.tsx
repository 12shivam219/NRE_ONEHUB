import { ReactNode, useCallback, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import CreateFormContext from './CreateFormContext';
import { CreateRequirementForm } from '../components/crm/CreateRequirementForm';
import { CreateInterviewForm } from '../components/crm/CreateInterviewForm';
import { CreateConsultantForm } from '../components/crm/CreateConsultantForm';

type FormType = 'requirement' | 'interview' | 'consultant';

function CreateFormProvider({ children }: { children: ReactNode }) {
  const [openForm, setOpenForm] = useState<FormType | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | undefined>();

  const closeCreateForm = useCallback(() => {
    setOpenForm(null);
    setSelectedRequirementId(undefined);
  }, []);

  const openCreateForm = useCallback((type: FormType, requirementId?: string) => {
    setOpenForm(type);
    if (type === 'interview' && requirementId) {
      setSelectedRequirementId(requirementId);
    }
  }, []);

  const contextValue = useMemo(() => ({ openCreateForm, closeCreateForm }), [openCreateForm, closeCreateForm]);

  return (
    <CreateFormContext.Provider value={contextValue}>
      {children}

      {/* Requirement Modal */}
      <Dialog
        open={openForm === 'requirement'}
        onClose={closeCreateForm}
        maxWidth="sm"
        fullWidth
        disableScrollLock
        PaperProps={{ sx: { borderRadius: '1rem' } }}
      >
        <DialogTitle>
          <div>
            <Typography>Create New Requirement</Typography>
          </div>
          <IconButton onClick={closeCreateForm} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <CreateRequirementForm onClose={closeCreateForm} onSuccess={closeCreateForm} />
        </DialogContent>
      </Dialog>

      {/* Interview Modal */}
      <Dialog open={openForm === 'interview'} onClose={closeCreateForm} maxWidth="sm" fullWidth>
        <DialogTitle>Create Interview</DialogTitle>
        <DialogContent>
          <CreateInterviewForm requirementId={selectedRequirementId} onClose={closeCreateForm} onSuccess={closeCreateForm} showDialog={false} />
        </DialogContent>
      </Dialog>

      {/* Consultant Modal */}
      <Dialog open={openForm === 'consultant'} onClose={closeCreateForm} maxWidth="sm" fullWidth>
        <DialogTitle>Create Consultant</DialogTitle>
        <DialogContent>
          <CreateConsultantForm onClose={closeCreateForm} onSuccess={closeCreateForm} />
        </DialogContent>
      </Dialog>
    </CreateFormContext.Provider>
  );
}

export { CreateFormProvider };
