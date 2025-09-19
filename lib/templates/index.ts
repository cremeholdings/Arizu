export interface Template {
  id: string
  name: string
  description: string
  promptSeed: string
  examplePlan?: object
  tags?: string[]
}

export const templates: Template[] = [
  {
    id: "lead-router",
    name: "Lead Router",
    description: "Automatically route incoming leads to the right sales team based on company size, industry, and location. Includes lead scoring and immediate Slack notifications.",
    promptSeed: "When a new lead fills out our contact form, analyze their company size and industry. If they're enterprise (500+ employees), route to our enterprise sales team and create a high-priority task in HubSpot. For SMB leads, assign to the general sales queue. Send a Slack notification with lead details and suggested next steps.",
    tags: ["sales", "routing", "crm"],
    examplePlan: {
      name: "Lead Router",
      description: "Smart lead routing based on company characteristics",
      steps: [
        {
          type: "trigger.http",
          name: "Contact Form Submission",
          config: {
            method: "POST",
            path: "/webhook/contact-form"
          }
        },
        {
          type: "branch",
          name: "Company Size Check",
          config: {
            condition: "{{$json.company_size}} >= 500",
            trueSteps: [
              {
                type: "action.hubspot.createContact",
                name: "Create Enterprise Contact",
                config: {
                  properties: {
                    priority: "high",
                    lead_source: "website"
                  }
                }
              }
            ],
            falseSteps: [
              {
                type: "action.hubspot.createContact",
                name: "Create SMB Contact",
                config: {
                  properties: {
                    priority: "medium",
                    lead_source: "website"
                  }
                }
              }
            ]
          }
        },
        {
          type: "action.slack.postMessage",
          name: "Notify Sales Team",
          config: {
            channel: "#sales-leads",
            text: "New lead: {{$json.company_name}} ({{$json.company_size}} employees)"
          }
        }
      ]
    }
  },
  {
    id: "csat-escalation",
    name: "CSAT Escalation",
    description: "Monitor customer satisfaction scores and automatically escalate low ratings. Creates support tickets, notifies managers, and triggers follow-up workflows.",
    promptSeed: "When a customer submits a CSAT survey with a score of 3 or below, immediately create a high-priority support ticket in Zendesk, notify the customer success manager via email, and schedule a follow-up call within 24 hours. Include the customer's purchase history and previous support interactions.",
    tags: ["support", "escalation", "csat"],
    examplePlan: {
      name: "CSAT Escalation",
      description: "Automated escalation for low satisfaction scores",
      steps: [
        {
          type: "trigger.http",
          name: "CSAT Survey Response",
          config: {
            method: "POST",
            path: "/webhook/csat-response"
          }
        },
        {
          type: "filter",
          name: "Low Score Filter",
          config: {
            condition: "{{$json.score}} <= 3"
          }
        },
        {
          type: "action.zendesk.createTicket",
          name: "Create Escalation Ticket",
          config: {
            subject: "CSAT Escalation - Score {{$json.score}}",
            priority: "high",
            tags: ["csat", "escalation"]
          }
        },
        {
          type: "action.email.send",
          name: "Notify Manager",
          config: {
            to: "success@company.com",
            subject: "Low CSAT Alert",
            body: "Customer {{$json.customer_name}} gave us a score of {{$json.score}}"
          }
        }
      ]
    }
  },
  {
    id: "blog-to-social",
    name: "Blog → Social",
    description: "Automatically share new blog posts across social media platforms with customized messaging for each channel. Includes hashtag optimization and scheduling.",
    promptSeed: "When a new blog post is published on our website, automatically create social media posts for Twitter, LinkedIn, and Facebook. Customize the message for each platform - Twitter should be concise with relevant hashtags, LinkedIn should be professional with industry insights, and Facebook should be engaging with a call-to-action.",
    tags: ["marketing", "social", "content"],
    examplePlan: {
      name: "Blog → Social",
      description: "Cross-platform blog promotion automation",
      steps: [
        {
          type: "trigger.http",
          name: "New Blog Post",
          config: {
            method: "POST",
            path: "/webhook/blog-published"
          }
        },
        {
          type: "action.twitter.post",
          name: "Tweet Blog Post",
          config: {
            text: "📝 New blog post: {{$json.title}} {{$json.url}} #marketing #automation",
            include_image: true
          }
        },
        {
          type: "action.linkedin.post",
          name: "LinkedIn Update",
          config: {
            text: "We just published a new insight: {{$json.title}}. {{$json.excerpt}} Read more: {{$json.url}}",
            visibility: "PUBLIC"
          }
        },
        {
          type: "action.facebook.post",
          name: "Facebook Post",
          config: {
            message: "Check out our latest blog post! {{$json.title}} - what do you think? {{$json.url}}",
            link: "{{$json.url}}"
          }
        }
      ]
    }
  },
  {
    id: "stripe-dunning",
    name: "Stripe Dunning",
    description: "Handle failed payment attempts with a progressive email sequence. Includes grace periods, account status updates, and automatic subscription management.",
    promptSeed: "When a Stripe payment fails, start a dunning sequence: send a friendly reminder email after 1 day, a more urgent notice after 3 days, and a final warning after 7 days. Update the customer's account status at each step and automatically pause their subscription if payment isn't resolved within 10 days.",
    tags: ["billing", "payments", "retention"],
    examplePlan: {
      name: "Stripe Dunning",
      description: "Progressive payment failure handling",
      steps: [
        {
          type: "trigger.http",
          name: "Payment Failed",
          config: {
            method: "POST",
            path: "/webhook/stripe-payment-failed"
          }
        },
        {
          type: "action.email.send",
          name: "Initial Reminder",
          config: {
            to: "{{$json.customer_email}}",
            subject: "Payment Update Needed",
            template: "payment_reminder_1",
            delay: "1 day"
          }
        },
        {
          type: "action.email.send",
          name: "Urgent Notice",
          config: {
            to: "{{$json.customer_email}}",
            subject: "Urgent: Update Your Payment Method",
            template: "payment_reminder_2",
            delay: "3 days"
          }
        },
        {
          type: "action.email.send",
          name: "Final Warning",
          config: {
            to: "{{$json.customer_email}}",
            subject: "Final Notice: Account Suspension Pending",
            template: "payment_reminder_3",
            delay: "7 days"
          }
        },
        {
          type: "action.stripe.pauseSubscription",
          name: "Pause Subscription",
          config: {
            subscription_id: "{{$json.subscription_id}}",
            delay: "10 days"
          }
        }
      ]
    }
  },
  {
    id: "new-deal-celebrator",
    name: "New Deal Celebrator",
    description: "Celebrate team wins by announcing new deals across communication channels. Includes personalized messages, team recognition, and performance tracking.",
    promptSeed: "When a deal is marked as 'won' in our CRM, celebrate the achievement by posting to our team Slack channel with the deal details and congratulating the sales rep. Send a personalized thank you email to the customer, update our sales dashboard, and if it's a large deal (over $10k), notify leadership via email.",
    tags: ["sales", "celebration", "team"],
    examplePlan: {
      name: "New Deal Celebrator",
      description: "Automated celebration for closed deals",
      steps: [
        {
          type: "trigger.http",
          name: "Deal Won",
          config: {
            method: "POST",
            path: "/webhook/deal-won"
          }
        },
        {
          type: "action.slack.postMessage",
          name: "Team Celebration",
          config: {
            channel: "#sales-wins",
            text: "🎉 {{$json.sales_rep}} just closed a {{$json.deal_value}} deal with {{$json.company_name}}! Way to go! 🚀"
          }
        },
        {
          type: "action.email.send",
          name: "Customer Thank You",
          config: {
            to: "{{$json.customer_email}}",
            subject: "Welcome to the family, {{$json.company_name}}!",
            template: "customer_welcome"
          }
        },
        {
          type: "branch",
          name: "Large Deal Check",
          config: {
            condition: "{{$json.deal_value}} > 10000",
            trueSteps: [
              {
                type: "action.email.send",
                name: "Notify Leadership",
                config: {
                  to: "leadership@company.com",
                  subject: "Major Deal Alert: ${{$json.deal_value}}",
                  body: "{{$json.sales_rep}} closed a ${{$json.deal_value}} deal with {{$json.company_name}}"
                }
              }
            ]
          }
        }
      ]
    }
  },
  {
    id: "weekly-kpi-email",
    name: "Weekly KPI Email",
    description: "Generate and send comprehensive weekly performance reports to stakeholders. Includes metrics aggregation, trend analysis, and actionable insights.",
    promptSeed: "Every Monday at 9 AM, compile our weekly KPI report by pulling data from Google Analytics, Stripe, HubSpot, and our internal database. Calculate metrics like revenue growth, customer acquisition, support ticket volume, and website traffic. Format this into a professional email with charts and send it to all department heads and executives.",
    tags: ["reporting", "analytics", "kpi"],
    examplePlan: {
      name: "Weekly KPI Email",
      description: "Automated weekly performance reporting",
      steps: [
        {
          type: "trigger.schedule",
          name: "Monday Morning Trigger",
          config: {
            cron: "0 9 * * 1",
            timezone: "America/New_York"
          }
        },
        {
          type: "action.analytics.getData",
          name: "Fetch Analytics Data",
          config: {
            source: "google_analytics",
            metrics: ["sessions", "conversions", "revenue"],
            date_range: "last_week"
          }
        },
        {
          type: "action.stripe.getMetrics",
          name: "Fetch Revenue Data",
          config: {
            metrics: ["mrr", "new_customers", "churn_rate"],
            period: "last_week"
          }
        },
        {
          type: "action.hubspot.getMetrics",
          name: "Fetch Sales Data",
          config: {
            metrics: ["deals_closed", "pipeline_value", "lead_volume"],
            period: "last_week"
          }
        },
        {
          type: "action.email.send",
          name: "Send KPI Report",
          config: {
            to: "executives@company.com",
            subject: "Weekly KPI Report - {{$now.format('MMMM DD, YYYY')}}",
            template: "weekly_kpi_report",
            attachments: ["kpi_charts.pdf"]
          }
        }
      ]
    }
  }
]

export function getTemplate(id: string): Template | undefined {
  return templates.find(template => template.id === id)
}

export function getTemplatesByTag(tag: string): Template[] {
  return templates.filter(template => template.tags?.includes(tag))
}

export function getAllTags(): string[] {
  const tagSet = new Set<string>()
  templates.forEach(template => {
    template.tags?.forEach(tag => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
}