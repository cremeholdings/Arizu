'use client'

import { useOnboardingStore, canProceedFromStep } from '@/stores/onboarding'
import { OnboardingNav } from '@/components/OnboardingNav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ArrowLeft, Search, CheckCircle, Plus, Apps, Mail, Calendar, MessageSquare, FileText, Database, ShoppingCart, Users, Briefcase, Star } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AppInfo {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  category: string
  popular?: boolean
}

const availableApps: AppInfo[] = [
  // Communication
  { id: 'gmail', name: 'Gmail', description: 'Email automation and management', icon: <Mail className="w-5 h-5" />, category: 'Communication', popular: true },
  { id: 'slack', name: 'Slack', description: 'Team messaging and notifications', icon: <MessageSquare className="w-5 h-5" />, category: 'Communication', popular: true },
  { id: 'discord', name: 'Discord', description: 'Community and team communication', icon: <MessageSquare className="w-5 h-5" />, category: 'Communication' },
  { id: 'telegram', name: 'Telegram', description: 'Instant messaging and bots', icon: <MessageSquare className="w-5 h-5" />, category: 'Communication' },

  // Productivity
  { id: 'google-calendar', name: 'Google Calendar', description: 'Schedule and calendar management', icon: <Calendar className="w-5 h-5" />, category: 'Productivity', popular: true },
  { id: 'notion', name: 'Notion', description: 'Notes, docs, and project management', icon: <FileText className="w-5 h-5" />, category: 'Productivity', popular: true },
  { id: 'airtable', name: 'Airtable', description: 'Database and project management', icon: <Database className="w-5 h-5" />, category: 'Productivity' },
  { id: 'trello', name: 'Trello', description: 'Kanban boards and task management', icon: <Apps className="w-5 h-5" />, category: 'Productivity' },

  // E-commerce
  { id: 'shopify', name: 'Shopify', description: 'E-commerce platform integration', icon: <ShoppingCart className="w-5 h-5" />, category: 'E-commerce' },
  { id: 'stripe', name: 'Stripe', description: 'Payment processing and billing', icon: <Database className="w-5 h-5" />, category: 'E-commerce' },
  { id: 'woocommerce', name: 'WooCommerce', description: 'WordPress e-commerce', icon: <ShoppingCart className="w-5 h-5" />, category: 'E-commerce' },

  // CRM & Sales
  { id: 'salesforce', name: 'Salesforce', description: 'Customer relationship management', icon: <Users className="w-5 h-5" />, category: 'CRM & Sales' },
  { id: 'hubspot', name: 'HubSpot', description: 'Marketing and sales automation', icon: <Briefcase className="w-5 h-5" />, category: 'CRM & Sales' },
  { id: 'pipedrive', name: 'Pipedrive', description: 'Sales pipeline management', icon: <Briefcase className="w-5 h-5" />, category: 'CRM & Sales' },

  // Development
  { id: 'github', name: 'GitHub', description: 'Code repository and development', icon: <FileText className="w-5 h-5" />, category: 'Development' },
  { id: 'gitlab', name: 'GitLab', description: 'DevOps and code management', icon: <FileText className="w-5 h-5" />, category: 'Development' },
  { id: 'jira', name: 'Jira', description: 'Issue tracking and project management', icon: <Apps className="w-5 h-5" />, category: 'Development' },
]

const categories = ['All', 'Communication', 'Productivity', 'E-commerce', 'CRM & Sales', 'Development']

export default function AppsPage() {
  const { next, prev, set, data } = useOnboardingStore()
  const [selectedApps, setSelectedApps] = useState<string[]>(data.selectedApps || [])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const canProceed = canProceedFromStep('apps', { ...data, selectedApps })

  const filteredApps = availableApps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || app.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const popularApps = availableApps.filter(app => app.popular)

  const handleAppToggle = (appId: string) => {
    const newSelection = selectedApps.includes(appId)
      ? selectedApps.filter(id => id !== appId)
      : [...selectedApps, appId]

    setSelectedApps(newSelection)
    set('selectedApps', newSelection)
  }

  const handleQuickSelect = (apps: string[]) => {
    setSelectedApps(apps)
    set('selectedApps', apps)
  }

  const handleNext = () => {
    if (canProceed) {
      next()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OnboardingNav />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Apps className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Choose Apps</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select the apps and services you want to automate. You can add more later from the integrations page.
          </p>
        </div>

        {/* Selection summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">
                Selected: {selectedApps.length} apps
              </span>
              {selectedApps.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedApps.slice(0, 3).map(appId => {
                    const app = availableApps.find(a => a.id === appId)
                    return app ? (
                      <Badge key={appId} variant="secondary" className="text-xs">
                        {app.name}
                      </Badge>
                    ) : null
                  })}
                  {selectedApps.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{selectedApps.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {selectedApps.length > 0 && (
              <Button
                onClick={() => handleQuickSelect([])}
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Popular apps quick select */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Star className="w-5 h-5 text-yellow-500 mr-2" />
              Popular Combinations
            </CardTitle>
            <CardDescription>
              Quick-start with these commonly used app combinations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <Button
                onClick={() => handleQuickSelect(['gmail', 'google-calendar', 'slack'])}
                variant="outline"
                className="h-auto p-4 text-left justify-start"
              >
                <div>
                  <div className="font-medium">Productivity Suite</div>
                  <div className="text-sm text-gray-600">Gmail + Calendar + Slack</div>
                </div>
              </Button>

              <Button
                onClick={() => handleQuickSelect(['shopify', 'stripe', 'gmail'])}
                variant="outline"
                className="h-auto p-4 text-left justify-start"
              >
                <div>
                  <div className="font-medium">E-commerce Basics</div>
                  <div className="text-sm text-gray-600">Shopify + Stripe + Gmail</div>
                </div>
              </Button>

              <Button
                onClick={() => handleQuickSelect(['github', 'slack', 'jira'])}
                variant="outline"
                className="h-auto p-4 text-left justify-start"
              >
                <div>
                  <div className="font-medium">Development Workflow</div>
                  <div className="text-sm text-gray-600">GitHub + Slack + Jira</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search and filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <Button
                key={category}
                onClick={() => setSelectedCategory(category)}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  selectedCategory === category && "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {/* Apps grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filteredApps.map((app) => {
            const isSelected = selectedApps.includes(app.id)
            return (
              <Card
                key={app.id}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected
                    ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200"
                    : "hover:border-gray-300"
                )}
                onClick={() => handleAppToggle(app.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        isSelected
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-600"
                      )}>
                        {app.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900 truncate">{app.name}</h3>
                          {app.popular && (
                            <Star className="w-3 h-3 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{app.description}</p>
                        <Badge variant="outline" className="text-xs mt-2">
                          {app.category}
                        </Badge>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {filteredApps.length === 0 && (
          <div className="text-center py-12">
            <Apps className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No apps found</h3>
            <p className="text-gray-600">Try adjusting your search or filter criteria</p>
          </div>
        )}

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
            Please select at least one app to continue
          </p>
        )}
      </div>
    </div>
  )
}