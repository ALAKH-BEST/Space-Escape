import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // Scores API
  app.get(api.scores.list.path, async (req, res) => {
    const topScores = await storage.getTopScores();
    res.json(topScores);
  });

  app.post(api.scores.create.path, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send();
    }
    
    const input = api.scores.create.input.parse(req.body);
    const score = await storage.createScore({
      ...input,
      userId: req.user!.id,
    });
    
    res.status(201).json(score);
  });

  return httpServer;
}
