import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { getCollection } from "@/lib/db";
import { buildEmailHtml, getSmtpStatus, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notificationSchema = z.object({
  channel: z.enum(["email", "in_app", "both"]),
  audience: z.enum(["all", "active", "inactive", "admins", "selected"]),
  userIds: z.array(z.string()).default([]),
  subject: z.string().min(3),
  message: z.string().min(5),
});

function buildAudienceFilter(audience: string, userIds: string[]) {
  if (audience === "active") return { status: { $ne: "inactive" } };
  if (audience === "inactive") return { status: "inactive" };
  if (audience === "admins") return { role: "admin" };
  if (audience === "selected") {
    return {
      _id: {
        $in: userIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)),
      },
    };
  }
  return {};
}

export async function GET(req: Request) {
  const { response } = requireAdmin(req);
  if (response) return response;

  const notifications = await getCollection("notifications");
  const rows = await notifications.find({}).sort({ createdAt: -1 }).limit(30).toArray();

  return NextResponse.json({
    smtp: getSmtpStatus(),
    notifications: rows.map((row: any) => ({
      ...row,
      id: row._id,
      _id: undefined,
    })),
  });
}

export async function POST(req: Request) {
  const { auth, response } = requireAdmin(req);
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = notificationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { channel, audience, userIds, subject, message } = parsed.data;
  const users = await getCollection("users");
  const notifications = await getCollection("notifications");
  const recipients = await users
    .find(buildAudienceFilter(audience, userIds), {
      projection: { email: 1, name: 1, role: 1, status: 1 },
    })
    .limit(500)
    .toArray();

  const now = new Date();
  let inAppCreated = 0;
  let sent = 0;
  const failed: Array<{ email?: string; error: string }> = [];

  if (channel === "in_app" || channel === "both") {
    if (recipients.length > 0) {
      await notifications.insertMany(
        recipients.map((recipient: any) => ({
          userId: recipient._id.toString(),
          title: subject,
          message,
          channel: "in_app",
          audience,
          status: "unread",
          createdBy: auth?.userId,
          createdAt: now,
        }))
      );
      inAppCreated = recipients.length;
    }
  }

  if (channel === "email" || channel === "both") {
    const html = buildEmailHtml(subject, message);
    for (const recipient of recipients as any[]) {
      try {
        await sendEmail({ to: recipient.email, subject, html });
        sent += 1;
      } catch (error) {
        failed.push({
          email: recipient.email,
          error: error instanceof Error ? error.message : "Email failed",
        });
      }
    }
  }

  const campaign = {
    title: subject,
    message,
    channel,
    audience,
    status: failed.length > 0 ? "completed_with_errors" : "completed",
    recipientCount: recipients.length,
    emailSent: sent,
    inAppCreated,
    failed,
    createdBy: auth?.userId,
    createdAt: now,
    type: "campaign",
  };
  const result = await notifications.insertOne(campaign);

  return NextResponse.json({
    campaign: {
      ...campaign,
      id: result.insertedId,
    },
  });
}

