import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Static output in ./dist. The workspace packages resolve to their built `dist/`, so the root
// `bun run build` has to run before this build (`bun run docs:build` assumes it did).
export default defineConfig({
  site: "https://damped.dagadev.net",
  base: "/",
  integrations: [
    react(),
    starlight({
      title: "damped",
      description: "Interruptible, physically based spring animations for the web, React and React Native.",
      logo: {
        // The mark is a spring settling on its target. Two files because an <img> cannot follow the theme colours.
        dark: "./src/assets/logo-dark.svg",
        light: "./src/assets/logo-light.svg",
        alt: "",
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/Ripdiegozz/damped" }],
      customCss: ["./src/styles/theme.css", "./src/styles/demos.css", "./src/styles/landing.css"],
      components: {
        // The landing hero holds a live island, which the `hero` frontmatter cannot express.
        Hero: "./src/components/landing/Hero.astro",
      },
      sidebar: [
        { label: "Start here", items: [{ slug: "getting-started" }] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        {
          label: "Reference",
          items: [{ slug: "reference/core" }, { slug: "reference/react" }, { slug: "reference/native" }],
        },
        // Served by the Northbook playground once it is published next to the docs.
        { label: "Playground", link: "/playground/" },
      ],
    }),
  ],
});
