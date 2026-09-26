import type { ComponentProps } from "react";

import { Input } from "./input";
import { Label } from "./label";

export function Field({ id, label, ...props }: ComponentProps<typeof Input> & { id: string; label: string }) {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} {...props} /></div>;
}
