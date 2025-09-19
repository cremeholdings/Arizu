#!/usr/bin/env tsx

/**
 * Development script to reset usage counters for testing.
 * Resets monthlyRunsUsed and workflowsCount for an organization.
 *
 * ⚠️  DEV-ONLY SCRIPT - DO NOT RUN IN PRODUCTION ⚠️
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetUsage(orgId?: string) {
  console.log('🚨 DEV-ONLY SCRIPT: Resetting usage counters')
  console.log('⚠️  This script is for development testing only!')
  console.log('')

  try {
    let targetOrgId = orgId

    // If no org ID provided, try to find the demo org
    if (!targetOrgId) {
      console.log('🔍 No org ID provided, looking for demo organization...')
      const demoOrg = await prisma.organization.findFirst({
        where: {
          OR: [
            { clerkId: 'org_demo_limits_test' },
            { slug: 'demo-limits-test' },
            { name: { contains: 'Demo' } }
          ]
        }
      })

      if (demoOrg) {
        targetOrgId = demoOrg.clerkId
        console.log(`   ✓ Found demo org: ${demoOrg.name} (${demoOrg.clerkId})`)
      } else {
        console.log('❌ No demo organization found. Please provide an org ID:')
        console.log('   Usage: npm run reset:usage -- --org-id=<CLERK_ORG_ID>')
        console.log('')
        console.log('Available organizations:')
        const orgs = await prisma.organization.findMany({
          select: { clerkId: true, name: true, planType: true }
        })
        orgs.forEach(org => {
          console.log(`   ${org.clerkId} - ${org.name} (${org.planType})`)
        })
        process.exit(1)
      }
    }

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { clerkId: targetOrgId }
    })

    if (!org) {
      console.error(`❌ Organization not found: ${targetOrgId}`)
      process.exit(1)
    }

    console.log(`🏢 Resetting usage for: ${org.name}`)
    console.log(`   Organization ID: ${org.clerkId}`)
    console.log(`   Plan: ${org.planType}`)
    console.log('')

    // Get current usage before reset
    const currentDate = new Date()
    const periodKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`

    const currentUsage = await prisma.usageCounter.findUnique({
      where: {
        organizationId_periodKey: {
          organizationId: org.clerkId,
          periodKey
        }
      }
    })

    if (currentUsage) {
      console.log('📊 Current usage:')
      console.log(`   Monthly runs: ${currentUsage.monthlyRunsUsed}/${currentUsage.monthlyRunsLimit}`)
      console.log(`   Workflows: ${currentUsage.workflowsCount}`)
      console.log('')
    }

    // Count actual workflows
    const actualWorkflowCount = await prisma.automation.count({
      where: {
        organizationId: org.clerkId,
        isActive: true
      }
    })

    // Reset usage counters
    console.log('🔄 Resetting usage counters...')
    await prisma.usageCounter.upsert({
      where: {
        organizationId_periodKey: {
          organizationId: org.clerkId,
          periodKey
        }
      },
      update: {
        monthlyRunsUsed: 0,
        workflowsCount: actualWorkflowCount
      },
      create: {
        organizationId: org.clerkId,
        periodKey,
        monthlyRunsUsed: 0,
        monthlyRunsLimit: org.planType === 'FREE' ? 100 :
                         org.planType === 'STARTER' ? 1000 :
                         org.planType === 'PRO' ? 10000 : -1,
        workflowsCount: actualWorkflowCount
      }
    })

    // Also reset any automation run status if needed
    console.log('🚀 Updating automation run status...')
    const pendingRuns = await prisma.automationRun.updateMany({
      where: {
        organizationId: org.clerkId,
        status: 'RUNNING'
      },
      data: {
        status: 'SUCCESS',
        completedAt: new Date()
      }
    })

    if (pendingRuns.count > 0) {
      console.log(`   ✓ Updated ${pendingRuns.count} running automations to completed`)
    }

    // Get updated usage
    const updatedUsage = await prisma.usageCounter.findUnique({
      where: {
        organizationId_periodKey: {
          organizationId: org.clerkId,
          periodKey
        }
      }
    })

    console.log('')
    console.log('✅ Usage reset completed!')
    console.log('')
    console.log('📋 Updated usage:')
    if (updatedUsage) {
      console.log(`   Monthly runs: ${updatedUsage.monthlyRunsUsed}/${updatedUsage.monthlyRunsLimit}`)
      console.log(`   Workflows: ${updatedUsage.workflowsCount}`)
    }
    console.log('')
    console.log('🎯 What to test next:')
    console.log('   1. Create new workflows (should work until limit)')
    console.log('   2. Run automations (should work until limit)')
    console.log('   3. To test limits again, run: npm run seed:limits')

  } catch (error) {
    console.error('❌ Error resetting usage:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  let orgId: string | undefined

  for (const arg of args) {
    if (arg.startsWith('--org-id=')) {
      orgId = arg.split('=')[1]
    } else if (arg.startsWith('--help') || arg === '-h') {
      console.log('Reset Usage Script')
      console.log('')
      console.log('Usage:')
      console.log('  npm run reset:usage                    # Reset demo org')
      console.log('  npm run reset:usage -- --org-id=<ID>   # Reset specific org')
      console.log('')
      console.log('Options:')
      console.log('  --org-id=<ID>   Clerk organization ID to reset')
      console.log('  --help, -h      Show this help message')
      process.exit(0)
    }
  }

  return { orgId }
}

// Check if this is being run directly
if (require.main === module) {
  // Environment check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ This script cannot be run in production!')
    process.exit(1)
  }

  const { orgId } = parseArgs()

  console.log('⚠️  DEVELOPMENT SCRIPT WARNING ⚠️')
  console.log('This will modify database usage counters.')
  console.log('')

  resetUsage(orgId).catch((error) => {
    console.error('❌ Unhandled error:', error)
    process.exit(1)
  })
}