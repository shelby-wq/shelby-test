import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create organization
  const org = await prisma.organization.upsert({
    where: { id: "seed-org-1" },
    update: {},
    create: {
      id: "seed-org-1",
      name: "Demo Investment Group",
      a2pBrand: "Demo Investments",
      a2pCampaignId: "CAMP-DEMO-001",
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash("password123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      passwordHash,
      name: "Admin User",
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  // Create member user
  const member = await prisma.user.upsert({
    where: { email: "member@demo.com" },
    update: {},
    create: {
      email: "member@demo.com",
      passwordHash,
      name: "Team Member",
      role: "MEMBER",
      organizationId: org.id,
    },
  });

  // Create tags
  const tags = await Promise.all(
    ["Hot Lead", "Cash Buyer", "Vacant", "Pre-Foreclosure", "Absentee Owner", "Follow Up"].map(
      (name) =>
        prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name, color: getTagColor(name) },
        })
    )
  );

  // Create sample leads
  const leads = [
    {
      ownerName: "John Smith",
      propertyAddress: "123 Main St",
      mailingAddress: "456 Oak Ave",
      city: "Austin",
      state: "TX",
      zip: "78701",
      status: "NEW" as const,
    },
    {
      ownerName: "Jane Doe",
      propertyAddress: "789 Elm St",
      mailingAddress: "789 Elm St",
      city: "Houston",
      state: "TX",
      zip: "77001",
      status: "CONTACTED" as const,
    },
    {
      ownerName: "Bob Johnson",
      propertyAddress: "321 Pine Rd",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      status: "NEGOTIATING" as const,
    },
    {
      ownerName: "Alice Williams",
      propertyAddress: "555 Cedar Ln",
      mailingAddress: "PO Box 100",
      city: "San Antonio",
      state: "TX",
      zip: "78201",
      status: "UNDER_CONTRACT" as const,
    },
    {
      ownerName: "Charlie Brown",
      propertyAddress: "999 Maple Dr",
      city: "Fort Worth",
      state: "TX",
      zip: "76101",
      status: "DEAD" as const,
    },
  ];

  for (const leadData of leads) {
    const lead = await prisma.lead.create({
      data: {
        ...leadData,
        organizationId: org.id,
      },
    });

    // Add a phone contact point
    await prisma.contactPoint.create({
      data: {
        leadId: lead.id,
        type: "PHONE",
        value: `555-${Math.floor(1000 + Math.random() * 9000)}`,
        source: "seed",
        confidenceScore: 0.9,
        consentStatus: lead.status === "CONTACTED" ? "GRANTED" : "UNKNOWN",
      },
    });

    // Add an email contact point for some
    if (Math.random() > 0.4) {
      await prisma.contactPoint.create({
        data: {
          leadId: lead.id,
          type: "EMAIL",
          value: `${leadData.ownerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          source: "seed",
          confidenceScore: 0.75,
        },
      });
    }

    // Add a tag
    const randomTag = tags[Math.floor(Math.random() * tags.length)];
    await prisma.leadTag.create({
      data: { leadId: lead.id, tagId: randomTag.id },
    });

    // Add a communication for contacted leads
    if (leadData.status !== "NEW") {
      await prisma.communication.create({
        data: {
          leadId: lead.id,
          channel: "CALL",
          direction: "OUTBOUND",
          summary: "Initial outreach call",
          outcome: leadData.status === "DEAD" ? "no_answer" : "interested",
          userId: admin.id,
        },
      });
    }
  }

  console.log("Seed complete:");
  console.log(`  Organization: ${org.name}`);
  console.log(`  Admin: admin@demo.com / password123`);
  console.log(`  Member: member@demo.com / password123`);
  console.log(`  Leads: ${leads.length}`);
  console.log(`  Tags: ${tags.length}`);
}

function getTagColor(name: string): string {
  const colors: Record<string, string> = {
    "Hot Lead": "#ef4444",
    "Cash Buyer": "#22c55e",
    Vacant: "#eab308",
    "Pre-Foreclosure": "#f97316",
    "Absentee Owner": "#3b82f6",
    "Follow Up": "#8b5cf6",
  };
  return colors[name] || "#6b7280";
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
