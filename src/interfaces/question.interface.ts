export interface UnifiedQuestion {
  id: number;
  subject: string;
  instruction?: string;
  passage?: string;
  visual?: {
    imageUrl?: string;
    imagePublicId?: string;
    description?: string;
    label?: string;
    pageNumber?: number;
  };
  contextLabel?: string;
  contextAppliesTo?: {
    startQuestionNumber?: number;
    endQuestionNumber?: number;
  };
  context?: {
    passage?: string;
    imageDescription?: string;
    sharedContextLabel?: string;
  };
  question: string;
  options: string[];
  correctAnswer: number;
  source: "AI" | "PAST_QUESTION";
  year?: number;
  questionNumber?: number;
}
