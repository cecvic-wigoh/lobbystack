import { and, asc, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, businesses, calls, callQualityReviews, transcripts, withBusinessTransaction } from "@lobbystack/db";
import { requirePlatformAdmin } from "../authz";
import type { DomainContext } from "./context";

export const callQualityStatuses = ["unreviewed", "needs_correction", "passed", "resolved"] as const;
export const callQualityFlags = ["retrieval", "incorrect_answer", "incomplete_answer", "latency", "transcription", "handoff", "other"] as const;
export const callQualityReviewSchema = z.object({
  callId: z.string().uuid(),
  status: z.enum(callQualityStatuses),
  flags: z.array(z.enum(callQualityFlags)).max(callQualityFlags.length).transform(values => [...new Set(values)]),
  notes: z.string().trim().max(5000),
}).refine(value => !["needs_correction", "resolved"].includes(value.status) || (value.flags.length > 0 && value.notes.length > 0), {
  message: "Select an issue and describe the correction or retest.",
});

const reviewColumns = {
  callId: calls.id, businessId: calls.businessId, businessName: businesses.name,
  startedAt: calls.startedAt, endedAt: calls.endedAt, transport: calls.transport,
  sessionPurpose: calls.sessionPurpose,
  status: sql<string>`coalesce(${callQualityReviews.status}, 'unreviewed')`,
  flags: sql<string[]>`coalesce(${callQualityReviews.flags}, '[]'::jsonb)`,
  notes: sql<string>`coalesce(${callQualityReviews.notes}, '')`,
  reviewedBy: callQualityReviews.reviewedBy, reviewedAt: callQualityReviews.updatedAt,
};

export async function listCallQualityReviews(context: DomainContext, input: { userId: string; search: string; status?: typeof callQualityStatuses[number]; offset: number }) {
  return withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async tx => {
    await requirePlatformAdmin(tx, input.userId);
    // Derive membership from completed calls so historical and future emailed transcripts cannot miss an import job.
    const rows = await tx.select({ ...reviewColumns, transcriptCount: sql<number>`(select count(*)::int from ${transcripts} where ${transcripts.callId} = ${calls.id} and ${transcripts.businessId} = ${calls.businessId} and ${transcripts.final} = true)` })
      .from(calls).innerJoin(businesses, eq(businesses.id, calls.businessId))
      .leftJoin(callQualityReviews, and(eq(callQualityReviews.callId, calls.id), eq(callQualityReviews.businessId, calls.businessId)))
      .where(and(isNotNull(calls.endedAt), input.status ? sql`coalesce(${callQualityReviews.status}, 'unreviewed') = ${input.status}` : undefined,
        input.search ? ilike(businesses.name, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`) : undefined))
      .orderBy(desc(calls.startedAt), desc(calls.id)).offset(input.offset).limit(51);
    return { calls: rows.slice(0, 50), hasNext: rows.length > 50 };
  });
}

export async function getCallQualityDetail(context: DomainContext, input: { userId: string; callId: string }) {
  return withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async tx => {
    await requirePlatformAdmin(tx, input.userId);
    const [call] = await tx.select(reviewColumns).from(calls).innerJoin(businesses, eq(businesses.id, calls.businessId))
      .leftJoin(callQualityReviews, and(eq(callQualityReviews.callId, calls.id), eq(callQualityReviews.businessId, calls.businessId)))
      .where(and(eq(calls.id, input.callId), isNotNull(calls.endedAt))).limit(1);
    if (!call) throw Object.assign(new Error("Completed call not found."), { status: 404 });
    const transcript = await tx.select({ id: transcripts.id, speaker: transcripts.speaker, text: transcripts.text, sequence: transcripts.sequence })
      .from(transcripts).where(and(eq(transcripts.callId, call.callId), eq(transcripts.businessId, call.businessId), eq(transcripts.final, true))).orderBy(asc(transcripts.sequence));
    await tx.insert(auditLogs).values({ businessId: call.businessId, actorUserId: input.userId, eventType: "platform.call_quality.viewed", entityType: "call", entityId: call.callId });
    return { ...call, transcript };
  });
}

export async function saveCallQualityReview(context: DomainContext, input: z.input<typeof callQualityReviewSchema> & { userId: string }) {
  const review = callQualityReviewSchema.parse(input);
  return withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async tx => {
    await requirePlatformAdmin(tx, input.userId);
    const [call] = await tx.select({ businessId: calls.businessId }).from(calls).where(and(eq(calls.id, review.callId), isNotNull(calls.endedAt))).limit(1);
    if (!call) throw Object.assign(new Error("Completed call not found."), { status: 404 });
    const values = { businessId: call.businessId, status: review.status, flags: review.flags, notes: review.notes, reviewedBy: input.userId, updatedAt: new Date() };
    await tx.insert(callQualityReviews).values({ callId: review.callId, ...values }).onConflictDoUpdate({ target: callQualityReviews.callId, set: values });
    await tx.insert(auditLogs).values({ businessId: call.businessId, actorUserId: input.userId, eventType: "platform.call_quality.reviewed", entityType: "call", entityId: review.callId, payload: { status: review.status, flags: review.flags } });
    return { ok: true as const };
  });
}
