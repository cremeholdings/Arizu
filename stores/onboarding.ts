import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface OnboardingStep {
  id: string
  title: string
  description: string
  completed: boolean
  optional?: boolean
}

interface OnboardingState {
  currentStep: number
  steps: OnboardingStep[]
  isCompleted: boolean
  draft: {
    organizationName: string
    useCase: string
    automationGoals: string[]
  }
}

interface OnboardingActions {
  setCurrentStep: (step: number) => void
  markStepCompleted: (stepId: string) => void
  resetOnboarding: () => void
  updateDraft: (updates: Partial<OnboardingState["draft"]>) => void
  clearDraft: () => void
  completeOnboarding: () => void
}

type OnboardingStore = OnboardingState & OnboardingActions

const initialSteps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Arizu",
    description: "Let's get you set up with natural language automations",
    completed: false,
  },
  {
    id: "organization",
    title: "Create Organization",
    description: "Set up your team workspace",
    completed: false,
  },
  {
    id: "first-automation",
    title: "Build First Automation",
    description: "Create your first automation with natural language",
    completed: false,
  },
  {
    id: "invite-team",
    title: "Invite Team Members",
    description: "Collaborate with your team",
    completed: false,
    optional: true,
  },
]

const initialDraft = {
  organizationName: "",
  useCase: "",
  automationGoals: [],
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      currentStep: 0,
      steps: initialSteps,
      isCompleted: false,
      draft: initialDraft,

      setCurrentStep: (step: number) => {
        set({ currentStep: step })
      },

      markStepCompleted: (stepId: string) => {
        set((state) => ({
          steps: state.steps.map((step) =>
            step.id === stepId ? { ...step, completed: true } : step
          ),
        }))

        const { steps } = get()
        const requiredSteps = steps.filter((step) => !step.optional)
        const completedRequired = requiredSteps.filter((step) => step.completed)

        if (completedRequired.length === requiredSteps.length) {
          set({ isCompleted: true })
        }
      },

      resetOnboarding: () => {
        set({
          currentStep: 0,
          steps: initialSteps,
          isCompleted: false,
          draft: initialDraft,
        })
      },

      updateDraft: (updates) => {
        set((state) => ({
          draft: { ...state.draft, ...updates },
        }))
      },

      clearDraft: () => {
        set({ draft: initialDraft })
      },

      completeOnboarding: () => {
        set({ isCompleted: true })
      },
    }),
    {
      name: "arizu-onboarding",
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    }
  )
)