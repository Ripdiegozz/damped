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
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/Ripdiegozz/damped" }],
      customCss: ["./src/styles/theme.css"],
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
