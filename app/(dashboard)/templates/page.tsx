'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { templates, getAllTags, type Template } from '@/lib/templates'
import { useTemplatesStore } from '@/stores/templates'
import {
  Users,
  TrendingUp,
  Share2,
  CreditCard,
  Trophy,
  BarChart3,
  ArrowRight,
  Eye,
  Sparkles,
  Filter,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap = {
  'sales': Users,
  'routing': TrendingUp,
  'crm': Users,
  'support': Users,
  'escalation': TrendingUp,
  'csat': BarChart3,
  'marketing': Share2,
  'social': Share2,
  'content': Share2,
  'billing': CreditCard,
  'payments': CreditCard,
  'retention': TrendingUp,
  'celebration': Trophy,
  'team': Users,
  'reporting': BarChart3,
  'analytics': BarChart3,
  'kpi': BarChart3
}

function TemplatePreview({ template, open, onClose }: {
  template: Template | null
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()

  const handleUseTemplate = () => {
    if (!template) return

    // Store template selection in localStorage for the composer
    localStorage.setItem('selectedTemplate', JSON.stringify({
      id: template.id,
      promptSeed: template.promptSeed
    }))

    // Navigate to the automation builder
    router.push('/dashboard/automations/new')
    onClose()
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            {template.name}
          </DialogTitle>
          <DialogDescription className="text-base">
            {template.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tags */}
          {template.tags && template.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {template.tags.map(tag => {
                const Icon = iconMap[tag as keyof typeof iconMap] || Sparkles
                return (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {tag}
                  </Badge>
                )
              })}
            </div>
          )}

          {/* Prompt Seed */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Template Prompt</h3>
            <Card>
              <CardContent className="p-4">
                <p className="text-gray-700 leading-relaxed">{template.promptSeed}</p>
              </CardContent>
            </Card>
          </div>

          {/* Example Plan */}
          {template.examplePlan && (
            <div>
              <h3 className="font-semibold text-lg mb-3">Example Workflow Structure</h3>
              <Card>
                <CardContent className="p-4">
                  <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto">
                    {JSON.stringify(template.examplePlan, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
            <Button onClick={handleUseTemplate} className="bg-blue-600 hover:bg-blue-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              Use This Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function TemplatesPage() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const { selectedTemplateId, select, clear } = useTemplatesStore()
  const router = useRouter()

  const allTags = getAllTags()

  const filteredTemplates = selectedTag
    ? templates.filter(template => template.tags?.includes(selectedTag))
    : templates

  const handleTemplateSelect = (template: Template) => {
    select(template.id)
    setPreviewTemplate(template)
    setShowPreview(true)
  }

  const handleUseTemplate = (template: Template) => {
    // Store template selection in localStorage for the composer
    localStorage.setItem('selectedTemplate', JSON.stringify({
      id: template.id,
      promptSeed: template.promptSeed
    }))

    // Navigate to the automation builder
    router.push('/dashboard/automations/new')
  }

  const handleClosePreview = () => {
    setShowPreview(false)
    setPreviewTemplate(null)
    clear()
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Automation Templates
        </h1>
        <p className="text-lg text-gray-600">
          Get started quickly with pre-built automation templates for common business workflows
        </p>
      </div>

      {/* Filter Tags */}
      {allTags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedTag === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTag(null)}
              >
                All Templates
              </Button>
              {allTags.map(tag => {
                const Icon = iconMap[tag as keyof typeof iconMap] || Sparkles
                return (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTag(tag)}
                    className="flex items-center gap-1"
                  >
                    <Icon className="w-3 h-3" />
                    {tag}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => {
          const isSelected = selectedTemplateId === template.id

          return (
            <Card
              key={template.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105",
                isSelected && "ring-2 ring-blue-500 shadow-lg"
              )}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg">{template.name}</span>
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {template.tags.slice(0, 2).map(tag => {
                        const Icon = iconMap[tag as keyof typeof iconMap] || Sparkles
                        return (
                          <Icon key={tag} className="w-4 h-4 text-gray-500" />
                        )
                      })}
                    </div>
                  )}
                </CardTitle>
                <CardDescription className="line-clamp-3">
                  {template.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Tags */}
                {template.tags && template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTemplateSelect(template)
                    }}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUseTemplate(template)
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Use Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No templates found
            </h3>
            <p className="text-gray-600 mb-4">
              Try adjusting your filter or browse all templates
            </p>
            <Button variant="outline" onClick={() => setSelectedTag(null)}>
              Show All Templates
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <TemplatePreview
        template={previewTemplate}
        open={showPreview}
        onClose={handleClosePreview}
      />
    </div>
  )
}