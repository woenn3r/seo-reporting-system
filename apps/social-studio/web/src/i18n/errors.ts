import { DomainError } from "../domain/actions";
import { translate, type Lang, type Params, type TKey } from "./index";

/** Renders a DomainError in the given language (nested entity/field params are i18n keys). */
export function errorText(lang: Lang, e: DomainError): string {
  const p: Params = { ...e.params };
  for (const k of ["entity", "field"]) if (typeof p[k] === "string") p[k] = translate(lang, p[k] as TKey);
  const key: TKey = e.key; // compile-time proof that every ErrorKey exists in the dictionaries
  return translate(lang, key, p);
}
