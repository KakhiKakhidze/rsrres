import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import serverless from "serverless-http";

dotenv.config();

const app = express();

// ----------------------
// CORS
// ----------------------
app.use(
  cors({
    origin: [
      "http://localhost:3000", // local frontend
      "https://rsrback.vercel.app" // deployed frontend
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ----------------------
// Body parser
// ----------------------
app.use(express.json());

// ----------------------
// Cached MongoDB Connection
// ----------------------
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then((mongoose) => mongoose);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// ----------------------
// Mongoose Schema & Model
// ----------------------
const resultSchema = new mongoose.Schema({
  round: { type: Number, required: true, unique: true },
  mainresults: { type: Object, required: true },
  Legion: { type: Object, required: true },
});

const Result = mongoose.models.Result || mongoose.model("Result", resultSchema);

// ----------------------
// Routes
// ----------------------

// Get all existing rounds
app.get("/rounds", async (req, res) => {
  try {
    await connectToDB();
    const rounds = await Result.find({}, { round: 1, _id: 0 });
    res.json(rounds.map((r) => r.round));
  } catch (err) {
    res.status(500).json({ message: "Error fetching rounds", error: err.message });
  }
});

// Get total scores
app.get("/totals", async (req, res) => {
  try {
    await connectToDB();
    const rounds = await Result.find({});
    const mainTotals = {};
    const legionTotals = {};

    rounds.forEach((round) => {
      Object.entries(round.mainresults || {}).forEach(([team, score]) => {
        mainTotals[team] = (mainTotals[team] || 0) + score;
      });
      Object.entries(round.Legion || {}).forEach(([team, score]) => {
        legionTotals[team] = (legionTotals[team] || 0) + score;
      });
    });

    const sortTotals = (totals) =>
      Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([team, score], index) => ({ rank: index + 1, team, score }));

    res.json({
      main: sortTotals(mainTotals),
      legion: sortTotals(legionTotals),
    });
  } catch (err) {
    res.status(500).json({ message: "Error calculating totals", error: err.message });
  }
});

// Get data for a specific round
app.get("/round/:round", async (req, res) => {
  try {
    await connectToDB();
    const roundNum = parseInt(req.params.round);
    const data = await Result.findOne({ round: roundNum });
    if (!data) return res.status(404).json({ message: "Round not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Error fetching round", error: err.message });
  }
});

// Insert or update round
app.post("/round", async (req, res) => {
  try {
    await connectToDB();
    const { round, mainresults, Legion } = req.body;
    const existing = await Result.findOne({ round });

    if (existing) {
      existing.mainresults = mainresults;
      existing.Legion = Legion;
      await existing.save();
      return res.json({ message: `ტური ${round} წარმატებით განახლდა` });
    }

    const newRound = new Result({ round, mainresults, Legion });
    await newRound.save();
    res.status(201).json({ message: `ტური ${round} წარმატებით დაემატა` });
  } catch (err) {
    res.status(500).json({ message: "შეცდომა", error: err.message });
  }
});

// ----------------------
// Serverless Export
// ----------------------
export const handler = serverless(app);
