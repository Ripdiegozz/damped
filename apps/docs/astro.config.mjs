import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { codeThemes, tokens } from "./brand.mjs";

const origin = "https://damped.dagadev.net";
const socialImage = `${origin}/og.png`;
const socialAlt = "damped: spring animations you can interrupt at any moment.";

// Static output in ./dist. The workspace packages resolve to their built `dist/`, so the root
// `bun run build` has to run before this build (`bun run docs:build` assumes it did).
export default defineConfig({
  site: origin,
  base: "/",
  integrations: [
    react(),
    starlight({
      title: "damped",
      description: "Interruptible, physically based spring animations for the web, React and React Native.",
      logo: {
        // The lockup (mark and wordmark) is the whole header title. Two files because an <img> cannot follow the theme.
        dark: "./src/assets/lockup-dark.svg",
        light: "./src/assets/lockup-light.svg",
        replacesTitle: true,
        alt: "damped",
      },
      favicon: "/favicon.svg",
      head: [
        { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "32x32" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
        { tag: "link", attrs: { rel: "manifest", href: "/site.webmanifest" } },
        { tag: "meta", attrs: { name: "theme-color", content: tokens["--damped-dark-paper"] } },
        { tag: "meta", attrs: { property: "og:image", content: socialImage } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: socialAlt } },
        { tag: "meta", attrs: { name: "twitter:image", content: socialImage } },
        { tag: "meta", attrs: { name: "twitter:image:alt", content: socialAlt } },
      ],
      expressiveCode: {
        themes: codeThemes,
        // Everything below is a CSS value, so it follows the page theme through the variables in styles/theme.css.
        // Expressive Code rounds only the outer corners of the whole frame (header and code together). Rounding
        // `pre` or `.frame` from a stylesheet instead detaches the header and doubles the borders.
        styleOverrides: {
          borderRadius: "0.375rem",
          borderWidth: "1px",
          borderColor: "var(--damped-hairline)",
          codeBackground: "var(--damped-surface)",
          codeFontFamily: "var(--sl-font-mono)",
          codeFontSize: "0.8125rem",
          codeLineHeight: "1.65",
          codePaddingBlock: "0.875rem",
          codePaddingInline: "1.125rem",
          uiFontFamily: "var(--sl-font)",
          uiFontSize: "0.75rem",
          scrollbarThumbColor: "var(--damped-hairline-strong)",
          scrollbarThumbHoverColor: "var(--damped-ink-muted)",
          frames: {
            frameBoxShadowCssValue: "none",
            editorBackground: "var(--damped-surface)",
            terminalBackground: "var(--damped-surface)",
            // The title bar and the tab strip are one step lighter than the code, so the header reads as part of the
            // frame without a second border.
            terminalTitlebarBackground: "var(--damped-raised)",
            terminalTitlebarForeground: "var(--damped-ink-muted)",
            terminalTitlebarBorderBottomColor: "var(--damped-hairline)",
            terminalTitlebarDotsForeground: "var(--damped-hairline-strong)",
            terminalTitlebarDotsOpacity: "1",
            editorTabBarBackground: "var(--damped-raised)",
            editorTabBarBorderBottomColor: "var(--damped-hairline)",
            editorActiveTabBackground: "var(--damped-surface)",
            editorActiveTabForeground: "var(--damped-ink)",
            editorActiveTabBorderColor: "var(--damped-hairline)",
            editorActiveTabIndicatorTopColor: "transparent",
            editorActiveTabIndicatorBottomColor: "transparent",
            editorTabBorderRadius: "0",
            inlineButtonForeground: "var(--damped-ink-muted)",
            inlineButtonBackground: "var(--damped-ink)",
            inlineButtonBackgroundIdleOpacity: "0",
            inlineButtonBackgroundHoverOrFocusOpacity: "0.08",
            inlineButtonBackgroundActiveOpacity: "0.14",
            inlineButtonBorder: "var(--damped-hairline-strong)",
            inlineButtonBorderOpacity: "1",
            tooltipSuccessBackground: "var(--damped-ink)",
            tooltipSuccessForeground: "var(--damped-paper)",
          },
        },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/Ripdiegozz/damped" }],
      customCss: ["./src/styles/theme.css", "./src/styles/demos.css", "./src/styles/landing.css", "./src/styles/reference.css", "./src/styles/physics.css"],
      components: {
        // The landing hero holds a live island, which the `hero` frontmatter cannot express.
        Hero: "./src/components/landing/Hero.astro",
      },
      sidebar: [
        { label: "Start here", items: [{ slug: "getting-started" }] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        {
          label: "Reference",
          items: [
            {
              label: "@damped/core",
              items: [
                { slug: "reference/core", label: "Overview" },
                { slug: "reference/core/springs" },
                { slug: "reference/core/scheduler" },
                { slug: "reference/core/spring-value" },
                { slug: "reference/core/animate" },
                { slug: "reference/core/compositor" },
                { slug: "reference/core/layout" },
                { slug: "reference/core/morph" },
                { slug: "reference/core/presence" },
              ],
            },
            { slug: "reference/react" },
            { slug: "reference/native" },
          ],
        },
        // Served by the Northbook playground once it is published next to the docs.
        { label: "Playground", link: "/playground/" },
      ],
    }),
  ],
});
