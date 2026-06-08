export type ParsedPastQuestion = {
  exam: "JAMB" | "WAEC";
  subject: string;
  year: number;
  questionNumber?: number;
  context?: {
    passage?: string;
    imageDescription?: string;
    sharedContextLabel?: string;
  };
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: "A" | "B" | "C" | "D";
  source: "PAST_QUESTION";
};

function normalizeAnswer(answer: string | undefined): "A" | "B" | "C" | "D" | null {
  const value = answer?.trim().toUpperCase();
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : null;
}

function normalizeQuestionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripPdfNoise(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseAnswerKey(text: string) {
  const answers = new Map<number, "A" | "B" | "C" | "D">();
  const matches = text.matchAll(/(?:^|\s)(\d{1,3})\.\s*([ABCD])\b/gi);

  for (const match of matches) {
    const answer = normalizeAnswer(match[2]);
    if (answer) answers.set(Number(match[1]), answer);
  }

  return answers;
}

function parseOptionText(optionText: string) {
  const optionMatch = optionText.match(
    /\(?\s*A\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*B\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*C\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*D\s*\)?[\.)]?\s*([\s\S]+)$/i
  );

  if (!optionMatch) return null;

  return {
    A: normalizeQuestionText(optionMatch[1]),
    B: normalizeQuestionText(optionMatch[2]),
    C: normalizeQuestionText(optionMatch[3]),
    D: normalizeQuestionText(optionMatch[4]),
  };
}

function findNextQuestionNumber(text: string, fromIndex: number) {
  const match = text.slice(fromIndex).match(/(?:^|\n)(\d{1,3})\.\s/);
  return match ? Number(match[1]) : null;
}

function buildContextRanges(questionsText: string) {
  const ranges: Array<{
    start: number;
    end: number;
    label: string;
    passage: string;
  }> = [];

  const explicitRangePattern =
    /((?:In each of|For each of|In)\s+(?:the\s+)?questions?\s+(\d{1,3})\s+(?:to|-|and)\s+(\d{1,3})[\s\S]*?)(?=\n\s*\d{1,3}\.\s)/gi;

  for (const match of questionsText.matchAll(explicitRangePattern)) {
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (!start || !end) continue;

    ranges.push({
      start: Math.min(start, end),
      end: Math.max(start, end),
      label: `Instruction for questions ${Math.min(start, end)}-${Math.max(start, end)}`,
      passage: normalizeQuestionText(match[1]),
    });
  }

  const passagePattern =
    /((PASSAGE\s+[A-ZIVX]+)[\s\S]*?)(?=\n\s*\d{1,3}\.\s)/gi;

  for (const match of questionsText.matchAll(passagePattern)) {
    const startNumber = findNextQuestionNumber(questionsText, (match.index || 0) + match[1].length);
    if (!startNumber) continue;

    ranges.push({
      start: startNumber,
      end: 1000,
      label: match[2],
      passage: normalizeQuestionText(match[1]),
    });
  }

  const prosePassagePattern =
    /(((?:Read|Study)\s+(?:the\s+)?(?:following\s+)?(?:passage|extract|poem|text|conversation|dialogue)[\s\S]*?)(?=\n\s*\d{1,3}\.\s))/gi;

  for (const match of questionsText.matchAll(prosePassagePattern)) {
    const startNumber = findNextQuestionNumber(questionsText, (match.index || 0) + match[1].length);
    if (!startNumber) continue;

    const passage = normalizeQuestionText(match[1]);
    if (passage.length < 80) continue;

    ranges.push({
      start: startNumber,
      end: 1000,
      label: `Passage for questions starting at ${startNumber}`,
      passage,
    });
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  return ranges.map((range, index) => {
    if (range.end !== 1000) return range;

    const next = ranges.find((candidate, candidateIndex) => (
      candidateIndex > index &&
      candidate.start > range.start &&
      candidate.passage !== range.passage
    ));

    return {
      ...range,
      end: next ? next.start - 1 : range.end,
    };
  });
}

function findContextForQuestion(
  questionNumber: number,
  contextRanges: ReturnType<typeof buildContextRanges>
) {
  const matches = contextRanges.filter(
    (range) => questionNumber >= range.start && questionNumber <= range.end
  );

  if (matches.length === 0) return undefined;

  const context = matches[matches.length - 1];
  return {
    passage: context.passage,
    sharedContextLabel: context.label,
  };
}

function looksLikeClozeOptionDump(text?: string) {
  const value = normalizeQuestionText(text || "");
  const bracketedOptions = (value.match(/\[[^\]]*\bA[\.)]\s+[\s\S]*?\bD[\.)]\s+[^\]]*\]/g) || []).length;
  const gaps = (value.match(/(?:â€¦|\.{3})\s*\d{1,3}/g) || []).length;
  return value.length > 350 && (bracketedOptions >= 3 || gaps >= 4);
}

