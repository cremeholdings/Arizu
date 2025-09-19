'use client'

import { useOnboardingStore, canProceedFromStep } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ArrowLeft, Workflow, Lightbulb, Zap, Mail, Calendar, MessageSquare } from 'lucide-react'
import { useState } from 'react'

const workflowTemplates = [
  {
    id: 'email-calendar',
    title: 'Email to Calendar Events',
    description: 'Automatically create calendar events from emails with specific keywords',
    prompt: 'When I receive an email in Gmail with "meeting" or "appointment" in the subject, extract the date and time mentioned in the email body and create a Google Calendar event with the email sender as a participant.',
    tags: ['Gmail', 'Google Calendar'],
    icon: <Calendar className="w-5 h-5" />
  },
  {
    id: 'slack-notifications',
    title: 'Smart Slack Notifications',
    description: 'Send intelligent notifications to Slack channels based on triggers',
    prompt: 'When a new customer signs up on my website, send a welcome message to our #sales Slack channel with their name, email, and signup timestamp. If they\'re from a company domain, also notify #enterprise channel.',
    tags: ['Slack', 'Webhooks'],
    icon: <MessageSquare className="w-5 h-5" />
  },
  {
    id: 'lead-enrichment',
    title: 'Lead Enrichment Pipeline',
    description: 'Automatically research and enrich new leads with company information',
    prompt: 'When a new lead is added to my CRM, look up their company information using their email domain, find their LinkedIn profile, and update their record with company size, industry, and LinkedIn URL.',
    tags: ['CRM', 'Data Enrichment'],
    icon: <Zap className="w-5 h-5" />
  }
]

export default function WorkflowPage() {
  const { next, prev, set, data } = useOnboardingStore()
  const [workflowName, setWorkflowName] = useState(data.workflowName || '')
  const [workflowPrompt, setWorkflowPrompt] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(data.templateId || null)

  const canProceed = canProceedFromStep('workflow', { ...data, workflowName })

  const handleTemplateSelect = (template: typeof workflowTemplates[0]) => {
    setSelectedTemplate(template.id)
    setWorkflowPrompt(template.prompt)
    if (!workflowName) {
      setWorkflowName(template.title)
      set('workflowName', template.title)
    }
    set('templateId', template.id)
  }

  const handleWorkflowNameChange = (value: string) => {
    setWorkflowName(value)
    set('workflowName', value)
  }

  const handleNext = () => {
    if (canProceed) {
      next()
    }
  }

  const selectedApps = data.selectedApps || []

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Workflow className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Create Your First Workflow</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Let's create your first automation. You can start with a template or describe your own workflow in natural language.
          </p>
        </div>

        {/* Selected apps reminder */}
        {selectedApps.length > 0 && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900">Selected Apps</h3>
                  <p className="text-blue-800 text-sm mb-2">
                    Your workflow can connect these apps:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedApps.map(appId => (
                      <Badge key={appId} variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                        {appId.charAt(0).toUpperCase() + appId.slice(1).replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workflow name */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Workflow Details</CardTitle>
            <CardDescription>
              Give your workflow a name and describe what it should do
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Workflow Name</Label>
              <Input
                id="workflow-name"
                placeholder="e.g., Email to Calendar Sync"
                value={workflowName}
                onChange={(e) => handleWorkflowNameChange(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Choose a Template</CardTitle>
            <CardDescription>
              Start with a proven workflow template, or skip to create your own
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-1 gap-4">
              {workflowTemplates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedTemplate === template.id
                      ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-200'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-4">
                      <div className={`p-2 rounded-lg ${
                        selectedTemplate === template.id
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {template.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 mb-1">{template.title}</h3>
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {template.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {selectedTemplate === template.id && (
                          <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                            <p className="text-sm text-gray-700 font-medium mb-1">Workflow Description:</p>
                            <p className="text-sm text-gray-600 italic">{template.prompt}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Custom workflow option */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Or Describe Your Own Workflow</CardTitle>
            <CardDescription>
              Describe what you want to automate in plain English. Our AI will turn it into a working workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="Describe your automation idea... For example: 'When someone fills out our contact form, send them a welcome email and add them to our mailing list. If they're interested in enterprise features, also create a task in our CRM for the sales team to follow up.'"
                value={workflowPrompt}
                onChange={(e) => setWorkflowPrompt(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <div className="flex items-start space-x-2 text-sm text-gray-600">
                <Lightbulb className="w-4 h-4 mt-0.5 text-blue-600" />
                <div>
                  <p className="font-medium">Tips for better workflows:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Be specific about triggers ("When X happens...")</li>
                    <li>Describe the exact actions you want ("Then do Y...")</li>
                    <li>Include any conditions or rules ("If Z, then...")</li>
                    <li>Mention the apps you want to connect</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            onClick={prev}
            variant="outline"
            className="flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {!canProceed && (
          <p className="text-sm text-gray-500 text-center mt-4">
            Please provide a workflow name to continue
          </p>
        )}
      </div>
    </div>
  )
}