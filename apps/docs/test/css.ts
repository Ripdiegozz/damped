// A tiny CSS reader shared by the stylesheet tests. It is not a parser: it only needs the innermost rules of a
// stylesheet and their declarations, which is enough to assert what the theme does and does not paint.

export interface CssRule {
  selector: string;
  body: string;
}

/** The innermost rules of a stylesheet. Rules inside at-rules come out with their own selector. */
export function rulesOf(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]*;/g, "");
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.trim(),
    body: body!,
  }));
}

/** True when one selector of the list targets the element itself, not something inside or beside it. */
export function targets(selectorList: string, subject: RegExp): boolean {
  return selectorList
    .split(",")
    .map((selector) => selector.replace(/:not\([^)]*\)/g, "").trim())
    .some((selector) => subject.test(selector.split(/\s+|>|\+|~/).filter(Boolean).at(-1) ?? ""));
}

/** The `property: value` pairs of a rule body, with the value trimmed. */
export function declarationsOf(body: string): { property: string; value: string }[] {
  return body
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const colon = declaration.indexOf(":");
      return colon < 0 ? [] : [{ property: declaration.slice(0, colon).trim(), value: declaration.slice(colon + 1).trim() }];
    });
}
