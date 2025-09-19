#!/usr/bin/env tsx

/**
 * Development script to seed an organization close to plan limits
 * for testing upgrade flows and limit enforcement.
 *
 * ⚠️  DEV-ONLY SCRIPT - DO NOT RUN IN PRODUCTION ⚠️
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Demo organization and user data
const DEMO_ORG = {
  clerkId: 'org_demo_limits_test',
  name: 'Demo Limits Test Organization',
  slug: 'demo-limits-test',
  planType: 'FREE' as const
}

const DEMO_USER = {
  clerkId: 'user_demo_limits_test',
  email: 'demo-limits@example.com',
  firstName: 'Demo',
  lastName: 'User'
}

// Free plan limits (matching middleware/planGuard.ts)
const FREE_PLAN_LIMITS = {
  maxWorkflows: 3,
  maxStepsPerWorkflow: 5,
  maxMonthlyRuns: 100
}

async function seedLimitDemo() {
  console.log('🚨 DEV-ONLY SCRIPT: Seeding limit demo data')
  console.log('⚠️  This script is for development testing only!')
  console.log('')

  try {
    // Clean up existing demo data
    console.log('🧹 Cleaning up existing demo data...')
    await prisma.automationRun.deleteMany({
      where: { organizationId: DEMO_ORG.clerkId }
    })
    await prisma.workflowPlan.deleteMany({
      where: { organizationId: DEMO_ORG.clerkId }
    })
    await prisma.automation.deleteMany({
      where: { organizationId: DEMO_ORG.clerkId }
    })
    await prisma.usageCounter.deleteMany({
      where: { organizationId: DEMO_ORG.clerkId }
    })
    await prisma.organizationMember.deleteMany({
      where: { orgId: DEMO_ORG.clerkId }
    })
    await prisma.organization.deleteMany({
      where: { clerkId: DEMO_ORG.clerkId }
    })
    await prisma.user.deleteMany({
      where: { clerkId: DEMO_USER.clerkId }
    })

    // Create demo user
    console.log('👤 Creating demo user...')
    const user = await prisma.user.create({
      data: DEMO_USER
    })
    console.log(`   ✓ Created user: ${user.email}`)

    // Create demo organization
    console.log('🏢 Creating demo organization...')
    const org = await prisma.organization.create({
      data: DEMO_ORG
    })
    console.log(`   ✓ Created organization: ${org.name}`)
    console.log(`   ✓ Plan type: ${org.planType}`)

    // Add user to organization
    console.log('🔗 Adding user to organization...')
    await prisma.organizationMember.create({
      data: {
        userId: user.clerkId,
        orgId: org.clerkId,
        role: 'owner'
      }
    })
    console.log('   ✓ User added as owner')

    // Create workflows close to limit (2 out of 3 allowed)
    console.log('⚙️  Creating workflows close to limit...')
    const workflowsToCreate = FREE_PLAN_LIMITS.maxWorkflows - 1 // Leave 1 slot

    for (let i = 1; i <= workflowsToCreate; i++) {
      const automation = await prisma.automation.create({
        data: {
          organizationId: org.clerkId,
          name: `Demo Workflow ${i}`,
          description: `Test workflow ${i} for limit testing`,
          isActive: true,
          n8nWorkflowId: `demo_wf_${i}`
        }
      })

      // Create a workflow plan for each automation
      await prisma.workflowPlan.create({
        data: {
          automationId: automation.id,
          organizationId: org.clerkId,
          name: `Demo Plan ${i}`,
          description: `Test plan ${i}`,
          planJson: {
            name: `Demo Plan ${i}`,
            description: `Test plan ${i}`,
            steps: [
              {
                type: 'trigger.http',
                name: 'HTTP Trigger',
                config: { method: 'POST', path: `/webhook/demo-${i}` }
              },
              {
                type: 'action.slack.postMessage',
                name: 'Send Slack Message',
                config: { channel: '#general', text: 'Demo message' }
              }
            ]
          },
          version: 1,
          isActive: true
        }
      })

      console.log(`   ✓ Created workflow ${i}/${workflowsToCreate}`)
    }

    // Set monthly runs to limit - 1 (99 out of 100 allowed)
    console.log('📊 Setting monthly runs close to limit...')
    const currentDate = new Date()
    const periodKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`

    await prisma.usageCounter.upsert({
      where: {
        organizationId_periodKey: {
          organizationId: org.clerkId,
          periodKey
        }
      },
      update: {
        monthlyRunsUsed: FREE_PLAN_LIMITS.maxMonthlyRuns - 1, // 99/100
        monthlyRunsLimit: FREE_PLAN_LIMITS.maxMonthlyRuns,
        workflowsCount: workflowsToCreate
      },
      create: {
        organizationId: org.clerkId,
        periodKey,
        monthlyRunsUsed: FREE_PLAN_LIMITS.maxMonthlyRuns - 1, // 99/100
        monthlyRunsLimit: FREE_PLAN_LIMITS.maxMonthlyRuns,
        workflowsCount: workflowsToCreate
      }
    })

    console.log(`   ✓ Monthly runs: ${FREE_PLAN_LIMITS.maxMonthlyRuns - 1}/${FREE_PLAN_LIMITS.maxMonthlyRuns}`)
    console.log(`   ✓ Workflows: ${workflowsToCreate}/${FREE_PLAN_LIMITS.maxWorkflows}`)

    // Create some automation runs to show in UI
    console.log('🚀 Creating sample automation runs...')
    const automations = await prisma.automation.findMany({
      where: { organizationId: org.clerkId }
    })

    for (const automation of automations) {
      // Create a few successful runs
      for (let i = 0; i < 3; i++) {
        await prisma.automationRun.create({
          data: {
            automationId: automation.id,
            organizationId: org.clerkId,
            userId: user.clerkId,
            status: 'SUCCESS',
            startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
            completedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
            n8nExecutionId: `demo_exec_${automation.id}_${i}`,
            inputData: { demo: true, run: i },
            outputData: { success: true, processed: true }
          }
        })
      }
    }
    console.log(`   ✓ Created sample runs for ${automations.length} workflows`)

    console.log('')
    console.log('✅ Demo limit seeding completed!')
    console.log('')
    console.log('📋 Summary:')
    console.log(`   Organization: ${org.name} (${org.clerkId})`)
    console.log(`   Plan: ${org.planType}`)
    console.log(`   Workflows: ${workflowsToCreate}/${FREE_PLAN_LIMITS.maxWorkflows} (1 slot remaining)`)
    console.log(`   Monthly Runs: ${FREE_PLAN_LIMITS.maxMonthlyRuns - 1}/${FREE_PLAN_LIMITS.maxMonthlyRuns} (1 run remaining)`)
    console.log('')
    console.log('🎯 What to test next:')
    console.log('   1. Try creating a new workflow → should trigger upgrade dialog')
    console.log('   2. Try running an automation → should trigger upgrade dialog')
    console.log('   3. Try deploying a plan with advanced features → should trigger feature lock dialog')
    console.log('')
    console.log('🧪 Test user credentials:')
    console.log(`   Email: ${user.email}`)
    console.log(`   Clerk ID: ${user.clerkId}`)
    console.log(`   Org Clerk ID: ${org.clerkId}`)
    console.log('')
    console.log('🔄 To reset usage, run: npm run reset:usage')

  } catch (error) {
    console.error('❌ Error seeding limit demo:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Check if this is being run directly
if (require.main === module) {
  // Environment check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ This script cannot be run in production!')
    process.exit(1)
  }

  console.log('⚠️  DEVELOPMENT SCRIPT WARNING ⚠️')
  console.log('This will create/modify database records for testing.')
  console.log('')

  seedLimitDemo().catch((error) => {
    console.error('❌ Unhandled error:', error)
    process.exit(1)
  })
}