function parseQuestionsWithAnswerKey({
  text,
  exam,
  subject,
  year,
}: {
  text: string;
  exam: "JAMB" | "WAEC";
  subject: string;
  year: number;
}): ParsedPastQuestion[] {
  const normalized = stripPdfNoise(text);
  const yearHeader = new RegExp(`UTME\\s+${year}\\s+USE\\s+OF\\s+ENGLISH\\s+QUESTIONS`, "i");
  const yearMatch = normalized.match(yearHeader);

  if (!yearMatch || yearMatch.index === undefined) return [];

  const fromYear = normalized.slice(yearMatch.index);
  const nextYearMatch = fromYear
    .slice(yearMatch[0].length)
    .match(/\nUTME\s+\d{4}\s+USE\s+OF\s+ENGLISH\s+QUESTIONS/i);
  const yearSection = nextYearMatch?.index === undefined
    ? fromYear
    : fromYear.slice(0, yearMatch[0].length + nextYearMatch.index);

  const answerHeaderMatch = yearSection.match(/\nANSWERS?\s+KEYS?/i);
  if (!answerHeaderMatch || answerHeaderMatch.index === undefined) return [];

  const questionsText = yearSection.slice(0, answerHeaderMatch.index);
  const answersText = yearSection.slice(answerHeaderMatch.index);
  const answerKey = parseAnswerKey(answersText);
  if (answerKey.size === 0) return [];
  const contextRanges = buildContextRanges(questionsText);

  const clozeQuestions: ParsedPastQuestion[] = [];
  const clozeStarts = [...questionsText.matchAll(/(?:…|\.{3})\s*(\d{1,3})\s*(?:…|\.{3})\s*\[([^\]]+)\]/gi)]
    .map((match) => ({
      number: Number(match[1]),
      index: match.index || 0,
      raw: match[0],
      optionText: match[2],
    }))
    .filter((item) => answerKey.has(item.number));
  const clozeNumbers = new Set(clozeStarts.map((item) => item.number));

  for (const cloze of clozeStarts) {
    const correctAnswer = answerKey.get(cloze.number);
    const options = parseOptionText(cloze.optionText);
    if (!correctAnswer || !options) continue;

    const contextStart = Math.max(0, cloze.index - 180);
    const contextEnd = Math.min(questionsText.length, cloze.index + cloze.raw.length + 180);
    const context = questionsText
      .slice(contextStart, contextEnd)
      .replace(cloze.raw, `____ (${cloze.number})`);
    const question = normalizeQuestionText(
      `Choose the most appropriate option for gap ${cloze.number}: ${context}`
    );

    clozeQuestions.push({
      exam,
      subject,
      year,
      context: findContextForQuestion(cloze.number, contextRanges) || {
        passage: question,
        sharedContextLabel: `Cloze passage for question ${cloze.number}`,
      },
      questionNumber: cloze.number,
      question,
      options,
      correctAnswer,
      source: "PAST_QUESTION",
    });
  }

  const lineStarts = [...questionsText.matchAll(/(?:^|\n)(\d{1,3})\.\s/g)]
    .map((match) => ({
      number: Number(match[1]),
      index: (match.index || 0) + (match[0].startsWith("\n") ? 1 : 0),
    }))
    .filter((item) => answerKey.has(item.number));

  const questionStarts = [...lineStarts, ...clozeStarts.map(({ number, index }) => ({ number, index }))]
    .sort((a, b) => a.index - b.index)
    .filter((item, index, list) => index === 0 || item.index !== list[index - 1].index);

  const parsed: ParsedPastQuestion[] = [...clozeQuestions];

  for (let idx = 0; idx < questionStarts.length; idx++) {
    const current = questionStarts[idx];
    const next = questionStarts[idx + 1];
    if (clozeNumbers.has(current.number)) continue;

    const block = questionsText.slice(current.index, next?.index).trim();
    const optionMatch = block.match(
      /^\d{1,3}\.\s*([\s\S]+?)\s+\(?\s*A\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*B\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*C\s*\)?[\.)]?\s*([\s\S]+?)\s+\(?\s*D\s*\)?[\.)]?\s*([\s\S]*)$/i
    );
    const correctAnswer = answerKey.get(current.number);

    if (!optionMatch || !correctAnswer) continue;

    const optionD = optionMatch[5].replace(/\n\s*$/, "");
    const question = normalizeQuestionText(optionMatch[1]);
    const options = {
      A: normalizeQuestionText(optionMatch[2]),
      B: normalizeQuestionText(optionMatch[3]),
      C: normalizeQuestionText(optionMatch[4]),
      D: normalizeQuestionText(optionD),
    };

    if (!question || !options.A || !options.B || !options.C || !options.D) continue;

    parsed.push({
      exam,
      subject,
      year,
      context: (() => {
        const context = findContextForQuestion(current.number, contextRanges);
        return looksLikeClozeOptionDump(context?.passage) ? undefined : context;
      })(),
      questionNumber: current.number,
      question,
      options,
      correctAnswer,
      source: "PAST_QUESTION",
    });
  }

  return parsed.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
}

