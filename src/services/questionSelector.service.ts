import { getRandomPastQuestions } from "./pastQuestion.service";
import { UnifiedQuestion } from "@/interfaces/question.interface";
import { sanitizePastQuestionForQuiz } from "./pastQuestionSanitizer.service";

export async function selectPastQuestions({
  exam,
  subject,
  count,
  startId,
}: {
  exam: string;
  subject: string;
  count: number;
  startId: number;
}): Promise<UnifiedQuestion[]> {
  const past = await getRandomPastQuestions({
    exam,
    subject,
    limit: count,
  });

  return past.map((q, idx) => {
    const unified: UnifiedQuestion = {
      id: startId + idx,
      subject,
      instruction: q.instruction || (q.context?.sharedContextLabel?.toLowerCase().includes("instruction") ? q.context?.passage : undefined),
      passage: q.passage || (!q.context?.sharedContextLabel?.toLowerCase().includes("instruction") ? q.context?.passage : undefined),
      visual: q.visual || (q.context?.imageDescription ? { description: q.context.imageDescription } : undefined),
      contextLabel: q.contextLabel || q.context?.sharedContextLabel,
      contextAppliesTo: q.contextAppliesTo,
      question: q.question,
      options: [q.options.A, q.options.B, q.options.C, q.options.D],
      correctAnswer: ["A", "B", "C", "D"].indexOf(q.correctAnswer),
      source: "PAST_QUESTION",
      year: q.year,
      questionNumber: q.questionNumber,
    };

    return sanitizePastQuestionForQuiz(unified, {
      question: q.question,
      options: q.options,
      instruction: q.instruction,
      passage: q.passage,
      contextLabel: q.contextLabel,
    });
  });
}
