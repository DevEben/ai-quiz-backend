import crypto from "crypto";
import { NormalizedPastQuestion } from "@/interfaces/pastQuestion.interface";

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function renderPdfPage(pdfBuffer: Buffer, pageNumber: number) {
  const runtimeRequire = eval("require") as NodeRequire;
  const { PDFParse } = runtimeRequire("pdf-parse") as {
    PDFParse: new (options: { data: Buffer }) => {
      getScreenshot: (params: {
        partial: number[];
        desiredWidth?: number;
        imageBuffer?: boolean;
        imageDataUrl?: boolean;
      }) => Promise<{ pages: Array<{ data: Uint8Array; pageNumber: number }> }>;
      destroy: () => Promise<void>;
    };
  };

  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const screenshot = await parser.getScreenshot({
      partial: [pageNumber],
      desiredWidth: 1200,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const page = screenshot.pages[0];
    return page?.data ? Buffer.from(page.data) : null;
  } finally {
    await parser.destroy();
  }
}

async function uploadToCloudinary({
  image,
  publicId,
  folder,
}: {
  image: Buffer;
  publicId: string;
  folder: string;
}) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signaturePayload).digest("hex");
  const arrayBuffer = image.buffer.slice(
    image.byteOffset,
    image.byteOffset + image.byteLength
  ) as ArrayBuffer;

  const form = new FormData();
  form.append("file", new Blob([arrayBuffer], { type: "image/png" }), `${publicId}.png`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);
  form.append("public_id", publicId);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${details}`);
  }

  const data = await response.json();
  return {
    imageUrl: data.secure_url as string,
    imagePublicId: data.public_id as string,
  };
}

export async function enrichQuestionVisuals({
  questions,
  pdfBuffer,
  importBatchId,
}: {
  questions: NormalizedPastQuestion[];
  pdfBuffer: Buffer;
  importBatchId: string;
}) {
  if (!hasCloudinaryConfig()) {
    return questions.map((question) => (
      question.visual?.description
        ? {
            ...question,
            reviewFlags: [...(question.reviewFlags || []), "cloudinary_not_configured_visual_description_only"],
          }
        : question
    ));
  }

  const pageCache = new Map<number, Buffer | null>();
  const folder = `ai-quiz/past-questions/${importBatchId}`;

  for (const question of questions) {
    const pageNumber = question.visual?.pageNumber;
    if (!pageNumber || question.visual?.imageUrl) continue;

    try {
      if (!pageCache.has(pageNumber)) {
        pageCache.set(pageNumber, await renderPdfPage(pdfBuffer, pageNumber));
      }

      const image = pageCache.get(pageNumber);
      if (!image) {
        question.reviewFlags = [...(question.reviewFlags || []), "visual_page_render_failed"];
        continue;
      }

      const publicId = `${question.exam}-${question.subject}-${question.year}-q${question.questionNumber || "unknown"}-p${pageNumber}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const upload = await uploadToCloudinary({ image, publicId, folder });
      question.visual = {
        ...question.visual,
        imageUrl: upload.imageUrl,
        imagePublicId: upload.imagePublicId,
      };
    } catch (error) {
      question.reviewFlags = [
        ...(question.reviewFlags || []),
        `visual_upload_failed:${error instanceof Error ? error.message : String(error)}`,
      ];
    }
  }

  return questions;
}
