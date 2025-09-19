'use client'

import { useOnboardingStore, getStepNumber, getTotalSteps, getStepProgress } from '@/stores/onboarding'
import { cn } from '@/lib/utils'
import { Check, Circle } from 'lucide-react'

export function OnboardingNav() {
  const { step, steps, setStep } = useOnboardingStore()

  const currentStepNumber = getStepNumber(step)
  const totalSteps = getTotalSteps()
  const progress = getStepProgress(step)

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Setup Progress</span>
            <span>{currentStepNumber} of {totalSteps}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {steps.map((stepInfo, index) => {
              const stepNumber = index + 1
              const isCurrent = stepInfo.id === step
              const isCompleted = stepInfo.completed
              const isPast = stepNumber < currentStepNumber
              const isFuture = stepNumber > currentStepNumber

              return (
                <li key={stepInfo.id} className="relative flex-1">
                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "absolute top-4 left-1/2 w-full h-0.5 -translate-y-1/2",
                        isCompleted || isPast ? "bg-blue-600" : "bg-gray-200"
                      )}
                      style={{ left: "calc(50% + 16px)", width: "calc(100% - 32px)" }}
                    />
                  )}

                  {/* Step button */}
                  <button
                    onClick={() => setStep(stepInfo.id)}
                    className={cn(
                      "relative flex flex-col items-center group transition-all duration-200",
                      "hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg p-2",
                      isCurrent && "scale-110"
                    )}
                    disabled={isFuture && !isCompleted}
                  >
                    {/* Step circle */}
                    <div
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200 relative z-10",
                        isCompleted && "bg-blue-600 border-blue-600 text-white",
                        isCurrent && !isCompleted && "bg-blue-100 border-blue-600 text-blue-600",
                        isFuture && !isCompleted && "bg-white border-gray-300 text-gray-400",
                        isPast && !isCompleted && "bg-gray-100 border-gray-400 text-gray-600"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{stepNumber}</span>
                      )}
                    </div>

                    {/* Step label */}
                    <div className="mt-2 text-center min-h-[2.5rem]">
                      <div
                        className={cn(
                          "text-xs font-medium transition-colors duration-200",
                          isCurrent && "text-blue-600",
                          isCompleted && "text-gray-900",
                          isFuture && "text-gray-400",
                          isPast && "text-gray-600"
                        )}
                      >
                        {stepInfo.title}
                      </div>
                      {isCurrent && (
                        <div className="text-xs text-gray-500 mt-1 max-w-24 leading-tight">
                          {stepInfo.description}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>
    </div>
  )
}

export function OnboardingNavCompact() {
  const { step, steps } = useOnboardingStore()

  const currentStepNumber = getStepNumber(step)
  const totalSteps = getTotalSteps()
  const progress = getStepProgress(step)
  const currentStepInfo = steps.find(s => s.id === step)

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">
            {currentStepNumber}
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">
              {currentStepInfo?.title}
            </h3>
            <p className="text-xs text-gray-500">
              Step {currentStepNumber} of {totalSteps}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="w-24 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 font-medium">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>
  )
}