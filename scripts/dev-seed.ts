import { PrismaClient, PlanType, UsageType } from '@prisma/client'

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Starting database seed...')

  try {
    // Clean up existing data
    console.log('🧹 Cleaning up existing data...')
    await prisma.automationRun.deleteMany()
    await prisma.workflowPlan.deleteMany()
    await prisma.automation.deleteMany()
    await prisma.usage.deleteMany()
    await prisma.usageLimit.deleteMany()
    await prisma.organizationMember.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.user.deleteMany()

    // Create test users
    console.log('👤 Creating test users...')
    const user1 = await prisma.user.create({
      data: {
        clerkId: 'user_test_1',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://images.clerk.dev/uploaded/img_1.png',
      },
    })

    const user2 = await prisma.user.create({
      data: {
        clerkId: 'user_test_2',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://images.clerk.dev/uploaded/img_2.png',
      },
    })

    const user3 = await prisma.user.create({
      data: {
        clerkId: 'user_test_3',
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Johnson',
      },
    })

    // Create test organizations
    console.log('🏢 Creating test organizations...')
    const orgFree = await prisma.organization.create({
      data: {
        clerkId: 'org_test_free',
        name: 'Acme Corp (Free)',
        slug: 'acme-corp-free',
        planType: PlanType.FREE,
        imageUrl: 'https://images.clerk.dev/uploaded/org_1.png',
      },
    })

    const orgPro = await prisma.organization.create({
      data: {
        clerkId: 'org_test_pro',
        name: 'TechStart Inc (Pro)',
        slug: 'techstart-inc-pro',
        planType: PlanType.PRO,
        imageUrl: 'https://images.clerk.dev/uploaded/org_2.png',
      },
    })

    const orgEnterprise = await prisma.organization.create({
      data: {
        clerkId: 'org_test_enterprise',
        name: 'BigCorp Enterprise',
        slug: 'bigcorp-enterprise',
        planType: PlanType.ENTERPRISE,
      },
    })

    // Create organization memberships
    console.log('🤝 Creating organization memberships...')
    await prisma.organizationMember.createMany({
      data: [
        {
          userId: user1.clerkId,
          orgId: orgFree.clerkId,
          role: 'owner',
        },
        {
          userId: user2.clerkId,
          orgId: orgFree.clerkId,
          role: 'member',
        },
        {
          userId: user2.clerkId,
          orgId: orgPro.clerkId,
          role: 'owner',
        },
        {
          userId: user3.clerkId,
          orgId: orgPro.clerkId,
          role: 'admin',
        },
        {
          userId: user3.clerkId,
          orgId: orgEnterprise.clerkId,
          role: 'owner',
        },
      ],
    })

    // Create usage limits for each plan
    console.log('📊 Creating usage limits...')
    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() + 1
    const currentYear = currentDate.getFullYear()

    // Free plan limits
    await prisma.usageLimit.createMany({
      data: [
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.AUTOMATION_RUNS,
          monthlyLimit: 100,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.WORKFLOW_EXECUTIONS,
          monthlyLimit: 50,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.API_CALLS,
          monthlyLimit: 1000,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.STORAGE_MB,
          monthlyLimit: 100,
        },
      ],
    })

    // Pro plan limits
    await prisma.usageLimit.createMany({
      data: [
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.AUTOMATION_RUNS,
          monthlyLimit: 10000,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.WORKFLOW_EXECUTIONS,
          monthlyLimit: 5000,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.API_CALLS,
          monthlyLimit: 100000,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.STORAGE_MB,
          monthlyLimit: 10000,
        },
      ],
    })

    // Enterprise plan limits (higher)
    await prisma.usageLimit.createMany({
      data: [
        {
          organizationId: orgEnterprise.clerkId,
          usageType: UsageType.AUTOMATION_RUNS,
          monthlyLimit: 100000,
        },
        {
          organizationId: orgEnterprise.clerkId,
          usageType: UsageType.WORKFLOW_EXECUTIONS,
          monthlyLimit: 50000,
        },
        {
          organizationId: orgEnterprise.clerkId,
          usageType: UsageType.API_CALLS,
          monthlyLimit: 1000000,
        },
        {
          organizationId: orgEnterprise.clerkId,
          usageType: UsageType.STORAGE_MB,
          monthlyLimit: 100000,
        },
      ],
    })

    // Create sample usage data
    console.log('📈 Creating sample usage data...')
    await prisma.usage.createMany({
      data: [
        // Free org usage (approaching limits)
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.AUTOMATION_RUNS,
          amount: 75,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.WORKFLOW_EXECUTIONS,
          amount: 35,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.API_CALLS,
          amount: 850,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgFree.clerkId,
          usageType: UsageType.STORAGE_MB,
          amount: 45,
          month: currentMonth,
          year: currentYear,
        },
        // Pro org usage (well within limits)
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.AUTOMATION_RUNS,
          amount: 2500,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.WORKFLOW_EXECUTIONS,
          amount: 1200,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.API_CALLS,
          amount: 25000,
          month: currentMonth,
          year: currentYear,
        },
        {
          organizationId: orgPro.clerkId,
          usageType: UsageType.STORAGE_MB,
          amount: 2500,
          month: currentMonth,
          year: currentYear,
        },
      ],
    })

    // Create sample automations
    console.log('🤖 Creating sample automations...')
    const automation1 = await prisma.automation.create({
      data: {
        organizationId: orgFree.clerkId,
        name: 'Email Newsletter Automation',
        description: 'Automatically send weekly newsletters to subscribers',
        isActive: true,
        n8nWorkflowId: 'n8n_workflow_1',
      },
    })

    const automation2 = await prisma.automation.create({
      data: {
        organizationId: orgPro.clerkId,
        name: 'Lead Processing Pipeline',
        description: 'Process new leads from multiple sources and route to sales team',
        isActive: true,
        n8nWorkflowId: 'n8n_workflow_2',
      },
    })

    const automation3 = await prisma.automation.create({
      data: {
        organizationId: orgPro.clerkId,
        name: 'Customer Onboarding Flow',
        description: 'Automate customer onboarding tasks and communications',
        isActive: false,
      },
    })

    // Create sample workflow plans
    console.log('📋 Creating sample workflow plans...')
    const plan1 = await prisma.workflowPlan.create({
      data: {
        automationId: automation1.id,
        organizationId: orgFree.clerkId,
        name: 'Newsletter Plan v1.0',
        description: 'Weekly newsletter automation plan',
        planJson: {
          trigger: 'schedule',
          schedule: '0 9 * * 1', // Every Monday at 9 AM
          steps: [
            { type: 'fetch_subscribers', source: 'database' },
            { type: 'generate_content', template: 'weekly_newsletter' },
            { type: 'send_email', provider: 'sendgrid' },
          ],
        },
        n8nJson: {
          nodes: [
            { id: '1', type: 'n8n-nodes-base.schedule', position: [100, 100] },
            { id: '2', type: 'n8n-nodes-base.postgres', position: [300, 100] },
            { id: '3', type: 'n8n-nodes-base.sendGrid', position: [500, 100] },
          ],
          connections: { '1': { main: [[{ node: '2', type: 'main', index: 0 }]] } },
        },
        version: 1,
        isActive: true,
      },
    })

    const plan2 = await prisma.workflowPlan.create({
      data: {
        automationId: automation2.id,
        organizationId: orgPro.clerkId,
        name: 'Lead Processing v2.1',
        description: 'Enhanced lead processing with scoring',
        planJson: {
          trigger: 'webhook',
          steps: [
            { type: 'validate_lead', rules: ['email_required', 'company_size'] },
            { type: 'score_lead', algorithm: 'ml_model_v2' },
            { type: 'route_to_sales', conditions: ['score > 7', 'company_size > 50'] },
            { type: 'send_notification', channels: ['slack', 'email'] },
          ],
        },
        version: 2,
        isActive: true,
      },
    })

    console.log('✅ Database seeded successfully!')
    console.log(`Created:`)
    console.log(`  - 3 users`)
    console.log(`  - 3 organizations (FREE, PRO, ENTERPRISE)`)
    console.log(`  - 5 organization memberships`)
    console.log(`  - 12 usage limits`)
    console.log(`  - 8 usage records`)
    console.log(`  - 3 automations`)
    console.log(`  - 2 workflow plans`)

  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  }
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })