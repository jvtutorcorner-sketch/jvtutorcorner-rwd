
"use client";

import { Amplify } from "aws-amplify";
import awsExports from "../src/aws-exports"; // Using committed aws-exports from src/

// aws-exports types may not include the `ssr` flag; cast to `any` to avoid
// TypeScript errors in environments where the generated typings differ.
Amplify.configure({ ...(awsExports as any), ssr: true } as any);

export default function ConfigureAmplify() {
  return null;
}
