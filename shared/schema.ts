import { pgTable, text, serial, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  gems: integer("gems").notNull().default(0),
  ownedShips: text("owned_ships").array().notNull().default(sql`ARRAY['vanguard']::text[]`),
  equippedShip: text("equipped_ship").notNull().default("vanguard"),
});

export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    score: integer("score").notNull(),
    runId: text("run_id"),
    // The UTC day (YYYY-MM-DD) of a daily challenge run; null for ordinary runs.
    challengeDate: text("challenge_date"),
  },
  // One score per run, enforced by the database so two simultaneous submissions cannot both pay out.
  (table) => [
    uniqueIndex("scores_user_run_idx").on(table.userId, table.runId),
    index("scores_challenge_idx").on(table.challengeDate, table.score),
  ],
);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertScoreSchema = createInsertSchema(scores).pick({
  score: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;
