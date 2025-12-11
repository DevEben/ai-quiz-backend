import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

type SubjectProgress = {
  subject: string;
  quizzes_taken: number;
  questions_answered: number;
  correct_answers: number;
  average_score: number;
  mastery_level: string;
};

type DailyProgress = {
  date: string;
  quizzes_completed: number;
  questions_answered: number;
  correct_answers: number;
};

const masteryLevel = (avg: number) => {
  if (avg >= 85) return "master";
  if (avg >= 70) return "advanced";
  if (avg >= 50) return "intermediate";
  return "beginner";
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const attemptsCollection = await getCollection("attempts");
    const attempts = await attemptsCollection
      .find({ userId: auth.userId })
      .sort({ createdAt: -1 })
      .toArray();

    if (!attempts.length) {
      return NextResponse.json({
        stats: {
          total_quizzes: 0,
          total_questions_answered: 0,
          total_correct_answers: 0,
          average_score: 0,
          current_streak: 0,
          longest_streak: 0,
          total_time_spent: 0,
        },
        subject_progress: [],
        daily_progress: [],
      });
    }

    const total_quizzes = attempts.length;
    const total_questions_answered = attempts.reduce((sum: number, a: typeof attempts[number]) => sum + a.totalQuestions, 0);
    const total_correct_answers = attempts.reduce((sum: number, a: typeof attempts[number]) => sum + a.correctAnswers, 0);
    const average_score = attempts.reduce((sum: number, a: typeof attempts[number]) => sum + a.scorePercent, 0) / total_quizzes;

    // Subject aggregation
    const subjectMap = new Map<string, SubjectProgress>();
    attempts.forEach((a: typeof attempts[number]) => {
      const key = a.subject;
      const existing = subjectMap.get(key) ?? {
        subject: key,
        quizzes_taken: 0,
        questions_answered: 0,
        correct_answers: 0,
        average_score: 0,
        mastery_level: "beginner",
      };
      existing.quizzes_taken += 1;
      existing.questions_answered += a.totalQuestions;
      existing.correct_answers += a.correctAnswers;
      subjectMap.set(key, existing);
    });

    subjectMap.forEach((val) => {
      val.average_score = val.questions_answered
        ? (val.correct_answers / val.questions_answered) * 100
        : 0;
      val.mastery_level = masteryLevel(val.average_score);
    });

    // Daily aggregation (last 14 days)
    const dailyMap = new Map<string, DailyProgress>();
    attempts.forEach((a: typeof attempts[number]) => {
      const dateKey = formatDate(a.createdAt);
      const existing = dailyMap.get(dateKey) ?? {
        date: dateKey,
        quizzes_completed: 0,
        questions_answered: 0,
        correct_answers: 0,
      };
      existing.quizzes_completed += 1;
      existing.questions_answered += a.totalQuestions;
      existing.correct_answers += a.correctAnswers;
      dailyMap.set(dateKey, existing);
    });

    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 13);

    const daily_progress = Array.from(dailyMap.values())
      .filter((d) => new Date(d.date) >= fourteenDaysAgo)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Streaks
    const uniqueDates = Array.from(new Set(attempts.map((a: typeof attempts[number]) => formatDate(a.createdAt)))).sort();
    const dateSet = new Set(uniqueDates);
    let current_streak = 0;
    let cursor = new Date();
    while (true) {
      const key = formatDate(cursor);
      if (dateSet.has(key)) {
        current_streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    let longest_streak = 0;
    let prevDate: Date | null = null;
    let run = 0;
    uniqueDates.forEach((dateStr) => {
      const d = new Date(dateStr + "T00:00:00Z");
      if (prevDate && d.getTime() - prevDate.getTime() === 86_400_000) {
        run += 1;
      } else {
        run = 1;
      }
      longest_streak = Math.max(longest_streak, run);
      prevDate = d;
    });

    return NextResponse.json({
      stats: {
        total_quizzes,
        total_questions_answered,
        total_correct_answers,
        average_score,
        current_streak,
        longest_streak,
        total_time_spent: 0,
      },
      subject_progress: Array.from(subjectMap.values()),
      daily_progress,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to fetch progress" }, { status: 500 });
  }
}

