import { hasAIProvider } from "@/lib/ai/provider";

/**
 * Indica ao cliente se existe um provedor de IA configurado no servidor.
 * Permite avisar o usuario antes de subir o PDF.
 */
export async function GET() {
  return Response.json({ aiEnabled: hasAIProvider() });
}
