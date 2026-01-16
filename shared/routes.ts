import { z } from "zod";
import { insertUserSchema, insertScoreSchema, users, scores } from "./schema";

export const api = {
  auth: {
    register: {
      method: "POST" as const,
      path: "/api/register",
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: z.object({ message: z.string() }),
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/login",
      input: insertUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: z.object({ message: z.string() }),
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/logout",
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: "GET" as const,
      path: "/api/user",
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: z.void(),
      },
    },
  },
  scores: {
    list: {
      method: "GET" as const,
      path: "/api/scores",
      responses: {
        200: z.array(
          z.object({
            id: z.number(),
            score: z.number(),
            username: z.string(),
          })
        ),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/scores",
      input: insertScoreSchema,
      responses: {
        201: z.custom<typeof scores.$inferSelect>(),
        401: z.void(),
      },
    },
  },
};
