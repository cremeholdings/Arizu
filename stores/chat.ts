'use client'

import { create } from 'zustand'
import type { Plan } from '@/lib/plan/schema'

export type ChatStatus = 'idle' | 'generating' | 'testing' | 'deploying' | 'deployed'

export interface TestResult {
  ok: boolean
  simulated: boolean
  issues?: string[]
  message?: string
}

export interface DeployResult {
  ok: boolean
  workflowId?: string
  workflowName?: string
  webhookUrl?: string
  isNew?: boolean
  message?: string
}

interface ChatState {
  text: string
  plan?: Plan
  status: ChatStatus
  error?: string
  testResult?: TestResult
  deployResult?: DeployResult
  generationAttempts: number
  lastGeneratedText: string
}

interface ChatActions {
  setText: (text: string) => void
  setStatus: (status: ChatStatus) => void
  setPlan: (plan: Plan | undefined) => void
  setError: (error: string | undefined) => void
  setTestResult: (result: TestResult | undefined) => void
  setDeployResult: (result: DeployResult | undefined) => void
  incrementAttempts: () => void
  setLastGeneratedText: (text: string) => void
  reset: () => void
  clearResults: () => void
}

type ChatStore = ChatState & ChatActions

const initialState: ChatState = {
  text: '',
  status: 'idle',
  generationAttempts: 0,
  lastGeneratedText: ''
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  ...initialState,

  // Actions
  setText: (text: string) => {
    set({ text })

    // Clear plan and results if text changes significantly from last generation
    const { lastGeneratedText, plan } = get()
    if (plan && text !== lastGeneratedText) {
      set({
        plan: undefined,
        testResult: undefined,
        deployResult: undefined,
        error: undefined
      })
    }
  },

  setStatus: (status: ChatStatus) => {
    set({ status })

    // Clear error when starting new operations
    if (status !== 'idle') {
      set({ error: undefined })
    }
  },

  setPlan: (plan: Plan | undefined) => {
    set({ plan })

    // Clear test and deploy results when plan changes
    if (plan) {
      set({
        testResult: undefined,
        deployResult: undefined,
        error: undefined
      })
    }
  },

  setError: (error: string | undefined) => {
    set({ error })

    // Reset status to idle when error is set
    if (error) {
      set({ status: 'idle' })
    }
  },

  setTestResult: (testResult: TestResult | undefined) => {
    set({ testResult })

    // Clear deploy result when test result changes
    if (testResult) {
      set({ deployResult: undefined })
    }
  },

  setDeployResult: (deployResult: DeployResult | undefined) => {
    set({ deployResult })

    // Set status to deployed if deployment successful
    if (deployResult?.ok) {
      set({ status: 'deployed' })
    }
  },

  incrementAttempts: () => {
    set((state) => ({
      generationAttempts: state.generationAttempts + 1
    }))
  },

  setLastGeneratedText: (lastGeneratedText: string) => {
    set({ lastGeneratedText })
  },

  reset: () => {
    set(initialState)
  },

  clearResults: () => {
    set({
      testResult: undefined,
      deployResult: undefined,
      error: undefined
    })
  }
}))

// Helper functions
export const canGeneratePlan = (state: ChatState): boolean => {
  return state.status === 'idle' && state.text.trim().length >= 10
}

export const canTestPlan = (state: ChatState): boolean => {
  return state.status === 'idle' && !!state.plan
}

export const canDeployPlan = (state: ChatState): boolean => {
  return state.status === 'idle' && !!state.plan && state.testResult?.ok === true
}

export const getStatusMessage = (status: ChatStatus): string => {
  switch (status) {
    case 'idle':
      return 'Ready'
    case 'generating':
      return 'Generating automation plan...'
    case 'testing':
      return 'Testing automation...'
    case 'deploying':
      return 'Deploying to n8n...'
    case 'deployed':
      return 'Successfully deployed!'
    default:
      return ''
  }
}

export const isOperationInProgress = (status: ChatStatus): boolean => {
  return ['generating', 'testing', 'deploying'].includes(status)
}

// Error handling helpers
export const formatApiError = (error: any): string => {
  if (typeof error === 'string') {
    return error
  }

  if (error?.message) {
    return error.message
  }

  if (error?.error) {
    return typeof error.error === 'string' ? error.error : 'An error occurred'
  }

  if (error?.details?.suggestion) {
    return error.details.suggestion
  }

  return 'An unexpected error occurred'
}

export const isRateLimitError = (error: any): boolean => {
  return error?.code === 'RATE_LIMIT' || error?.error === 'Rate limit exceeded'
}

export const isCircuitBreakerError = (error: any): boolean => {
  return error?.code === 'CIRCUIT_OPEN' || error?.state === 'open'
}

export const getRetryMessage = (error: any): string => {
  if (isRateLimitError(error)) {
    return `Rate limit exceeded. Please wait ${error.retryAfter || 60} seconds before trying again.`
  }

  if (isCircuitBreakerError(error)) {
    return 'Service temporarily unavailable. Please try again in a few minutes.'
  }

  return 'Please try again in a moment.'
}