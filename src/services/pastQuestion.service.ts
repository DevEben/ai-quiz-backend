import { PastQuestion } from "@/models/PastQuestion";
import { connectMongoose } from "@/lib/mongoose";

function getSubjectAliases(subject: string) {
  const trimmed = subject.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "english" || lower === "english language" || lower === "use of english") {
    return ["English", "English Language", "Use of English"];
  }

  return [trimmed];
}

export async function getRandomPastQuestions({
  exam,
  subject,
  limit,
}: {
  exam: string;
  subject: string;
  limit: number;
}) {
  await connectMongoose();

  return PastQuestion.aggregate([
    { $match: { exam, subject: { $in: getSubjectAliases(subject) } } },
    { $sample: { size: limit } },
  ]);
}
