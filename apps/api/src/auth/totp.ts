import { TOTP, URI } from "otpauth";

export function currentTotp(uri: string): string {
  const otp = URI.parse(uri);
  if (!(otp instanceof TOTP)) {
    throw new Error("URI TOTP attendue.");
  }
  return otp.generate();
}
