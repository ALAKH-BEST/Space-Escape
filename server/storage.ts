import { users, scores, type User, type InsertUser, type Score, type InsertScore } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createScore(score: InsertScore & { userId: number }): Promise<Score>;
  getTopScores(limit?: number): Promise<(Score & { username: string })[]>;
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

  async createScore(score: InsertScore & { userId: number }): Promise<Score> {
    const [newScore] = await db.insert(scores).values(score).returning();
    return newScore;
  }

  async getTopScores(limit = 10): Promise<(Score & { username: string })[]> {
    const result = await db
      .select({
        id: scores.id,
        score: scores.score,
        userId: scores.userId,
        username: users.username,
      })
      .from(scores)
      .innerJoin(users, eq(scores.userId, users.id))
      .orderBy(desc(scores.score))
      .limit(limit);
    
    return result;
  }
}

export const storage = new DatabaseStorage();
