// convex/canvas.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getDiscussions = query({
  handler: async (ctx) => {
    return await ctx.db.query("discussions").collect();
  },
});

/**
 * Sets or clears the status of a student.
 */
export const setStudentStatus = mutation({
  args: {
    studentId: v.string(),
    studentName: v.string(),
    status: v.optional(
      v.union(v.literal("claimed"), v.literal("completed"), v.null())
    ),
    facilitatorName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { studentId, studentName, status, facilitatorName } = args;

    const existingStatus = await ctx.db
      .query("student_statuses")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .unique();

    if (!status) {
      if (existingStatus) {
        await ctx.db.delete(existingStatus._id);
      }
      return null;
    }

    if (existingStatus) {
      await ctx.db.patch(existingStatus._id, {
        status: status,
        facilitatorName: facilitatorName,
        statusUpdatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("student_statuses", {
        studentId: studentId,
        studentName: studentName,
        status: status,
        facilitatorName: facilitatorName,
        statusUpdatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Gets the status document for a single student.
 */
export const getStudentStatus = query({
  args: {
    studentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("student_statuses")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .unique();
  },
});

/**
 * Gets all student statuses for the dashboard view.
 */
export const getAllStudentStatuses = query({
  handler: async (ctx) => {
    return await ctx.db.query("student_statuses").collect();
  },
});
