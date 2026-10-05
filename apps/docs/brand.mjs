import { readFileSync } from "node:fs";

// What the Astro config needs from the brand: the palette (read from brand/tokens.css, its single source) and the
// two code themes. Everything the stylesheets paint they take from the same tokens through CSS variables; only the
// syntax colours of the code themes need concrete values, because Expressive Code checks their contrast at build time.

const css = readFileSync(new URL("../../brand/tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The `--name: #hex;` declarations of brand/tokens.css. */
export const tokens = Object.fromEntries(
  [...css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{3,8})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()]),
);

function token(name) {
  const value = tokens[name];
  if (value === undefined) throw new Error(`brand/tokens.css has no ${name}`);
  return value;
}

/** Restrained syntax colours: ink and greys for most of the code, one cool hue for keywords, the accent for strings. */
function codeTheme({ name, type, background, ink, muted, comment, accent, keyword, constant, typeName, property }) {
  const scopes = (list, settings) => ({ scope: list, settings });
  return {
    name,
    type,
    colors: {
      "editor.background": background,
      "editor.foreground": ink,
      focusBorder: accent,
    },
    tokenColors: [
      scopes(["comment", "punctuation.definition.comment", "string.comment"], { foreground: comment, fontStyle: "italic" }),
      scopes(["punctuation", "meta.brace", "meta.delimiter", "keyword.operator", "punctuation.separator"], { foreground: muted }),
      scopes(
        ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "entity.name.tag", "support.type.primitive"],
        { foreground: keyword },
      ),
      scopes(["string.quoted", "punctuation.definition.string", "string.template", "markup.inline.raw"], { foreground: accent }),
      scopes(["constant", "constant.numeric", "constant.language", "support.constant", "variable.other.constant"], { foreground: constant }),
      scopes(["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"], { foreground: typeName }),
      scopes(["variable.other.property", "support.variable.property", "entity.other.attribute-name", "meta.object-literal.key"], { foreground: property }),
      scopes(["entity.name.function", "support.function", "meta.function-call"], { foreground: ink }),
      scopes(["markup.heading", "markup.bold"], { foreground: ink, fontStyle: "bold" }),
      scopes(["markup.underline.link"], { foreground: accent }),
    ],
  };
}

export const codeThemes = [
  codeTheme({
    name: "damped-dark",
    type: "dark",
    background: token("--damped-dark-surface"),
    ink: token("--damped-dark-ink"),
    muted: token("--damped-dark-ink-muted"),
    comment: "#8f8f98",
    accent: token("--damped-accent-text-dark"),
    keyword: "#9db4d6",
    constant: "#b9cbe6",
    typeName: "#c8c8d0",
    property: "#cfd3da",
  }),
  codeTheme({
    name: "damped-light",
    type: "light",
    background: token("--damped-light-surface"),
    ink: token("--damped-light-ink"),
    muted: token("--damped-light-ink-muted"),
    comment: "#6b6b75",
    accent: token("--damped-accent-text-light"),
    keyword: "#2c4f86",
    constant: "#476a9e",
    typeName: "#3f3f46",
    property: "#27272a",
  }),
];
