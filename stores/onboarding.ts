'use client'

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type OnboardingStep = 'welcome' | 'n8n' | 'ai' | 'apps' | 'workflow' | 'test'

export interface OnboardingStepInfo {
  id: OnboardingStep
  title: string
  description: string
  completed: boolean
  optional?: boolean
}

export interface OnboardingData {
  modelProvider?: 'anthropic' | 'openai' | 'mistral' | 'google'
  templateId?: string
  n8nUrl?: string
  selectedApps?: string[]
  workflowName?: string
  testResults?: {
    success: boolean
    message: string
  }
  // Legacy fields for backward compatibility
  organizationName?: string
  useCase?: string
  automationGoals?: string[]
}

interface OnboardingState {
  step: OnboardingStep
  currentStep: number
  steps: OnboardingStepInfo[]
  isCompleted: boolean
  completed: boolean
  data: OnboardingData
  draft: OnboardingData
}

interface OnboardingActions {
  next: () => void
  prev: () => void
  set: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void
  setStep: (step: OnboardingStep) => void
  setCurrentStep: (step: number) => void
  markStepCompleted: (stepId: string) => void
  reset: () => void
  resetOnboarding: () => void
  updateDraft: (updates: Partial<OnboardingData>) => void
  clearDraft: () => void
  complete: () => void
  completeOnboarding: () => void
}

const wizardSteps: OnboardingStep[] = ['welcome', 'n8n', 'ai', 'apps', 'workflow', 'test']

const initialSteps: OnboardingStepInfo[] = [
  {
    id: "welcome",
    title: "Welcome to Arizu",
    description: "Let's get you set up with automated workflows",
    completed: false,
  },
  {
    id: "n8n",
    title: "Connect n8n",
    description: "Connect your n8n instance to power your automations",
    completed: false,
  },
  {
    id: "ai",
    title: "AI Provider",
    description: "Choose your preferred AI model for generating workflows",
    completed: false,
  },
  {
    id: "apps",
    title: "Choose Apps",
    description: "Select the apps you want to automate",
    completed: false,
  },
  {
    id: "workflow",
    title: "Create Workflow",
    description: "Create your first automation workflow",
    completed: false,
  },
  {
    id: "test",
    title: "Test & Launch",
    description: "Test your workflow and launch it live",
    completed: false,
  },
]

const initialData: OnboardingData = {
  organizationName: "",
  useCase: "",
  automationGoals: [],
}

type OnboardingStore = OnboardingState & OnboardingActions

const getStepIndex = (step: OnboardingStep): number => wizardSteps.indexOf(step)
const getStepByIndex = (index: number): OnboardingStep => wizardSteps[index] || 'welcome'

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      // Initial state
      step: 'welcome',
      currentStep: 0,
      steps: initialSteps,
      isCompleted: false,
      completed: false,
      data: initialData,
      draft: initialData,

      // New wizard actions
      next: () => {
        const { step } = get()
        const currentIndex = getStepIndex(step)
        const nextIndex = Math.min(currentIndex + 1, wizardSteps.length - 1)
        const nextStep = getStepByIndex(nextIndex)

        set({
          step: nextStep,
          currentStep: nextIndex
        })

        // Mark current step as completed
        set((state) => ({
          steps: state.steps.map((s) =>
            s.id === step ? { ...s, completed: true } : s
          ),
        }))

        // Mark as completed if we've reached the last step
        if (nextIndex === wizardSteps.length - 1) {
          set({ completed: true, isCompleted: true })
        }
      },

      prev: () => {
        const { step } = get()
        const currentIndex = getStepIndex(step)
        const prevIndex = Math.max(currentIndex - 1, 0)
        const prevStep = getStepByIndex(prevIndex)

        set({
          step: prevStep,
          currentStep: prevIndex
        })
      },

      set: (key, value) => {
        set((state) => ({
          data: {
            ...state.data,
            [key]: value
          },
          draft: {
            ...state.draft,
            [key]: value
          }
        }))
      },

      setStep: (step) => {
        const stepIndex = getStepIndex(step)
        set({
          step,
          currentStep: stepIndex
        })
      },

      // Legacy actions for backward compatibility
      setCurrentStep: (step: number) => {
        const newStep = getStepByIndex(step)
        set({
          currentStep: step,
          step: newStep
        })
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
          set({ isCompleted: true, completed: true })
        }
      },

      reset: () => {
        set({
          step: 'welcome',
          currentStep: 0,
          steps: initialSteps,
          isCompleted: false,
          completed: false,
          data: initialData,
          draft: initialData,
        })
      },

      resetOnboarding: () => {
        set({
          step: 'welcome',
          currentStep: 0,
          steps: initialSteps,
          isCompleted: false,
          completed: false,
          data: initialData,
          draft: initialData,
        })
      },

      updateDraft: (updates) => {
        set((state) => ({
          draft: { ...state.draft, ...updates },
          data: { ...state.data, ...updates },
        }))
      },

      clearDraft: () => {
        set({
          draft: initialData,
          data: initialData
        })
      },

      complete: () => {
        set({ completed: true, isCompleted: true })
      },

      completeOnboarding: () => {
        set({ isCompleted: true, completed: true })
      },
    }),
    {
      name: "arizu-onboarding",
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null
          const str = sessionStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return
          sessionStorage.removeItem(name)
        },
      },
    }
  )
)

// Helper functions
export const getStepNumber = (step: OnboardingStep): number => getStepIndex(step) + 1
export const getTotalSteps = (): number => wizardSteps.length
export const getStepProgress = (step: OnboardingStep): number => {
  return ((getStepIndex(step) + 1) / wizardSteps.length) * 100
}

// Validation helpers
export const canProceedFromStep = (step: OnboardingStep, data: OnboardingData): boolean => {
  switch (step) {
    case 'welcome':
      return true // Always can proceed from welcome
    case 'n8n':
      return !!data.n8nUrl && data.n8nUrl.trim().length > 0
    case 'ai':
      return !!data.modelProvider
    case 'apps':
      return !!data.selectedApps && data.selectedApps.length > 0
    case 'workflow':
      return !!data.workflowName && data.workflowName.trim().length > 0
    case 'test':
      return true // Test step doesn't require validation to proceed
    default:
      return false
  }
}

export const getStepTitle = (step: OnboardingStep): string => {
  const stepInfo = initialSteps.find(s => s.id === step)
  return stepInfo?.title || 'Onboarding'
}

export const getStepDescription = (step: OnboardingStep): string => {
  const stepInfo = initialSteps.find(s => s.id === step)
  return stepInfo?.description || ''
}