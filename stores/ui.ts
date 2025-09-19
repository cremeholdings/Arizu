import { create } from "zustand"

interface DialogState {
  upgradeDialog: boolean
  deleteConfirmDialog: boolean
  inviteTeamDialog: boolean
  createAutomationDialog: boolean
}

interface ChatComposerState {
  input: string
  isGenerating: boolean
  selectedTemplate: string | null
  attachments: string[]
}

interface PlanEditorState {
  hasUnsavedChanges: boolean
  isPreviewMode: boolean
  selectedNodeId: string | null
}

interface RunsFiltersState {
  status: "all" | "success" | "failed" | "running"
  dateRange: [Date, Date] | null
  organizationId: string | null
  searchQuery: string
}

interface UIState {
  dialogs: DialogState
  chatComposer: ChatComposerState
  planEditor: PlanEditorState
  runsFilters: RunsFiltersState
  templatePreviewSelection: string | null
}

interface UIActions {
  setDialog: (dialog: keyof DialogState, open: boolean) => void
  setChatComposerInput: (input: string) => void
  setChatGenerating: (generating: boolean) => void
  setSelectedTemplate: (templateId: string | null) => void
  addAttachment: (attachment: string) => void
  removeAttachment: (attachment: string) => void
  clearAttachments: () => void
  setPlanEditorUnsaved: (hasChanges: boolean) => void
  setPlanEditorPreview: (isPreview: boolean) => void
  setSelectedNode: (nodeId: string | null) => void
  setRunsFilter: <K extends keyof RunsFiltersState>(
    key: K,
    value: RunsFiltersState[K]
  ) => void
  resetRunsFilters: () => void
  setTemplatePreview: (templateId: string | null) => void
}

type UIStore = UIState & UIActions

const initialDialogs: DialogState = {
  upgradeDialog: false,
  deleteConfirmDialog: false,
  inviteTeamDialog: false,
  createAutomationDialog: false,
}

const initialChatComposer: ChatComposerState = {
  input: "",
  isGenerating: false,
  selectedTemplate: null,
  attachments: [],
}

const initialPlanEditor: PlanEditorState = {
  hasUnsavedChanges: false,
  isPreviewMode: false,
  selectedNodeId: null,
}

const initialRunsFilters: RunsFiltersState = {
  status: "all",
  dateRange: null,
  organizationId: null,
  searchQuery: "",
}

export const useUIStore = create<UIStore>((set) => ({
  dialogs: initialDialogs,
  chatComposer: initialChatComposer,
  planEditor: initialPlanEditor,
  runsFilters: initialRunsFilters,
  templatePreviewSelection: null,

  setDialog: (dialog, open) => {
    set((state) => ({
      dialogs: { ...state.dialogs, [dialog]: open },
    }))
  },

  setChatComposerInput: (input) => {
    set((state) => ({
      chatComposer: { ...state.chatComposer, input },
    }))
  },

  setChatGenerating: (generating) => {
    set((state) => ({
      chatComposer: { ...state.chatComposer, isGenerating: generating },
    }))
  },

  setSelectedTemplate: (templateId) => {
    set((state) => ({
      chatComposer: { ...state.chatComposer, selectedTemplate: templateId },
    }))
  },

  addAttachment: (attachment) => {
    set((state) => ({
      chatComposer: {
        ...state.chatComposer,
        attachments: [...state.chatComposer.attachments, attachment],
      },
    }))
  },

  removeAttachment: (attachment) => {
    set((state) => ({
      chatComposer: {
        ...state.chatComposer,
        attachments: state.chatComposer.attachments.filter(
          (a) => a !== attachment
        ),
      },
    }))
  },

  clearAttachments: () => {
    set((state) => ({
      chatComposer: { ...state.chatComposer, attachments: [] },
    }))
  },

  setPlanEditorUnsaved: (hasChanges) => {
    set((state) => ({
      planEditor: { ...state.planEditor, hasUnsavedChanges: hasChanges },
    }))
  },

  setPlanEditorPreview: (isPreview) => {
    set((state) => ({
      planEditor: { ...state.planEditor, isPreviewMode: isPreview },
    }))
  },

  setSelectedNode: (nodeId) => {
    set((state) => ({
      planEditor: { ...state.planEditor, selectedNodeId: nodeId },
    }))
  },

  setRunsFilter: (key, value) => {
    set((state) => ({
      runsFilters: { ...state.runsFilters, [key]: value },
    }))
  },

  resetRunsFilters: () => {
    set({ runsFilters: initialRunsFilters })
  },

  setTemplatePreview: (templateId) => {
    set({ templatePreviewSelection: templateId })
  },
}))