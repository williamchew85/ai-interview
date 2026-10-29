import { test, expect, describe } from "bun:test";
import {
  classifyLine,
  segmentTurns,
  extractTopics,
  shouldAssist,
  questionKey,
} from "@interview-copilot/shared";
import type { TranscriptLine } from "@interview-copilot/shared";

function line(p: Partial<TranscriptLine> & { text: string }): TranscriptLine {
  return { id: p.id ?? Math.random().toString(36).slice(2), speaker: p.speaker ?? "remote", speakerName: p.speakerName, text: p.text, final: p.final ?? true, ts: p.ts ?? Date.now() };
}

describe("classifyLine (Phase 23.1)", () => {
  test("detects a question by '?' and by interrogative opener", () => {
    expect(classifyLine("What did you build?").isQuestion).toBe(true);
    expect(classifyLine("Tell me about a hard bug").isQuestion).toBe(true);
    expect(classifyLine("I shipped the billing service.").isQuestion).toBe(false);
  });
  test("classifies question types", () => {
    expect(classifyLine("Tell me about a time you handled conflict").questionType).toBe("behavioral");
    expect(classifyLine("How would you design a rate limiter?").questionType).toBe("technical");
    expect(classifyLine("What would you do if the deploy failed?").questionType).toBe("situational");
    expect(classifyLine("How are you doing today?").questionType).toBe("smalltalk");
    expect(classifyLine("What's your notice period?").questionType).toBe("factual");
  });
  test("empty text is not a question", () => {
    expect(classifyLine("   ").isQuestion).toBe(false);
  });
});

describe("segmentTurns (Phase 23.2)", () => {
  test("collapses consecutive same-speaker fragments into one turn", () => {
    const turns = segmentTurns([
      line({ speaker: "remote", speakerName: "Alex", text: "Tell me about" }),
      line({ speaker: "remote", speakerName: "Alex", text: "a scaling challenge" }),
      line({ speaker: "local", speakerName: "You", text: "We sharded writes." }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.text).toBe("Tell me about a scaling challenge");
    expect(turns[0]!.classification.isQuestion).toBe(true);
    expect(turns[1]!.speaker).toBe("local");
  });
  test("ignores interim (non-final) lines", () => {
    const turns = segmentTurns([
      line({ text: "partial", final: false }),
      line({ text: "What is your experience?", final: true }),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("What is your experience?");
  });
});

describe("extractTopics (Phase 23.3)", () => {
  test("ranks content words, drops stopwords", () => {
    const turns = segmentTurns([
      line({ text: "Tell me about your database and database indexing experience" }),
      line({ text: "How did you handle database scaling" }),
    ]);
    const topics = extractTopics(turns);
    expect(topics).toContain("database");
    expect(topics).not.toContain("the");
    expect(topics).not.toContain("you");
  });
});

describe("shouldAssist (Phase 23.4)", () => {
  test("interviewee: fires on a new non-smalltalk question", () => {
    const turns = segmentTurns([line({ text: "How would you design a cache?" })]);
    const d = shouldAssist(turns, "interviewee");
    expect(d.assist).toBe(true);
    expect(d.turn?.text).toContain("cache");
  });
  test("interviewee: does not fire on smalltalk", () => {
    const turns = segmentTurns([line({ text: "How are you doing today?" })]);
    expect(shouldAssist(turns, "interviewee").assist).toBe(false);
  });
  test("interviewee: does not re-fire the same handled turn", () => {
    const turns = segmentTurns([line({ text: "What is your experience with Go?" })]);
    const key = questionKey(turns[0]!.text);
    expect(shouldAssist(turns, "interviewee", key).assist).toBe(false);
  });
  test("interviewer: fires on a substantive candidate answer, not a question", () => {
    const answer = segmentTurns([line({ text: "We migrated the monolith to services over two quarters with zero downtime." })]);
    expect(shouldAssist(answer, "interviewer").assist).toBe(true);
    const q = segmentTurns([line({ text: "What should I ask next?" })]);
    expect(shouldAssist(q, "interviewer").assist).toBe(false);
  });
  test("interviewer: ignores a too-short answer", () => {
    const turns = segmentTurns([line({ text: "Yes exactly." })]);
    expect(shouldAssist(turns, "interviewer").assist).toBe(false);
  });
});
