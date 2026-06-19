import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { createApp } from "../server";

let app: Express;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!app) {
    app = await createApp({ vercel: true });
  }
  return app(req, res);
}
