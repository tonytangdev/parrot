"use server";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const FILE_EXTENSION = "webm";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

export async function initAction() {
  // work around to avoid top level await error
  // https://github.com/vercel/next.js/issues/54282#issuecomment-1880221357
}

export async function getUrlToUpladFile() {
  const fileName = `${crypto.randomUUID()}-${Date.now()}.${FILE_EXTENSION}`;

  const command = new PutObjectCommand({
    ACL: "private",
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
  });

  const url = await getSignedUrl(s3Client, command);

  return { url, fileName };
}
