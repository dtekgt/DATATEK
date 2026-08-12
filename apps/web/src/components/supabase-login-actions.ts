"use server";

// Server Action del formulario de magic link (`supabase-login-form.tsx`).
// Separado en su propio archivo `"use server"` porque ese tipo de archivo
// solo puede exportar funciones async, nunca el tipo/constante de estado
// inicial — mismo patrón que `cases/[caseId]/actions.ts` +
// `prepare-authorization-form.tsx`.
import { z } from "zod";
import { getSupabaseServerClient } from "../lib/supabase-server";
import { getWebEnv } from "../lib/env";

export interface MagicLinkActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const emailSchema = z.string().trim().email();

export async function requestMagicLinkAction(
  _prev: MagicLinkActionState,
  formData: FormData,
): Promise<MagicLinkActionState> {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const parsedEmail = emailSchema.safeParse(formData.get("email"));

  if (!orgSlug || !parsedEmail.success) {
    return { status: "error", message: "Escribe un correo válido." };
  }

  const supabase = await getSupabaseServerClient();
  const { NEXT_PUBLIC_SITE_URL } = getWebEnv();
  const next = `/pro/o/${orgSlug}/dashboard`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail.data,
    options: {
      emailRedirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "No pudimos enviar el enlace. Intenta de nuevo en unos minutos.",
    };
  }

  return {
    status: "success",
    message: `Enviamos un enlace de acceso a ${parsedEmail.data}. Ábrelo desde este mismo dispositivo.`,
  };
}
