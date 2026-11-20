import { users, scores, type User, type InsertUser, type Score, type InsertScore } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, gt } from "drizzle-orm";
import { ships, type ShipId } from "@shared/ships";
import { MAX_AUTHORITATIVE_SCORE } from "./run-authority";

export type Progression = {
  gems: number;
  ownedShips: ShipId[];
  equippedShip: ShipId;
};

export type DailyEntry = { userId: number; username: string; score: number };

export class ProgressionError extends Error {}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createScore(score: InsertScore & { userId: number; runId: string; challengeDate?: string }): Promise<{
    score: Score;
    gemsEarned: number;
    totalGems: number;
    duplicate: boolean;
  }>;
  getTopScores(limit?: number): Promise<(Score & { username: string })[]>;
  getDailyScores(date: string, limit?: number): Promise<DailyEntry[]>;
  getDailyStanding(date: string, userId: number): Promise<{ rank: number; score: number } | null>;
  getProgression(userId: number): Promise<Progression>;
  purchaseShip(userId: number, shipId: ShipId): Promise<Progression>;
  equipShip(userId: number, shipId: ShipId): Promise<Progression>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createScore(score: InsertScore & { userId: number; runId: string; challengeDate?: string }) {
    if (
      !Number.isInteger(score.score) ||
      score.score < 0 ||
      score.score > MAX_AUTHORITATIVE_SCORE
    ) {
      throw new ProgressionError("Invalid authoritative score");
    }

    return db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, score.userId));
      if (!user) throw new ProgressionError("Pilot not found");

      // The unique index on (user, run) decides who wins when the same run is submitted twice at once.
      const [newScore] = await tx.insert(scores).values(score).onConflictDoNothing().returning();
      if (!newScore) {
        const [existing] = await tx
          .select()
          .from(scores)
          .where(and(eq(scores.userId, score.userId), eq(scores.runId, score.runId)));
        return {
          score: existing,
          gemsEarned: 0,
          totalGems: user.gems,
          duplicate: true,
        };
      }

      const gemsEarned = Math.floor(score.score / 10);
      const [updatedUser] = await tx
        .update(users)
        .set({ gems: sql`${users.gems} + ${gemsEarned}` })
        .where(eq(users.id, score.userId))
        .returning();

      return {
        score: newScore,
        gemsEarned,
        totalGems: updatedUser.gems,
        duplicate: false,
      };
    });
  }

  async getTopScores(limit = 10): Promise<(Score & { username: string })[]> {
    const result = await db
      .select({
        id: scores.id,
        score: scores.score,
        userId: scores.userId,
        runId: scores.runId,
        challengeDate: scores.challengeDate,
        username: users.username,
      })
      .from(scores)
      .innerJoin(users, eq(scores.userId, users.id))
      .orderBy(desc(scores.score))
      .limit(limit);
    
    return result;
  }

  /** Each pilot's best run on a day's challenge, highest first (earliest score wins a tie). */
  async getDailyScores(date: string, limit = 20): Promise<DailyEntry[]> {
    const best = sql<number>`max(${scores.score})`;
    const rows = await db
      .select({ userId: scores.userId, username: users.username, score: best })
      .from(scores)
      .innerJoin(users, eq(scores.userId, users.id))
      .where(eq(scores.challengeDate, date))
      .groupBy(scores.userId, users.username)
      .orderBy(desc(best), sql`min(${scores.id})`)
      .limit(limit);
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  }

  /** A pilot's best score on a day and their place among everyone who played it, or null if they have not played. */
  async getDailyStanding(date: string, userId: number) {
    const [mine] = await db
      .select({ score: sql<number>`max(${scores.score})` })
      .from(scores)
      .where(and(eq(scores.challengeDate, date), eq(scores.userId, userId)));
    const score = mine?.score === null || mine?.score === undefined ? null : Number(mine.score);
    if (score === null) return null;

    const [ahead] = await db
      .select({ count: sql<number>`count(*)` })
      .from(
        db
          .select({ userId: scores.userId, best: sql<number>`max(${scores.score})`.as("best") })
          .from(scores)
          .where(eq(scores.challengeDate, date))
          .groupBy(scores.userId)
          .as("daily_best"),
      )
      .where(gt(sql`best`, score));
    return { rank: Number(ahead?.count ?? 0) + 1, score };
  }

  async getProgression(userId: number): Promise<Progression> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new ProgressionError("Pilot not found");
    return this.toProgression(user);
  }

  async purchaseShip(userId: number, shipId: ShipId): Promise<Progression> {
    return db.transaction(async (tx) => {
      // Lock the row so a purchase cannot overwrite gems or ships changed at the same moment.
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!user) throw new ProgressionError("Pilot not found");

      const ownedShips = this.normalizeOwnedShips(user.ownedShips);
      if (ownedShips.includes(shipId)) {
        throw new ProgressionError("Ship already owned");
      }

      const ship = ships[shipId];
      if (user.gems < ship.price) {
        throw new ProgressionError(`You need ${ship.price.toLocaleString()} gems to unlock this ship`);
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          gems: user.gems - ship.price,
          ownedShips: [...ownedShips, shipId],
        })
        .where(eq(users.id, userId))
        .returning();

      return this.toProgression(updatedUser);
    });
  }

  async equipShip(userId: number, shipId: ShipId): Promise<Progression> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new ProgressionError("Pilot not found");

    const ownedShips = this.normalizeOwnedShips(user.ownedShips);
    if (!ownedShips.includes(shipId)) {
      throw new ProgressionError("Purchase this ship before equipping it");
    }

    const [updatedUser] = await db
      .update(users)
      .set({ equippedShip: shipId })
      .where(eq(users.id, userId))
      .returning();

    return this.toProgression(updatedUser);
  }

  private normalizeOwnedShips(value: string[] | null): ShipId[] {
    const validShips = (value || []).filter((ship): ship is ShipId => ship in ships);
    return validShips.includes("vanguard") ? validShips : ["vanguard", ...validShips];
  }

  private toProgression(user: User): Progression {
    const ownedShips = this.normalizeOwnedShips(user.ownedShips);
    const equippedShip = ownedShips.includes(user.equippedShip as ShipId)
      ? (user.equippedShip as ShipId)
      : "vanguard";
    return { gems: user.gems, ownedShips, equippedShip };
  }
}

export const storage = new DatabaseStorage();