export function parseJambWaecQuestions({
  text,
  exam,
  subject,
  year,
}: {
  text: string;
  exam: "JAMB" | "WAEC";
  subject: string;
  year: number;
}): ParsedPastQuestion[] {
  const keyedQuestions = parseQuestionsWithAnswerKey({ text, exam, subject, year });
  if (keyedQuestions.length > 0) return keyedQuestions;

  const questions: ParsedPastQuestion[] = [];

  // Normalize text
  const clean = stripPdfNoise(text);

  /**
   * Typical pattern:
   * 12. Which of the following ...
   * A. Option
   * B. Option
   * C. Option
   * D. Option
   * Answer: B
   */

  const blocks = clean.split(/\n(?=\d+[\).\s]\s*)/);

  for (const block of blocks) {
    const qMatch = block.match(/^(\d+)[\).\s]\s*([\s\S]+?)(?=\n\s*(?:A|a)[\).]\s*)/);
    const optionsMatch = block.match(
      /\n\s*(?:A|a)[\).]\s*([\s\S]+?)\n\s*(?:B|b)[\).]\s*([\s\S]+?)\n\s*(?:C|c)[\).]\s*([\s\S]+?)\n\s*(?:D|d)[\).]\s*([\s\S]+?)(?=\n\s*(?:Answer|Ans|Correct\s*Answer)\s*[:\-]?\s*[A-Da-d]|\n\s*\d+[\).\s]|\s*$)/
    );
    const answerMatch = block.match(/(?:Answer|Ans|Correct\s*Answer)\s*[:\-]?\s*([ABCD])/i);
    const correctAnswer = normalizeAnswer(answerMatch?.[1]);

    if (!qMatch || !optionsMatch || !correctAnswer) continue;

    questions.push({
      exam,
      subject,
      year,
      questionNumber: Number(qMatch[1]),
      question: normalizeQuestionText(qMatch[2]),
      options: {
        A: normalizeQuestionText(optionsMatch[1]),
        B: normalizeQuestionText(optionsMatch[2]),
        C: normalizeQuestionText(optionsMatch[3]),
        D: normalizeQuestionText(optionsMatch[4]),
      },
      correctAnswer,
      source: "PAST_QUESTION",
    });
  }

  return questions;
}
