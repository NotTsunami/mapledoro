import "react";

// Lets inline styles set CSS custom properties (the --hover-*-to targets in globals.css)
// without casting the whole style object.
declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
