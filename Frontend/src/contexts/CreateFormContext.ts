import { createContext } from 'react';

export type FormType = 'requirement' | 'interview' | 'consultant';

export interface CreateFormContextValue {
  openCreateForm: (type: FormType, requirementId?: string) => void;
  closeCreateForm: () => void;
}

export const CreateFormContext = createContext<CreateFormContextValue | undefined>(undefined);

export default CreateFormContext;