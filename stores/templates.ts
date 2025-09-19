import { create } from "zustand"

interface TemplatesState {
  selectedTemplateId?: string
}

interface TemplatesActions {
  select: (id: string) => void
  clear: () => void
}

type TemplatesStore = TemplatesState & TemplatesActions

export const useTemplatesStore = create<TemplatesStore>((set) => ({
  selectedTemplateId: undefined,

  select: (id) => {
    set({ selectedTemplateId: id })
  },

  clear: () => {
    set({ selectedTemplateId: undefined })
  },
}))