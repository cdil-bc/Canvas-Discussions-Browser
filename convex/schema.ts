import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    canvas_user_id: v.number(),
    name: v.string(),
    avatar_url: v.string(),
  }).index("by_canvas_user_id", ["canvas_user_id"]),

  discussions: defineTable({
    canvas_discussion_id: v.number(),
    title: v.string(),
    due_at: v.optional(v.string()),
  }).index("by_canvas_discussion_id", ["canvas_discussion_id"]),

  posts: defineTable({
    canvas_post_id: v.number(),
    author_id: v.id("users"),
    discussion_id: v.id("discussions"),
    message: v.string(),
    created_at: v.string(),
  }).index("by_canvas_post_id", ["canvas_post_id"]),

  replies: defineTable({
    canvas_reply_id: v.number(),
    author_id: v.id("users"),
    post_id: v.id("posts"),
    message: v.string(),
    created_at: v.string(),
  }).index("by_canvas_reply_id", ["canvas_reply_id"]),

  student_statuses: defineTable({
    studentId: v.string(), // The Canvas user ID
    studentName: v.string(), // The Canvas user display name
    status: v.optional(v.union(v.literal("claimed"), v.literal("completed"))),
    facilitatorName: v.optional(v.string()),
    statusUpdatedAt: v.optional(v.number()),
  }).index("by_studentId", ["studentId"]),
});
